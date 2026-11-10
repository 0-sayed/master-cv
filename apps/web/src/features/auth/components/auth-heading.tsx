import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

export function AuthHeading({ className, children, ...props }: ComponentProps<"h1">) {
	return (
		<h1 className={cn("type-title-s lg:type-title", className)} {...props}>
			{children}
		</h1>
	);
}
