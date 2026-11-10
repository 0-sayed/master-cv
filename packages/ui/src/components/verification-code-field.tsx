import type { ComponentProps } from "react";
import { useState } from "react";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";
import { Input } from "./input";

type VerificationCodeFieldProps = Omit<
	ComponentProps<typeof Input>,
	"type" | "value" | "onChange" | "onPaste" | "maxLength"
> & {
	length: number;
	value: string;
	onValueChange: (value: string) => void;
};

/** One semantic input. The owning form supplies labels, errors, expiry and explicit confirmation. */
export function VerificationCodeField({
	length,
	value,
	onValueChange,
	className,
	...props
}: VerificationCodeFieldProps) {
	const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
	const trackSelection = (input: HTMLInputElement) => {
		setSelection({ start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 });
	};
	const normalize = (text: string) => normalizeNumericDigits(text).replace(/\D/g, "").slice(0, length);
	return (
		<div
			dir="ltr"
			className={cn("group relative flex gap-1.5", className)}
			data-invalid={props["aria-invalid"] === true || props["aria-invalid"] === "true" || undefined}
			data-disabled={props.disabled || undefined}
		>
			<Input
				{...props}
				type="text"
				dir="ltr"
				inputMode="numeric"
				autoComplete="one-time-code"
				maxLength={length}
				value={value}
				className="absolute inset-0 z-10 h-full border-0 bg-transparent text-transparent caret-transparent focus:shadow-none disabled:bg-transparent aria-invalid:focus:shadow-none"
				onFocus={(event) => {
					trackSelection(event.currentTarget);
					props.onFocus?.(event);
				}}
				onSelect={(event) => {
					trackSelection(event.currentTarget);
					props.onSelect?.(event);
				}}
				onBlur={(event) => {
					setSelection(null);
					props.onBlur?.(event);
				}}
				onChange={(event) => onValueChange(normalize(event.currentTarget.value))}
				onPaste={(event) => {
					event.preventDefault();
					if (props.readOnly || props.disabled) return;
					const input = event.currentTarget;
					const pasted = normalizeNumericDigits(event.clipboardData.getData("text")).replace(/\D/g, "");
					onValueChange(
						normalize(
							value.slice(0, input.selectionStart ?? 0) + pasted + value.slice(input.selectionEnd ?? value.length),
						),
					);
				}}
			/>
			{Array.from({ length }, (_, index) => (
				<span
					key={index}
					data-slot="code-cell"
					data-active={
						(selection &&
							(selection.start === selection.end
								? index === Math.min(selection.start, length - 1)
								: index >= selection.start && index < selection.end)) ||
						undefined
					}
					aria-hidden="true"
					className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-md border border-line-2 bg-raised type-input text-ink tabular-nums group-data-invalid:border-danger group-data-disabled:bg-sunken group-data-disabled:text-ink-3 pointer-coarse:h-12 data-active:border-accent data-active:ring-2 data-active:ring-accent-soft group-data-invalid:data-active:ring-danger-soft"
				>
					{value[index]}
				</span>
			))}
		</div>
	);
}
