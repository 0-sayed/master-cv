import { OTPField as OTPFieldPrimitive } from "@base-ui/react/otp-field";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";

function OTPField({
	className,
	length,
	children,
	validationType = "numeric",
	normalizeValue,
	...props
}: OTPFieldPrimitive.Root.Props) {
	return (
		<OTPFieldPrimitive.Root
			data-slot="otp-field"
			length={length}
			dir="ltr"
			inputMode={validationType === "numeric" ? "numeric" : "text"}
			validationType={validationType === "numeric" ? "none" : validationType}
			normalizeValue={(value) => {
				const normalized = validationType === "numeric" ? normalizeNumericDigits(value).replace(/\D/g, "") : value;
				return normalizeValue ? normalizeValue(normalized) : normalized;
			}}
			className={cn("group flex items-center gap-1.5", className)}
			{...props}
		>
			{children ?? Array.from({ length }, (_, index) => <OTPFieldInput key={index} />)}
		</OTPFieldPrimitive.Root>
	);
}

function OTPFieldInput({ className, ...props }: OTPFieldPrimitive.Input.Props) {
	return (
		<OTPFieldPrimitive.Input
			data-slot="otp-field-input"
			className={cn(
				"size-9 rounded-lg border border-line-2 bg-transparent text-center font-mono text-sm transition-[color,background-color,border-color,box-shadow] outline-none group-aria-invalid:border-danger group-aria-invalid:ring-3 group-aria-invalid:ring-danger/20 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:bg-line-2/50 disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { OTPField, OTPFieldInput };
