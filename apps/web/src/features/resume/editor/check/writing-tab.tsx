import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useAssistantCopy } from "@/features/assistant/copy.generated";
import { deriveAssistantState } from "@/features/assistant/operation-state";
import { orpc } from "@/libs/orpc/client";
export function WritingTab() {
	const copy = useAssistantCopy();
	const availability = useQuery(orpc.ai.availability.queryOptions());
	const usage = useQuery(orpc.ai.usage.get.queryOptions());
	const state =
		availability.error || usage.error
			? "unavailable"
			: availability.data && usage.data
				? deriveAssistantState(availability.data, usage.data, null, null, "idle").state
				: "loading";
	if (state === "loading")
		return <QuerySkeleton shape="rows" count={1} label={<Trans>Loading assistant availability…</Trans>} />;
	return (
		<Alert variant={state === "unavailable" ? "warn" : "info"}>
			<Icon name={state === "exhausted" ? "info" : "warning-circle"} />
			<AlertTitle>
				{state === "exhausted" ? (
					copy("billing.usage.startOperationsLabel")
				) : state === "unavailable" ? (
					copy("review.assistant.error.unavailableTitle")
				) : state === "busy" ? (
					<Trans>An operation is already in progress. Your writing is kept.</Trans>
				) : (
					<Trans>Writing suggestions are not available yet</Trans>
				)}
			</AlertTitle>
			<AlertDescription>
				{state === "exhausted" ? (
					copy("billing.usage.startOperationsLimitHint")
				) : state === "unavailable" ? (
					copy("review.assistant.error.unavailableHint")
				) : state === "busy" ? null : (
					<Trans>
						Deterministic content checks remain available. AI suggestions require approved consent and private
						processing.
					</Trans>
				)}
				{state === "unavailable" && (
					<Button
						variant="secondary"
						onClick={() => {
							void availability.refetch();
							void usage.refetch();
						}}
					>
						<Trans>Retry</Trans>
					</Button>
				)}
			</AlertDescription>
		</Alert>
	);
}
