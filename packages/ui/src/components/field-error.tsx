import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Icon } from "./icon";

/** Connect a submitted field error to its control with aria-describedby. */
export function FieldError({ children, className, ...props }: ComponentProps<"p">) {
	if (!children) return null;
	return (
		<p
			role="alert"
			data-slot="field-error"
			className={cn("flex items-start gap-1 type-metadata text-danger-text", className)}
			{...props}
		>
			<Icon name="warning-circle" size={16} className="shrink-0" />
			<span>{children}</span>
		</p>
	);
}
