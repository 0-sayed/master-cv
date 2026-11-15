import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { toast } from "@reactive-resume/ui/components/toast";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { PrivacyNotice } from "../privacy/notice";
import { SettingsRow, SettingsSection } from "../section";
import { useAccountSecurity } from "./auth-hooks";
import { SessionsSection } from "./sessions";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useDialogStore } from "@/dialogs/store";
import { accountErrorMessage } from "@/features/auth/errors";
import { useConfirm, usePrompt } from "@/hooks/use-confirm";
import { authClient } from "@/libs/auth/client";

export function SecuritySection() {
	const state = useAccountSecurity();
	const open = useDialogStore((s) => s.openDialog);
	if (state.status === "loading")
		return (
			<QuerySkeleton
				shape="settings"
				label={<Trans context="workspace.privacy.442c685cdd24">Loading security settings…</Trans>}
			/>
		);
	const known = state.data?.credentials;
	return (
		<>
			<SettingsSection
				width="full"
				presentation="card"
				title={<Trans context="workspace.privacy.7cd0c781e3b6">Sign-in & security</Trans>}
			>
				{state.status === "error" && (
					<PrivacyNotice
						error
						title={<Trans context="workspace.privacy.6c763673c652">Security settings are unavailable</Trans>}
						action={
							<Button variant="secondary" onClick={() => void state.refresh()}>
								<Trans context="workspace.privacy.d8b8392e2c54">Try again</Trans>
							</Button>
						}
					>
						<Trans context="workspace.privacy.112a2d4e3554">
							Enrollment is unknown. Previously loaded information may be out of date.
						</Trans>
					</PrivacyNotice>
				)}
				{known && (
					<>
						<SettingsRow
							icon="lock"
							status={
								<Badge variant={known.hasPassword ? "accent" : "neutral"}>
									{known.hasPassword ? <Trans>Set</Trans> : <Trans>Not set</Trans>}
								</Badge>
							}
							title={<Trans context="workspace.privacy.e7cf3ef4f17c">Password</Trans>}
							description={
								known.hasPassword ? (
									<Trans context="workspace.privacy.5becaca237be">Password is set</Trans>
								) : (
									<Trans context="workspace.privacy.7bed214aae60">You sign in without one</Trans>
								)
							}
						>
							{known.hasPassword ? (
								<Button
									variant="secondary"
									disabled={state.status !== "ready"}
									onClick={() => open("auth.change-password", undefined)}
								>
									<Trans context="workspace.privacy.c0bf75bd78bf">Change</Trans>
								</Button>
							) : (
								<Link to="/auth/forgot-password" className={buttonVariants({ variant: "secondary" })}>
									<Trans context="workspace.privacy.1b10004d07d8">Set a password</Trans>
								</Link>
							)}
						</SettingsRow>
						<SettingsRow
							icon="shield-check"
							status={
								<Badge variant={known.mfaEnabled ? "accent" : "neutral"}>
									{known.mfaEnabled ? <Trans>On</Trans> : <Trans>Off</Trans>}
								</Badge>
							}
							title={<Trans context="workspace.privacy.7c0ff7eab32d">Two-step verification</Trans>}
							description={
								known.mfaEnabled ? (
									<Trans context="workspace.privacy.e77d274f0cab">Two-step verification is enabled</Trans>
								) : (
									<Trans context="workspace.privacy.ae30fd938ae2">Two-step verification is not enabled</Trans>
								)
							}
						>
							{known.hasPassword && (
								<Button
									variant="secondary"
									disabled={state.status !== "ready"}
									onClick={() =>
										open(known.mfaEnabled ? "auth.two-factor.disable" : "auth.two-factor.enable", undefined)
									}
								>
									{known.mfaEnabled ? <Trans>Turn off</Trans> : <Trans>Set up</Trans>}
								</Button>
							)}
						</SettingsRow>
						{state.status === "ready" && <Passkeys />}
					</>
				)}
			</SettingsSection>
			{state.status === "ready" && <SessionsSection sessions={state.data.sessions} />}
		</>
	);
}

const PASSKEYS_KEY = ["auth", "passkeys"];

