import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogCancel,
	AlertDialogAction,
} from "@reactive-resume/ui/components/alert-dialog";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { PrivacyNotice } from "../privacy/notice";
import { SettingsRow, SettingsSection } from "../section";
import { client } from "@/libs/orpc/client";

export function SessionsSection({ sessions }: { sessions: RouterOutput["privacy"]["security"]["sessions"] }) {
	const query = useQueryClient();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	const [showAll, setShowAll] = useState(false);
	const [confirmOthers, setConfirmOthers] = useState(false);
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
	const timestamp = (value: string) => {
		const date = new Date(value);
		const minutes = Math.max(0, Math.round((date.getTime() - now) / 60_000));
		const elapsed = Math.max(0, Math.round((now - date.getTime()) / 60_000));
		const unit = elapsed >= 1440 ? "day" : elapsed >= 60 ? "hour" : "minute";
		const amount = -Math.floor(elapsed / (unit === "day" ? 1440 : unit === "hour" ? 60 : 1));
		const relative = new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto", style: "short" }).format(
			Math.min(minutes, amount),
			unit,
		);
		return (
			<time
				className="type-caption shrink-0 whitespace-nowrap text-ink-2"
				dateTime={value}
				title={formatUiTimestamp(date, i18n.locale === "en-US" ? "en-US" : "ar-SA", {
					dateStyle: "full",
					timeStyle: "long",
				})}
			>{t`Active ${relative}`}</time>
		);
	};
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
			{(showAll ? ordered : ordered.slice(0, 5)).map((item) => (
				<SettingsRow
					key={item.id}
					density="compact"
					icon="globe"
					title={
						<span className="flex min-w-0 items-center gap-2">
							<span dir="auto" className="min-w-0 truncate" title={item.deviceLabel || undefined}>
								{item.deviceLabel || <Trans context="account.devices.unknownBrowser">Unknown browser</Trans>}
							</span>
							{timestamp(item.lastActiveAt ?? item.createdAt)}
						</span>
					}
					status={
						item.current && (
							<Badge variant="accent">
								<Trans context="workspace.privacy.d052579c6a31">This device</Trans>
							</Badge>
						)
					}
				>
					{!item.current && (
						<IconButton
							size="icon"
							label={t({ message: "Sign out", context: "workspace.privacy.48f0d3d397d4" })}
							title={t({ message: "Sign out", context: "workspace.privacy.48f0d3d397d4" })}
							loading={revoke.isPending}
							onClick={() => revoke.mutate({ id: item.id })}
							icon="sign-out"
						/>
					)}
				</SettingsRow>
			))}
			{!showAll && ordered.length > 5 && (
				<Button variant="secondary" onClick={() => setShowAll(true)}>
					<Trans>Show all {ordered.length}</Trans>
				</Button>
			)}
			{sessions.some((item) => !item.current) && (
				<div>
					<Button variant="secondary" loading={revoke.isPending} onClick={() => setConfirmOthers(true)}>
						<Trans context="workspace.privacy.af8ac219f485">Sign out of all other devices</Trans>
					</Button>
				</div>
			)}
			<AlertDialog open={confirmOthers} onOpenChange={setConfirmOthers}>
				<AlertDialogContent>
					<AlertDialogTitle>
						<Trans context="workspace.privacy.af8ac219f485">Sign out of all other devices</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>This device stays signed in. Other devices need to sign in again.</Trans>
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans context="common.actions.cancel">Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmOthers(false);
								revoke.mutate({ others: true });
							}}
						>
							<Trans>Confirm sign out</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}
