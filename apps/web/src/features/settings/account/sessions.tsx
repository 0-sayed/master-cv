import type { RouterOutput } from "@/libs/orpc/client";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { PrivacyNotice } from "../privacy/notice";
import { SettingsRow, SettingsSection } from "../section";
import { client } from "@/libs/orpc/client";

export function SessionsSection({ sessions }: { sessions: RouterOutput["privacy"]["security"]["sessions"] }) {
	const query = useQueryClient();
	const { i18n } = useLingui();
	const revoke = useMutation({
		mutationFn: (input: { id?: string; others?: boolean }) => client.privacy.revokeSessions(input),
		onSuccess: async () => {
			await query.invalidateQueries();
		},
	});
	const ordered = [...sessions].sort(
		(a, b) =>
			Number(b.current) - Number(a.current) ||
			Date.parse(b.lastActiveAt ?? b.createdAt) - Date.parse(a.lastActiveAt ?? a.createdAt),
	);
	const timestamp = (value: string) => (
		<time dateTime={value}>
			{formatUiTimestamp(new Date(value), i18n.locale === "en-US" ? "en-US" : "ar-SA", {
				dateStyle: "medium",
				timeStyle: "short",
			})}
		</time>
	);
	return (
		<SettingsSection
			width="full"
			presentation="card"
			title={<Trans context="workspace.privacy.0ce22f4af7ca">Connected devices</Trans>}
		>
			{revoke.isError && (
				<PrivacyNotice
					error
					title={<Trans context="workspace.privacy.5e2d20ed9961">Could not sign out the device</Trans>}
					action={
						<Button variant="secondary" onClick={() => revoke.reset()}>
							<Trans context="workspace.privacy.d8b8392e2c54">Try again</Trans>
						</Button>
					}
				/>
			)}
			{ordered.map((item) => (
				<SettingsRow
					key={item.id}
					icon="globe"
					title={item.deviceLabel || <Trans context="account.devices.unknownBrowser">Unknown browser</Trans>}
					status={
						item.current && (
							<Badge variant="accent">
								<Trans context="workspace.privacy.d052579c6a31">This device</Trans>
							</Badge>
						)
					}
					description={
						<span className="grid gap-0.5">
							<span>
								<Trans context="account.devices.signedIn">Signed in</Trans> {timestamp(item.createdAt)}
							</span>
							<span>
								<Trans>Last active</Trans> {timestamp(item.lastActiveAt ?? item.createdAt)}
							</span>
						</span>
					}
				>
					{!item.current && (
						<Button variant="secondary" loading={revoke.isPending} onClick={() => revoke.mutate({ id: item.id })}>
							<Trans context="workspace.privacy.48f0d3d397d4">Sign out</Trans>
						</Button>
					)}
				</SettingsRow>
			))}
			{sessions.some((item) => !item.current) && (
				<div>
					<Button variant="secondary" loading={revoke.isPending} onClick={() => revoke.mutate({ others: true })}>
						<Trans context="workspace.privacy.af8ac219f485">Sign out of all other devices</Trans>
					</Button>
				</div>
			)}
		</SettingsSection>
	);
}
