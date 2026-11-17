import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

type ScrollAreaProps = ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" };
/** Use only when content needs an independent scrolling region. */
export function ScrollArea({ className, orientation = "vertical", ...props }: ScrollAreaProps) {
	return (
		<div
			data-slot="scroll-area"
			data-orientation={orientation}
			className={cn("scroll-area min-h-0 min-w-0", className)}
			{...props}
		/>
	);
}