function Passkeys() {
	const { i18n } = useLingui();
	const queryClient = useQueryClient();
	const prompt = usePrompt();
	const confirm = useConfirm();
	const {
		data: passkeys = [],
		isPending: passkeysPending,
		isError,
		refetch,
	} = useQuery({
		queryKey: PASSKEYS_KEY,
		queryFn: async () => {
			const result = await authClient.passkey.listUserPasskeys();
			if (result.error) throw new Error("PASSKEYS_UNAVAILABLE");
			return result;
		},
		select: ({ data }) => data ?? [],
	});
	const refresh = () => queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY });
	const failed = (error: unknown) => toast.add({ type: "error", description: accountErrorMessage(error) });

	const add = useMutation({
		mutationFn: async () => {
			const { data, error } = await authClient.passkey.addPasskey();
			if (error) return failed(error);
			await refresh();
			const name = await prompt(t`Name this passkey`, {
				description: t`A name helps you tell passkeys apart, like "Work laptop".`,
				defaultValue: "",
				confirmText: t`Save`,
			});
			const id = typeof data?.id === "string" ? data.id : null;
			if (!id || !name?.trim()) return;
			const renamed = await authClient.passkey.updatePasskey({ id, name: name.trim() });
			if (renamed.error) return failed(renamed.error);
			await refresh();
		},
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			if (
				!(await confirm(t`Remove this passkey?`, {
					description: t`It will no longer sign you in.`,
					confirmText: t`Remove`,
					variant: "danger",
				}))
			)
				return;
			const { error } = await authClient.passkey.deletePasskey({ id });
			if (error) return failed(error);
			await refresh();
		},
	});
	const rename = useMutation({
		mutationFn: async (passkey: (typeof passkeys)[number]) => {
			const name = await prompt(t`Name this passkey`, { defaultValue: passkey.name ?? "", confirmText: t`Save` });
			if (!name?.trim()) return;
			const { error } = await authClient.passkey.updatePasskey({ id: passkey.id, name: name.trim() });
			if (error) return failed(error);
			await refresh();
		},
	});

	return (
		<div className="grid">
			<SettingsRow
				icon="key"
				status={
					<QuerySkeleton loading={passkeysPending} shape="badge" inline>
						<Badge>{isError ? <Trans>Unknown</Trans> : <Trans>{passkeys.length} saved</Trans>}</Badge>
					</QuerySkeleton>
				}
				title={<Trans context="workspace.privacy.c87ccdb428e6">Passkeys</Trans>}
				description={
					<Trans context="workspace.privacy.ff70ac11c171">Sign in with your fingerprint, face or device PIN</Trans>
				}
			>
				<Button
					variant="secondary"
					loading={add.isPending}
					disabled={isError || passkeysPending}
					onClick={() => add.mutate()}
				>
					<Trans context="workspace.privacy.ffc92f64f0e4">Add passkey</Trans>
				</Button>
			</SettingsRow>
			<>
				{isError && (
					<PrivacyNotice
						error
						title={<Trans context="workspace.privacy.b107b9b8706f">Passkeys are unavailable</Trans>}
						action={
							<Button variant="secondary" onClick={() => void refetch()}>
								<Trans context="workspace.privacy.d8b8392e2c54">Try again</Trans>
							</Button>
						}
					/>
				)}
				<QuerySkeleton loading={passkeysPending} shape="settings" count={1}>
					{passkeys.length > 0 && (
						<ul className="ms-4 grid border-s border-line ps-3">
							{passkeys.map((passkey) => (
								<li key={passkey.id}>
									<SettingsRow
										title={<bdi className="break-words">{passkey.name || t`Unnamed passkey`}</bdi>}
										description={
											passkey.createdAt ? (
												<Trans>
													Added{" "}
													{formatUiTimestamp(new Date(passkey.createdAt), i18n.locale === "en-US" ? "en-US" : "ar-SA", {
														dateStyle: "medium",
													})}
												</Trans>
											) : undefined
										}
									>
										<Button
											variant="ghost"
											disabled={isError || passkeysPending || rename.isPending}
											onClick={() => rename.mutate(passkey)}
										>
											<Trans context="workspace.privacy.3064d79a295c">Rename</Trans>
										</Button>
										<Button
											variant="ghost"
											disabled={isError || passkeysPending || remove.isPending}
											aria-label={t`Remove ${passkey.name || t`Unnamed passkey`}`}
											onClick={() => remove.mutate(passkey.id)}
										>
											<Trans context="workspace.privacy.c3812fc4acb8">Remove</Trans>
										</Button>
									</SettingsRow>
								</li>
							))}
						</ul>
					)}
				</QuerySkeleton>
			</>
		</div>
	);
}
