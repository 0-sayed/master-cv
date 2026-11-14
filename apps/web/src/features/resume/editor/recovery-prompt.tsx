import { Trans } from "@lingui/react/macro";
import { Alert, AlertDescription, AlertTitle, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useResumeStore } from "@/features/resume/builder/draft";

/** Recovery never applies stored content until the owner chooses it. */
export function RecoveryPrompt() {
	const draft = useResumeStore((state) => state.recoveryDraft);
	const restore = useResumeStore((state) => state.restoreLocalDraft);
	const discard = useResumeStore((state) => state.discardLocalDraft);
	if (!draft) return null;
	return (
		<Alert variant="warn">
			<Icon name="clock-counter-clockwise" />
			<AlertTitle>
				<Trans>Unsaved changes on this device</Trans>
			</AlertTitle>
			<AlertDescription>
				<p>
					<Trans>Review your local changes before restoring them.</Trans>
				</p>
			</AlertDescription>
			<AlertActions>
				<Button onClick={restore}>
					<Trans>Restore local changes</Trans>
				</Button>
				<Button variant="secondary" onClick={discard}>
					<Trans>Discard local changes</Trans>
				</Button>
			</AlertActions>
		</Alert>
	);
}
