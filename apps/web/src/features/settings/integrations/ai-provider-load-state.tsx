import { Trans } from "@lingui/react/macro";
import { Button } from "@reactive-resume/ui/components/button";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { QuerySkeleton } from "@/components/query-skeleton";

type AiProviderLoadStateProps = {
	state: { isLoading: boolean; error: unknown; retry: () => void };
};

/** Loading and lookup failures must not be presented as missing saved connections. */
export function AiProviderLoadState({ state }: AiProviderLoadStateProps) {
	const skeletonWait1 = useSkeletonLoading(state.isLoading);
	if (skeletonWait1.pending || state.isLoading)
		return <QuerySkeleton shape="settings" count={1} label={<Trans>Loading AI connections…</Trans>} />;
	if (!state.error) return null;
	return (
		<div role="alert" className="grid justify-items-start gap-2 rounded-lg border border-line p-3 type-body text-ink-2">
			<p>
				<Trans>Couldn't load AI connections. Your saved connections haven't changed.</Trans>
			</p>
			<Button size="sm" variant="secondary" onClick={state.retry}>
				<Trans>Try again</Trans>
			</Button>
		</div>
	);
}
