import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Inline labels with actions grow together on touch screens without clipping the action target. */
export function Chip({ className, ...props }: ComponentProps<"span">) {
	return (
		<span
			data-slot="chip"
			className={cn(
				"inline-flex min-h-7 max-w-full items-center gap-1 rounded-md bg-sunken ps-2 type-metadata text-ink-2 pointer-coarse:min-h-11",
				className,
			)}
			{...props}
		/>
	);
}
