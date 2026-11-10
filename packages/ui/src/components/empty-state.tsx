import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

/** A quiet bounded collection surface, with existing copy/actions supplied by the feature. */
export function EmptyState({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="empty-state"
			className={cn(
				"grid w-full justify-items-center gap-3 rounded-xl border border-dashed border-line-2 bg-surface px-4 py-12 text-center sm:px-8 sm:py-16",
				className,
			)}
			{...props}
		/>
	);
}
