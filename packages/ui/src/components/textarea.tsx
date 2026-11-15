import type * as React from "react";
import { inputSurfaceClassName } from "@reactive-resume/ui/components/input";
import { cn } from "@reactive-resume/utils/style";
import { fieldDirectionProps } from "./field-direction";

type TextareaProps = React.ComponentProps<"textarea"> & { size?: "default" | "message" };

function Textarea({ className, size = "default", ...props }: TextareaProps) {
	return (
		<textarea
			data-slot="textarea"
			data-size={size}
			className={cn(
				inputSurfaceClassName,
				"flex field-sizing-content min-h-16 px-3 py-2 type-body",
				size === "message" &&
					"max-h-(--textarea-message-max-height) min-h-(--textarea-message-min-height) overflow-y-auto",
				className,
			)}
			{...props}
			{...fieldDirectionProps(props)}
		/>
	);
}

export { Textarea };
