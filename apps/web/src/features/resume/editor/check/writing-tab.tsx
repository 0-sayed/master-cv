import { Trans } from "@lingui/react/macro";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { ResumeReviewWorkspace, useResumeReviewSummary } from "../proposals/review-panel";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useAssistantCopy } from "@/features/assistant/copy.generated";
export function WritingTab() {
	const summary = useResumeReviewSummary();
	const copy = useAssistantCopy();
	if (summary.state === "loading")
		return <QuerySkeleton shape="rows" label={<Trans>Loading assistant availability…</Trans>} />;
	if (summary.state === "off") {
		return (
			<EmptyState
				icon="sparkle"
				density="compact"
				title={copy("review.assistant.status.disabled")}
				description={copy("review.assistant.disabledHint")}
			/>
		);
	}
	return <ResumeReviewWorkspace />;
}
