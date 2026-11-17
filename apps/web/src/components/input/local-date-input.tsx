import type { ComponentProps } from "react";
import { useState } from "react";
import { Input } from "@reactive-resume/ui/components/input";
import { getInterfaceDateLocale } from "@/libs/locale";

type LocalDateInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
	value: string;
	locale: string;
	onValueChange: (value: string) => void;
};
/** Gregorian dates follow interface order and always use Latin digits. */
export function LocalDateInput({ value, locale, onValueChange, ...props }: LocalDateInputProps) {
	const formatter = new Intl.DateTimeFormat(getInterfaceDateLocale(locale), {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
	const display = (iso: string) =>
		/^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatter.format(new Date(`${iso}T12:00:00`)).replace(/[\u200e\u200f]/g, "") : "";
	const [draft, setDraft] = useState({ value, locale, text: display(value) });
	if (draft.value !== value || draft.locale !== locale) setDraft({ value, locale, text: display(value) });
	const order = formatter
		.formatToParts(new Date(2006, 10, 22))
		.filter((part) => ["day", "month", "year"].includes(part.type))
		.map((part) => part.type);
	return (
		<Input
			{...props}
			dir="ltr"
			inputMode="numeric"
			placeholder={display("2006-11-22")}
			value={draft.text}
			onChange={(event) => {
				const text = event.target.value.replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, (digit) =>
					String(digit.charCodeAt(0) % 16),
				);
				const parts = text.split(/\D+/).filter(Boolean);
				const fields = Object.fromEntries(order.map((key, index) => [key, parts[index] ?? ""]));
				const iso = `${fields.year}-${fields.month?.padStart(2, "0")}-${fields.day?.padStart(2, "0")}`;
				const parsed = new Date(`${iso}T12:00:00`);
				const valid =
					parts.length === 3 &&
					fields.year?.length === 4 &&
					!Number.isNaN(parsed.getTime()) &&
					parsed.getMonth() + 1 === Number(fields.month) &&
					parsed.getDate() === Number(fields.day);
				const next = valid ? iso : "";
				setDraft({ value: next, locale, text });
				onValueChange(next);
			}}
		/>
	);
}
