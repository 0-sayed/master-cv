import type { CheckIssue } from "./issues";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { Trans } from "@lingui/react/macro";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
export function WritingTab(_props: { data: ResumeData; issues: readonly CheckIssue[] }) {
	return (
		<Alert>
			<AlertTitle>
				<Trans>Writing suggestions are not available yet</Trans>
			</AlertTitle>
			<AlertDescription>
				<Trans>
					Deterministic content checks remain available. AI suggestions require approved consent and private processing.
				</Trans>
			</AlertDescription>
		</Alert>
	);
}
