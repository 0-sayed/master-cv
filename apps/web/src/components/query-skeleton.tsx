import type { SkeletonShape } from "@reactive-resume/ui/components/skeleton-content";
import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { SkeletonBoundary, SkeletonRegion } from "@reactive-resume/ui/components/skeleton";
import { SkeletonContent } from "@reactive-resume/ui/components/skeleton-content";

/** Application-local status copy; UI package remains independent of Lingui. */
export function QuerySkeleton({
	loading = true,
	shape = "rows",
	count,
	label,
	fallback,
	children,
	className,
	inline,
}: {
	loading?: boolean;
	shape?: SkeletonShape;
	count?: number;
	label?: ReactNode;
	fallback?: ReactNode;
	children?: ReactNode | (() => ReactNode);
	className?: string;
	inline?: boolean;
}) {
	return (
		<SkeletonBoundary
			loading={loading}
			label={label ?? <Trans>Loading workspace…</Trans>}
			fallback={fallback ?? <SkeletonContent shape={shape} count={count} />}
			className={className}
			inline={inline}
		>
			{children}
		</SkeletonBoundary>
	);
}

/** TanStack Router owns the same shared delay/minimum; do not start a second delay here. */
export function RouteSkeleton({ shape }: { shape: SkeletonShape }) {
	return (
		<SkeletonRegion label={<Trans>Loading workspace…</Trans>}>
			<SkeletonContent shape={shape} />
		</SkeletonRegion>
	);
}
