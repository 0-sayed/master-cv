import type * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@reactive-resume/utils/style";
import { controlHeights } from "./control-size";
import { fieldDirectionProps } from "./field-direction";

/** Shared by text inputs and textareas: focus is an accent border plus a soft 3px ring. */
const inputBaseClassName =
	"field-direction type-input w-full min-w-0 rounded-md border border-line-2 bg-raised text-ink outline-none transition-[border-color,box-shadow] duration-quick placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_3px_var(--danger-soft)]";

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
	size?: number | "default" | "sm" | "toolbar" | "lg" | undefined;
	variant?: "default" | "group";
};

function Input({ className, type, size, variant = "default", ...props }: InputProps) {
	return (
		<InputPrimitive
			type={type}
			size={typeof size === "number" ? size : undefined}
			data-slot="input"
			data-size={typeof size === "string" ? size : "default"}
			className={cn(
				inputBaseClassName,
				"px-3 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-ink",
				controlHeights[typeof size === "string" ? size : "default"],
				size === "lg" && "h-12 px-4",
				variant === "group" &&
					"h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus:shadow-none disabled:bg-transparent aria-invalid:focus:shadow-none pointer-coarse:h-full",
				className,
			)}
			{...props}
			{...fieldDirectionProps({ ...props, type })}
		/>
	);
}

export { Input, inputBaseClassName, fieldDirectionProps };
