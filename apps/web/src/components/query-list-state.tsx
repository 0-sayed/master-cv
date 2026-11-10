import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { QuerySkeleton } from "./query-skeleton";

type QueryListStateProps = {
	query: Pick<UseQueryResult, "isPending" | "isError" | "isFetching" | "refetch">;
	empty: boolean;
	loadingMessage: ReactNode;
	errorMessage: ReactNode;
	emptyMessage: ReactNode;
	children: ReactNode;
	skeleton?: ReactNode;
};

/** Embedded lists only declare emptiness after a successful lookup. */
export function QueryListState({
	query,
	empty,
	loadingMessage,
	errorMessage,
	emptyMessage,
	children,
	skeleton,
}: QueryListStateProps) {
	const loading = useSkeletonLoading(query.isPending);
	const [retrying, setRetrying] = useState(false);
	const retry = async () => {
		setRetrying(true);
		try {
			await query.refetch();
		} finally {
			setRetrying(false);
		}
	};
	if (query.isError || retrying) {
		return (
			<Alert variant="error">
				<Icon name="warning-circle" />
				<AlertTitle>{errorMessage}</AlertTitle>
				<AlertDescription>
					<p>
						<Trans>Check your connection and try again.</Trans>
					</p>
					<Button
						variant="secondary"
						className="mt-2"
						loading={query.isFetching || retrying}
						disabled={query.isFetching || retrying}
						onClick={() => void retry()}
					>
						{query.isFetching || retrying ? <Trans>Retrying…</Trans> : <Trans>Try again</Trans>}
					</Button>
				</AlertDescription>
			</Alert>
		);
	}
	if (loading.pending) return <QuerySkeleton label={loadingMessage} fallback={skeleton} />;

	if (empty)
		return (
			<p role="status" className="p-3 type-body text-ink-2">
				{emptyMessage}
			</p>
		);
	return children;
}
