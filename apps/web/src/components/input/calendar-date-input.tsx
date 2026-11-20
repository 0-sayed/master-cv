import type { ComponentProps } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { LocalDateInput } from "@/components/input/local-date-input";

type CalendarDateInputProps = Omit<
	ComponentProps<typeof LocalDateInput>,
	"locale" | "calendarLabel" | "onValueChange" | "aria-label"
> & {
	label: string;
	onChange: (value: string) => void;
};

export function CalendarDateInput({ label, onChange, ...props }: CalendarDateInputProps) {
	const { i18n } = useLingui();
	return (
		<LocalDateInput
			{...props}
			aria-label={label}
			calendarLabel={t`Choose a date.`}
			locale={i18n.locale}
			onValueChange={onChange}
		/>
	);
}
