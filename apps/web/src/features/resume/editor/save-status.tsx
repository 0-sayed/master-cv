import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Alert, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { SuccessTick } from "@reactive-resume/ui/components/success-tick";
import { cn } from "@reactive-resume/utils/style";
import { useResumeStore } from "@/features/resume/builder/draft";
import { ENTER_CLASS } from "@/libs/motion";

/** The save state under the document name: Saved, Saving…, Offline · saved on this device, or Not saved · Retry. */
export function SaveStatus() {
	const localRecoveryAvailable = useResumeStore((state) => state.localRecoveryAvailable);
	const status = useResumeStore((state) => state.saveStatus);
	const retrySave = useResumeStore((state) => state.retrySave);

	return (
		<span role="status" aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-ink-3">
			{status === "saving" && (
				<>
					<Spinner decorative className="size-3" />
					<Trans>Saving…</Trans>
				</>
			)}
			{(status === "saved" || status === "idle") && (
				<>
					<SuccessTick animated={status === "saved"} />
					<Trans>Saved</Trans>
				</>
			)}
			{status === "offline" && (
				<span className={cn(ENTER_CLASS, "flex min-w-0 items-center gap-1.5 text-warn-text")}>
					<Icon name="cloud-slash" size={16} />
					<span className="truncate">
						{localRecoveryAvailable ? <Trans>Offline · saved on this device</Trans> : <Trans>Not saved</Trans>}
					</span>
				</span>
			)}
			{status === "conflict" && (
				<span className="text-danger-text">
					<Trans context="editor.save.status.conflict">Save conflict</Trans>
				</span>
			)}
			{status === "error" && (
				<span className={cn(ENTER_CLASS, "flex min-w-0 items-center gap-1.5 text-danger-text")}>
					<Icon name="cloud-warning" size={16} />
					<Trans>Not saved</Trans>
					<span aria-hidden="true">·</span>
					<button
						type="button"
						onClick={retrySave}
						aria-label={t`Retry saving`}
						className="rounded-sm font-semibold underline underline-offset-2 hover:opacity-80"
					>
						<Trans>Retry</Trans>
					</button>
				</span>
			)}
		</span>
	);
}

/** Offline edits remain local until the server acknowledges them. */
export function OfflineBanner({ className }: { className?: string }) {
	const offline = useResumeStore((state) => state.saveStatus === "offline");
	if (!offline) return null;

	return (
		<Alert variant="warn" role="status" className={cn(ENTER_CLASS, className)}>
			<Icon name="wifi-slash" size={20} />
			<AlertDescription>
				<Trans>You can keep editing. Reconnect to save your changes to your account.</Trans>
			</AlertDescription>
		</Alert>
	);
}
