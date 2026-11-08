import type { ComponentProps } from "react";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { Input } from "./input";
type PhoneFieldProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
	value: string;
	onValueChange: (value: string) => void;
};
export function PhoneField({ value, onValueChange, ...props }: PhoneFieldProps) {
	return (
		<Input
			{...props}
			type="tel"
			dir="ltr"
			value={value}
			onChange={(event) => onValueChange(normalizeNumericDigits(event.currentTarget.value))}
		/>
	);
}
