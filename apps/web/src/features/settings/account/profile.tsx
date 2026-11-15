import type { AuthSession } from "@reactive-resume/auth/types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouteContext } from "@tanstack/react-router";
import { useRef } from "react";
import z from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@reactive-resume/ui/components/avatar";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { toast } from "@reactive-resume/ui/components/toast";
import { getInitials } from "@reactive-resume/utils/string";
import { PrivacyNotice } from "../privacy/notice";
import { SettingsRow, SettingsSection } from "../section";
import { useAccountSecurity } from "./auth-hooks";
import { SavedField } from "./saved-field";
import { useDialogStore } from "@/dialogs/store";
import { accountErrorMessage } from "@/features/auth/errors";
import { authClient } from "@/libs/auth/client";
import { client, orpc } from "@/libs/orpc/client";
import { sessionQueryKey } from "@/libs/root-context";

const nameSchema = z.string().trim().min(1).max(64);
const usernameSchema = z
	.string()
	.trim()
	.min(3)
	.max(64)
	.regex(/^[a-z0-9._-]+$/);

type ProfileSectionProps = { session: AuthSession };

export function ProfileSection({ session }: ProfileSectionProps) {
	const router = useRouter();
	const { refetch: refreshSession } = authClient.useSession();
	const queryClient = useQueryClient();
	const user = session.user;
	const open = useDialogStore((s) => s.openDialog);
	const security = useAccountSecurity();
	const { flags } = useRouteContext({ from: "/dashboard" });
	const host = flags.appUrl ? new URL(flags.appUrl).host : null;
	const pendingEmail = useMutation({
		mutationFn: async (action: "resend" | "cancel") => {
			if (action === "resend") await client.privacy.resendEmailChange();
			else await client.privacy.cancelEmailChange();
			await security.refresh();
		},
	});

	const updateUser = async (patch: Parameters<typeof authClient.updateUser>[0]) => {
		const { error } = await authClient.updateUser(patch);
		if (error) return accountErrorMessage(error);
		await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
		await router.invalidate();
		return null;
	};

	return (
		<SettingsSection width="full" presentation="card" title={<Trans>Profile</Trans>}>
			<ProfilePhoto
				name={user.name}
				image={user.image ?? null}
				onChange={async (image) => {
					try {
						await client.auth.updateProfile({ image });
						await refreshSession();
						await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
						await router.invalidate();
						return null;
					} catch {
						return t`Could not save the photo. Try again.`;
					}
				}}
			/>

			<div className="grid gap-3">
				<SavedField
					label={t`Name`}
					value={user.name}
					autoComplete="name"
					validate={(value) => (nameSchema.safeParse(value).success ? null : t`Enter a name, up to 64 characters.`)}
					save={(name) => updateUser({ name })}
				/>
				<SavedField
					label={t`Username`}
					value={user.username ?? ""}
					{...(host ? { prefix: `${host}/` } : {})}
					autoComplete="username"
					validate={(value) =>
						usernameSchema.safeParse(value).success
							? null
							: t`Use 3 to 64 lowercase letters, numbers, dots, hyphens and underscores.`
					}
					save={(username) => updateUser({ username, displayUsername: username })}
				/>
			</div>
			<SettingsRow
				icon="envelope"
				status={
					<Badge variant={user.emailVerified ? "accent" : "warn"}>
						{user.emailVerified ? <Trans>Verified</Trans> : <Trans>Not verified</Trans>}
					</Badge>
				}
				title={<Trans>Email</Trans>}
				description={<bdi dir="ltr">{user.email}</bdi>}
			>
				<Button variant="secondary" onClick={() => open("auth.change-email", undefined)}>
					<Trans context="account.email.change">Change email address</Trans>
				</Button>
			</SettingsRow>
			{pendingEmail.isError && (
				<PrivacyNotice error title={<Trans>Email change could not be updated</Trans>}>
					<Trans>Try again. Your current email is unchanged.</Trans>
				</PrivacyNotice>
			)}
			{security.status === "ready" && security.data.pendingEmail && (
				<PrivacyNotice
					title={
						security.data.pendingEmail.stage === "confirm_old" ? (
							<Trans>Confirm at your current email</Trans>
						) : (
							<Trans context="account.email.status.pending">Awaiting new email verification</Trans>
						)
					}
					action={
						<>
							<Button
								variant="secondary"
								loading={pendingEmail.isPending}
								onClick={() => pendingEmail.mutate("resend")}
							>
								<Trans>Resend</Trans>
							</Button>
							<Button
								variant="secondary"
								loading={pendingEmail.isPending}
								onClick={() => pendingEmail.mutate("cancel")}
							>
								<Trans context="workspace.privacy.19766ed6ccb2">Cancel</Trans>
							</Button>
						</>
					}
				>
					<bdi dir="ltr">{security.data.pendingEmail.confirmationAddress}</bdi>
					<p>
						<Trans context="workspace.privacy.d100504410ec">
							Your current email stays active until the change is verified.
						</Trans>
					</p>
				</PrivacyNotice>
			)}
		</SettingsSection>
	);
}

type ProfilePhotoProps = {
	name: string;
	image: string | null;
	onChange: (image: string | null) => Promise<string | null>;
};

/** The account photo, shown in the app. Resumes keep their own picture. */
function ProfilePhoto({ name, image, onChange }: ProfilePhotoProps) {
	const input = useRef<HTMLInputElement>(null);
	const upload = useMutation(orpc.storage.uploadFile.mutationOptions({ meta: { noInvalidate: true } }));

	const choose = (file: File | undefined) => {
		if (!file) return;
		upload.mutate(file, {
			onSuccess: async ({ url }) => {
				const failure = await onChange(url);
				toast.add({
					type: failure ? "error" : "success",
					description: failure ?? t({ message: "Saved", context: "editor.save.status.saved" }),
				});
			},
			onError: (error) => toast.add({ type: "error", description: accountErrorMessage(error) }),
			onSettled: () => {
				if (input.current) input.current.value = "";
			},
		});
	};

	return (
		<SettingsRow
			title={
				<Avatar size="preview">
					<AvatarImage src={image ?? undefined} alt="" />
					<AvatarFallback>{getInitials(name)}</AvatarFallback>
				</Avatar>
			}
		>
			<input
				ref={input}
				type="file"
				accept="image/*"
				className="sr-only"
				tabIndex={-1}
				aria-hidden
				onChange={(event) => choose(event.target.files?.[0])}
			/>
			<Button variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}>
				<Trans>Change photo</Trans>
			</Button>
			{image && (
				<Button
					variant="secondary"
					onClick={async () => {
						const failure = await onChange(null);
						toast.add({
							type: failure ? "error" : "success",
							description: failure ?? t({ message: "Saved", context: "editor.save.status.saved" }),
						});
					}}
				>
					<Trans context="workspace.privacy.c3812fc4acb8">Remove</Trans>
				</Button>
			)}
		</SettingsRow>
	);
}
