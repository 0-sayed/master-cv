import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@reactive-resume/utils/style";

export const SKELETON_DELAY_MS = 200;
export const SKELETON_MINIMUM_MS = 200;

/** A Suspense fallback cannot hold itself after unmount; its known module owner holds the promise instead. */
export async function loadSkeletonModule<T>(load: () => Promise<T>): Promise<T> {
	const started = Date.now();
	const value = await load();
	const elapsed = Date.now() - started;
	const minimum = SKELETON_DELAY_MS + SKELETON_MINIMUM_MS;
	if (elapsed >= SKELETON_DELAY_MS && elapsed < minimum)
		await new Promise<void>((resolve) => setTimeout(resolve, minimum - elapsed));
	return value;
}

type LoadingPhase = { phase: "idle" } | { phase: "shown"; since: number };

/** Keep content mounted on refetch; use this only for the initial read without usable data. */
export function useSkeletonLoading(loading: boolean) {
	const [state, setState] = useState<LoadingPhase>({ phase: "idle" });
	useEffect(() => {
		if (loading && state.phase === "idle") {
			const timer = setTimeout(() => setState({ phase: "shown", since: Date.now() }), SKELETON_DELAY_MS);
			return () => clearTimeout(timer);
		}
		if (!loading && state.phase === "shown") {
			const timer = setTimeout(
				() => setState({ phase: "idle" }),
				Math.max(0, SKELETON_MINIMUM_MS - (Date.now() - state.since)),
			);
			return () => clearTimeout(timer);
		}
	}, [loading, state]);
	return { pending: loading || state.phase === "shown", visible: state.phase === "shown" };
}

/** Decorative blocks are never announced individually. */
function Skeleton({ className, as: Tag = "div", ...props }: React.ComponentProps<"div"> & { as?: "div" | "span" }) {
	return (
		<Tag
			{...props}
			aria-hidden="true"
			data-slot="skeleton"
			className={cn("skeleton rounded-md bg-sunken", className)}
		/>
	);
}

function SkeletonText({ lines = 3 }: { lines?: number }) {
	return (
		<div className="grid w-full min-w-0 gap-2">
			{Array.from({ length: lines }, (_, index) => (
				<Skeleton key={index} className={cn("h-4", index === lines - 1 ? "w-2/3" : "w-full")} />
			))}
		</div>
	);
}

type SkeletonBoundaryProps = {
	loading: boolean;
	label: ReactNode;
	fallback: ReactNode;
	children?: ReactNode | (() => ReactNode);
	className?: string | undefined;
	inline?: boolean | undefined;
};

/** Reserves the same shape during the delay, then holds a shown placeholder for a short minimum. */
function SkeletonBoundary({ loading, label, fallback, children, className, inline }: SkeletonBoundaryProps) {
	const state = useSkeletonLoading(loading);
	if (!state.pending) return typeof children === "function" ? children() : children;
	return (
		<SkeletonRegion visible={state.visible} label={label} className={className} inline={inline}>
			{fallback}
		</SkeletonRegion>
	);
}

/** For a router/Suspense owner that already controls the delay and minimum. */
function SkeletonRegion({
	visible = true,
	label,
	children,
	className,
	inline = false,
}: {
	visible?: boolean;
	label: ReactNode;
	children: ReactNode;
	className?: string | undefined;
	inline?: boolean | undefined;
}) {
	const Tag = inline ? "span" : "div";
	return (
		<Tag data-slot="skeleton-region" aria-busy="true" className={className}>
			<span role="status" className="sr-only">
				{label}
			</span>
			<Tag aria-hidden="true" data-visible={visible} className={visible ? undefined : "invisible"}>
				{children}
			</Tag>
		</Tag>
	);
}

export { Skeleton, SkeletonText, SkeletonBoundary, SkeletonRegion };
