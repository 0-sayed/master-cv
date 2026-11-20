import type { ComponentProps, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { cn } from "@reactive-resume/utils/style";
import { getInterfaceDateLocale } from "@/libs/locale";

type LocalDateInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
	value: string;
	locale: string;
	calendarLabel: string;
	onValueChange: (value: string) => void;
};

const dateValue = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const dateFromValue = (value: string, fallback: Date) => {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : fallback;
};

/** Gregorian dates follow interface order and always use Latin digits. */
export function LocalDateInput({
	value,
	locale,
	calendarLabel,
	onValueChange,
	className,
	min,
	max,
	...props
}: LocalDateInputProps) {
	const dateLocale = getInterfaceDateLocale(locale);
	const formatter = new Intl.DateTimeFormat(dateLocale, {
		calendar: "gregory",
		day: "2-digit",
		month: "2-digit",
		numberingSystem: "latn",
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
	const [today] = useState(() => new Date());
	const selected = dateFromValue(value, today);
	const [open, setOpen] = useState(false);
	const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
	const [focusedDate, setFocusedDate] = useState<Date | null>(selected);
	const dayButtons = useRef(new Map<string, HTMLButtonElement>());
	const monthLabel = new Intl.DateTimeFormat(dateLocale, {
		calendar: "gregory",
		month: "long",
		numberingSystem: "latn",
	}).format(month);
	const weekdays = Array.from({ length: 7 }, (_, index) =>
		new Intl.DateTimeFormat(dateLocale, { calendar: "gregory", weekday: "short", numberingSystem: "latn" }).format(
			new Date(2023, 0, index + 1),
		),
	);
	const days = Array.from({ length: 42 }, (_, index) => {
		const firstDayOffset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
		return new Date(month.getFullYear(), month.getMonth(), index - firstDayOffset + 1);
	});
	const years = Array.from({ length: 111 }, (_, index) => selected.getFullYear() + 10 - index);
	const fieldNames = new Intl.DisplayNames(dateLocale, { type: "dateTimeField" });
	const minValue = typeof min === "string" ? min : undefined;
	const maxValue = typeof max === "string" ? max : undefined;
	const isInRange = (date: Date) => {
		const key = dateValue(date);
		return (!minValue || key >= minValue) && (!maxValue || key <= maxValue);
	};
	const firstEnabledDate = (targetMonth: Date) => {
		const first = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
		const candidate = minValue && dateValue(first) < minValue ? dateFromValue(minValue, first) : first;
		if (candidate.getFullYear() !== first.getFullYear() || candidate.getMonth() !== first.getMonth()) return null;
		return maxValue && dateValue(candidate) > maxValue ? null : candidate;
	};
	const displayMonth = (year: number, monthIndex: number) => {
		const nextMonth = new Date(year, monthIndex, 1);
		setMonth(nextMonth);
		if (
			focusedDate?.getFullYear() === nextMonth.getFullYear() &&
			focusedDate.getMonth() === nextMonth.getMonth() &&
			isInRange(focusedDate)
		)
			return;
		setFocusedDate(firstEnabledDate(nextMonth));
	};
	useEffect(() => {
		if (open && focusedDate) dayButtons.current.get(dateValue(focusedDate))?.focus();
	}, [focusedDate, open]);
	const choose = (date: Date) => {
		const next = dateValue(date);
		setDraft({ value: next, locale, text: display(next) });
		setFocusedDate(date);
		onValueChange(next);
		setOpen(false);
	};
	const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
		const direction = locale.startsWith("ar") ? -1 : 1;
		const next = new Date(date);
		if (event.key === "ArrowRight") next.setDate(next.getDate() + direction);
		else if (event.key === "ArrowLeft") next.setDate(next.getDate() - direction);
		else if (event.key === "ArrowDown") next.setDate(next.getDate() + 7);
		else if (event.key === "ArrowUp") next.setDate(next.getDate() - 7);
		else return;
		event.preventDefault();
		const step =
			event.key === "ArrowRight"
				? direction
				: event.key === "ArrowLeft"
					? -direction
					: event.key === "ArrowDown"
						? 7
						: -7;
		while (!isInRange(next)) {
			const key = dateValue(next);
			if ((minValue && key < minValue && step < 0) || (maxValue && key > maxValue && step > 0)) return;
			next.setDate(next.getDate() + step);
		}
		setFocusedDate(next);
		if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear())
			setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
	};

	return (
		<div className="flex w-full items-center gap-1">
			<Input
				{...props}
				dir="ltr"
				inputMode="numeric"
				min={min}
				max={max}
				placeholder={display("2006-11-22")}
				className={cn("min-w-0 flex-1", className)}
				value={draft.text}
				onChange={(event) => {
					const text = event.target.value.replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, (digit) =>
						String(digit.charCodeAt(0) % 16),
					);
					const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
					const parts = isoDate ? [isoDate[1], isoDate[2], isoDate[3]] : text.split(/\D+/).filter(Boolean);
					const fields = isoDate
						? { year: isoDate[1], month: isoDate[2], day: isoDate[3] }
						: Object.fromEntries(order.map((key, index) => [key, parts[index] ?? ""]));
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
			<Popover
				open={open}
				onOpenChange={(nextOpen) => {
					if (nextOpen) {
						const selectedMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
						setMonth(selectedMonth);
						setFocusedDate(isInRange(selected) ? selected : firstEnabledDate(selectedMonth));
					}
					setOpen(nextOpen);
				}}
			>
				<PopoverTrigger
					render={
						<Button variant="control" size="icon" aria-label={calendarLabel} disabled={props.disabled}>
							<Icon name="calendar-dots" />
						</Button>
					}
				/>
				<PopoverContent className="w-80" aria-label={props["aria-label"]} dir={locale.startsWith("ar") ? "rtl" : "ltr"}>
					<div className="mb-2 grid grid-cols-2 gap-2">
						<NativeSelect
							aria-label={fieldNames.of("month") ?? undefined}
							value={month.getMonth()}
							onChange={(event) => displayMonth(month.getFullYear(), Number(event.target.value))}
						>
							{Array.from({ length: 12 }, (_, index) => (
								<option key={index} value={index}>
									{new Intl.DateTimeFormat(dateLocale, {
										calendar: "gregory",
										month: "long",
										numberingSystem: "latn",
									}).format(new Date(2020, index, 1))}
								</option>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label={fieldNames.of("year") ?? undefined}
							value={month.getFullYear()}
							onChange={(event) => displayMonth(Number(event.target.value), month.getMonth())}
						>
							{years.map((year) => (
								<option key={year} value={year}>
									{year}
								</option>
							))}
						</NativeSelect>
					</div>
					<div
						role="grid"
						dir={locale.startsWith("ar") ? "rtl" : "ltr"}
						aria-label={`${monthLabel} ${month.getFullYear()}`}
					>
						<div role="row" className="grid grid-cols-7 text-center type-metadata text-ink-3">
							{weekdays.map((weekday, index) => (
								<span role="columnheader" key={`${weekday}-${index}`}>
									{weekday}
								</span>
							))}
						</div>
						<div className="grid grid-cols-7 gap-1" role="rowgroup">
							{days.map((date) => {
								const dateKey = dateValue(date);
								const inMonth = date.getMonth() === month.getMonth();
								const inRange = isInRange(date);
								return (
									<div role="gridcell" key={dateKey}>
										<Button
											ref={(button) => {
												if (button) dayButtons.current.set(dateKey, button);
												else dayButtons.current.delete(dateKey);
											}}
											type="button"
											variant={value === dateKey ? "secondary" : "ghost"}
											size="calendar-date"
											tabIndex={focusedDate && dateKey === dateValue(focusedDate) && inRange ? 0 : -1}
											aria-selected={value === dateKey}
											aria-label={new Intl.DateTimeFormat(dateLocale, {
												calendar: "gregory",
												day: "numeric",
												month: "long",
												numberingSystem: "latn",
												weekday: "long",
												year: "numeric",
											}).format(date)}
											aria-current={dateKey === dateValue(today) ? "date" : undefined}
											disabled={!inMonth || !inRange}
											onKeyDown={(event) => moveFocus(event, date)}
											onClick={() => choose(date)}
										>
											{date.getDate()}
										</Button>
									</div>
								);
							})}
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
