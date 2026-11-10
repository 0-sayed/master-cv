import type * as React from "react";
import { inputBaseClassName } from "@reactive-resume/ui/components/input";
import { cn } from "@reactive-resume/utils/style";
import { fieldDirectionProps } from "./field-direction";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(inputBaseClassName, "flex field-sizing-content min-h-16 px-3 py-2", className)}
			{...props}
			{...fieldDirectionProps(props)}
		/>
	);
}

export { Textarea };
