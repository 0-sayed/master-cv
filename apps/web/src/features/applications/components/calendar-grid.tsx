import type { ScheduledInterview, CalendarNavigationKey } from "../interviews";
import { useDirection } from "@base-ui/react/direction-provider";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { calendarCopy } from "../calendar-copy";
import { calendarWeekStart, dayKey, moveCalendarFocus } from "../interviews";
import { CalendarEvent } from "./calendar-event";
export type CalendarGridProps = {
	month: Date;
	days: Date[];
	byDay: Map<string, ScheduledInterview[]>;
	todayKey: string;
	locale: string;
	timeZone: string;
	compact: boolean;
	onMonthChange: (month: Date) => void;
	onEdit: (item: ScheduledInterview) => void;
	onSchedule: (day: Date) => void;
};
const navigationKeys = new Set([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);
export function CalendarGrid({
	month,
	days,
	byDay,
	todayKey,
	locale,
	timeZone,
	compact,
	onMonthChange,
	onEdit,
	onSchedule,
}: CalendarGridProps) {
	const direction = useDirection();
	const { i18n } = useLingui();
	const helpId = useId();
	const [focusKey, setFocusKey] = useState(() =>
		days.some((day) => dayKey(day) === todayKey) ? todayKey : dayKey(month),
	);
	const [active, setActive] = useState<string | null>(null);
	const cells = useRef(new Map<string, HTMLDivElement>());
	const pendingFocus = useRef(false);
	const nested = useRef(false);
	const weekStartsOn = calendarWeekStart(locale);
	const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
	const weekday = new Intl.DateTimeFormat(locale, { weekday: compact ? "narrow" : "short" });
	const visibleFocus = days.some((day) => dayKey(day) === focusKey) ? focusKey : dayKey(days[0] ?? month);
	useLayoutEffect(() => {
		if (pendingFocus.current) {
			cells.current.get(focusKey)?.focus();
			pendingFocus.current = false;
		}
	}, [days, focusKey]);
	const activate = (key: string) => {
		nested.current = false;
		setFocusKey(key);
		setActive(key);
	};
	const closeForDialog = (callback: () => void) => {
		nested.current = true;
		setActive(null);
		callback();
	};
	return (
		<>
			<p id={helpId} className="sr-only">
				{i18n._(calendarCopy.keyboard)}
			</p>
			<div
				role="grid"
				aria-label={t`Interview calendar`}
				aria-describedby={helpId}
				className="calendar-grid"
				data-compact={compact || undefined}
			>
				<div role="row" className="calendar-weekdays">
					{days.slice(0, 7).map((day) => (
						<div role="columnheader" key={day.getDay()}>
							{weekday.format(day)}
						</div>
					))}
				</div>
				{Array.from({ length: Math.ceil(days.length / 7) }, (_, week) => (
					<div role="row" className="calendar-week" key={week}>
						{days.slice(week * 7, week * 7 + 7).map((day, index) => {
							const key = dayKey(day);
							const items = byDay.get(key) ?? [];
							const outside = day.getMonth() !== month.getMonth();
							const date = fullDate.format(day);
							const count = items.length;
							return (
								<Popover
									key={key}
									modal
									open={active === key}
									onOpenChange={(open) => {
										if (open) activate(key);
										else setActive(null);
									}}
									onOpenChangeComplete={(open) => {
										if (!open && !nested.current) cells.current.get(key)?.focus();
									}}
								>
									<PopoverTrigger
										nativeButton={false}
										tabIndex={visibleFocus === key ? 0 : -1}
										render={
											<div
												role="gridcell"
												ref={(element) => {
													if (element) cells.current.set(key, element);
													else cells.current.delete(key);
												}}
											/>
										}
										data-day={key}
										data-outside={outside || undefined}
										aria-current={key === todayKey ? "date" : undefined}
										aria-label={i18n._({ ...calendarCopy.dayCount, values: { date, count } })}
										className="calendar-day"
										onFocus={() => setFocusKey(key)}
										onKeyDown={(event) => {
											if (event.target !== event.currentTarget) return;
											if (navigationKeys.has(event.key)) {
												event.preventDefault();
												event.stopPropagation();
												const next = moveCalendarFocus(
													day,
													event.key as CalendarNavigationKey,
													direction,
													weekStartsOn,
												);
												const target = dayKey(next);
												pendingFocus.current = true;
												setFocusKey(target);
												if (!days.some((value) => dayKey(value) === target))
													onMonthChange(new Date(next.getFullYear(), next.getMonth(), 1));
												else cells.current.get(target)?.focus();
											} else if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												event.stopPropagation();
												activate(key);
											}
										}}
									>
										<div className="calendar-day-heading">
											<span className="calendar-date">
												{outside && (day.getDate() === 1 || (week === 0 && index === 0))
													? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(day)
													: day.getDate()}
											</span>
											{!compact && items.length > 3 && (
												<Button
													variant="ghost"
													size="calendar-chip"
													tabIndex={-1}
													onClick={(event) => {
														event.stopPropagation();
														activate(key);
													}}
												>
													<Trans>+{items.length - 3} more</Trans>
												</Button>
											)}
										</div>
										{compact ? (
											count > 0 && <span className="calendar-day-count">{count}</span>
										) : (
											<>
												{items.slice(0, 3).map((item) => (
													<CalendarEvent
														key={`${item.application.id}-${item.interview.id}`}
														item={item}
														timeZone={timeZone}
														presentation="chip"
														tabIndex={-1}
														onOpen={() => {
															nested.current = true;
															onEdit(item);
														}}
													/>
												))}
											</>
										)}
									</PopoverTrigger>
									<PopoverContent
										aria-label={date}
										finalFocus={() => (nested.current ? false : (cells.current.get(key) ?? false))}
										className="calendar-day-popover"
									>
										<PopoverTitle>{date}</PopoverTitle>
										{items.map((item) => (
											<CalendarEvent
												key={`${item.application.id}-${item.interview.id}`}
												item={item}
												timeZone={timeZone}
												presentation="detail"
												onOpen={() => closeForDialog(() => onEdit(item))}
											/>
										))}
										<Button variant="secondary" onClick={() => closeForDialog(() => onSchedule(day))}>
											<Trans>Schedule interview</Trans>
										</Button>
										<Button variant="secondary" onClick={() => setActive(null)}>
											<Trans>Close</Trans>
										</Button>
									</PopoverContent>
								</Popover>
							);
						})}
					</div>
				))}
			</div>
		</>
	);
}
