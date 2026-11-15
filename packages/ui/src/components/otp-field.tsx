import type * as React from "react";
import { useState } from "react";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";

type OTPFieldProps = Omit<
	React.ComponentProps<"input">,
	"size" | "value" | "defaultValue" | "onChange" | "children"
> & {
	length: number;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	validationType?: "numeric" | "alpha" | "alphanumeric" | "none";
	normalizeValue?: (value: string) => string;
};

/** One semantic input preserves native paste, selection and OTP autofill across all segments. */
function OTPField({
	className,
	length,
	value,
	defaultValue = "",
	onValueChange,
	validationType = "numeric",
	normalizeValue,
	onFocus,
	onBlur,
	onSelect,
	...props
}: OTPFieldProps) {
	const [internalValue, setInternalValue] = useState(defaultValue);
	const [focused, setFocused] = useState(false);
	const [selection, setSelection] = useState(0);
	const current = value ?? internalValue;
	const numeric = validationType === "numeric";
	return (
		<div
			data-slot="otp-field"
			dir="ltr"
			className={cn("group relative mx-auto flex w-fit max-w-full items-center justify-center gap-1.5", className)}
		>
			<input
				{...props}
				data-slot="otp-field-input"
				type="text"
				autoComplete="one-time-code"
				inputMode={numeric ? "numeric" : "text"}
				pattern={numeric ? "[0-9]*" : undefined}
				value={current}
				className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
				onChange={(event) => {
					let next = event.target.value;
					if (numeric) next = normalizeNumericDigits(next).replace(/\D/g, "");
					else if (validationType === "alpha") next = next.replace(/[^a-z]/gi, "");
					else if (validationType === "alphanumeric") next = next.replace(/[^a-z0-9]/gi, "");
					next = (normalizeValue ? normalizeValue(next) : next).slice(0, length);
					setInternalValue(next);
					setSelection(Math.min(event.target.selectionStart ?? next.length, length - 1));
					onValueChange?.(next);
				}}
				onFocus={(event) => {
					setFocused(true);
					onFocus?.(event);
				}}
				onBlur={(event) => {
					setFocused(false);
					onBlur?.(event);
				}}
				onSelect={(event) => {
					setSelection(Math.min(event.currentTarget.selectionStart ?? 0, length - 1));
					onSelect?.(event);
				}}
			/>
			{Array.from({ length }, (_, index) => (
				<span
					key={index}
					data-slot="otp-field-segment"
					aria-hidden="true"
					className={cn(
						"flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border border-line-2 bg-transparent type-body font-mono transition-[color,background-color,border-color,box-shadow]",
						props["aria-invalid"] && "border-danger ring-3 ring-danger/20",
						focused && index === selection && "border-accent ring-3 ring-accent/50",
						props.disabled && "bg-line-2/50 opacity-50",
					)}
				>
					{current[index] ?? ""}
				</span>
			))}
		</div>
	);
}

export { OTPField };
