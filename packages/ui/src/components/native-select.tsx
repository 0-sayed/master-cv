import type * as React from "react";
import { Icon } from "@reactive-resume/ui/components/icon";
import { inputBaseClassName } from "@reactive-resume/ui/components/input";
import { cn } from "@reactive-resume/utils/style";
import { controlHeights } from "./control-size";

/** The platform select, restyled like an input, with a 20px chevron at the end. */
type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
	size?: number | keyof typeof controlHeights | undefined;
	fit?: "full" | "content";
};

function NativeSelect({ className, children, size, fit = "full", ...props }: NativeSelectProps) {
	return (
		<div
			data-slot="native-select"
			className={cn("relative inline-flex max-w-full", fit === "content" ? "w-fit shrink-0" : "w-full")}
		>
			<select
				size={typeof size === "number" ? size : undefined}
				className={cn(
					inputBaseClassName,
					"cursor-pointer appearance-none ps-3 pe-9",
					controlHeights[typeof size === "string" ? size : "default"],
					fit === "content" && "w-auto max-w-full",
					className,
				)}
				{...props}
			>
				{children}
			</select>
			<Icon
				name="caret-down"
				className="pointer-events-none absolute inset-e-2.5 top-1/2 -translate-y-1/2 text-ink-3"
			/>
		</div>
	);
}

export { NativeSelect };
