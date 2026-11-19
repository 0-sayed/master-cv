import type { ScheduledInterview } from "../interviews";
import type { Application } from "../types";
import type { InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useId, useRef, useState } from "react";
import { INTERVIEW_KINDS } from "@reactive-resume/schema/applications/data";
import { Button } from "@reactive-resume/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@reactive-resume/ui/components/collapsible";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { Skeleton } from "@reactive-resume/ui/components/skeleton";
import { SkeletonContent } from "@reactive-resume/ui/components/skeleton-content";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { calendarCopy } from "../calendar-copy";
import {
	calendarCounts,
	calendarWeekStart,
	collectInterviews,
	dayKey,
	groupByDay,
	interviewTypeLabel,
	monthGrid,
	upcomingInterviews,
} from "../interviews";
import { CalendarEvent, calendarKindIcon } from "./calendar-event";
import { CalendarGrid } from "./calendar-grid";
import { InterviewDialog } from "./interview-dialog";
import { useCareerTime, useNow } from "@/features/career/shared";
import { getInterfaceDateLocale } from "@/libs/locale";
type DialogState =
	| { open: false }
	| { open: true; application: Application | null; interview: InterviewTimelineEntry | null; day: Date | null };
type ApplicationCalendarProps = {
	applications: Application[];
	allApplications: Application[];
	onOpen: (application: Application) => void;
};
export function ApplicationCalendar({ applications, allApplications, onOpen }: ApplicationCalendarProps) {
	const { i18n } = useLingui();
	const locale = getInterfaceDateLocale(i18n.locale);
	const copy = (key: keyof typeof calendarCopy, values?: Record<string, string | number>) =>
		i18n._({ ...calendarCopy[key], ...(values ? { values } : {}) });
	const { timeZone } = useCareerTime();
	const now = useNow();
	const mobile = useBreakpoint() === "mobile";
	const [monthOpen, setMonthOpen] = useState(false);
	const [weekDayOpen, setWeekDayOpen] = useState<string | null>(null);
	const todayKey = dayKey(now, timeZone);
	const [year = 0, monthIndex = 1, date = 1] = todayKey.split("-").map(Number);
	const [month, setMonth] = useState(() => new Date(year, monthIndex - 1, 1));
	const [expanded, setExpanded] = useState(false);
	const [dialog, setDialog] = useState<DialogState>({ open: false });
	const returnFocus = useRef<HTMLElement | null>(null);
	const agendaId = useId();
	const interviews = collectInterviews(applications);
	const byDay = groupByDay(interviews, timeZone);
	const upcoming = upcomingInterviews(interviews, now);
	const days = monthGrid(month, calendarWeekStart(i18n.locale));
	const counts = calendarCounts(interviews, month, days, timeZone, now);
	const groups = [...groupByDay(expanded ? upcoming : upcoming.slice(0, 5), timeZone)];
	const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
	const tomorrowKey = dayKey(new Date(year, monthIndex - 1, date + 1));
	const schedule = (day: Date | null = null) => {
		setWeekDayOpen(null);
		returnFocus.current =
			(day ? document.querySelector<HTMLElement>(`[data-day="${dayKey(day)}"]`) : null) ??
			(document.activeElement instanceof HTMLElement ? document.activeElement : null);
		setDialog({ open: true, application: null, interview: null, day });
	};
	const edit = (item: ScheduledInterview) => {
		setWeekDayOpen(null);
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		returnFocus.current = active?.matches('[data-calendar-event="agenda"]')
			? active
			: (active?.closest<HTMLElement>('[role="gridcell"]') ??
				document.querySelector<HTMLElement>(`[data-day="${dayKey(item.start, timeZone)}"]`) ??
				active);
		setDialog({ open: true, application: item.application, interview: item.interview, day: null });
	};
	const shift = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
	const heading = (key: string) =>
		key === todayKey
			? t`Today`
			: key === tomorrowKey
				? t`Tomorrow`
				: new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" }).format(
						new Date(`${key}T12:00:00`),
					);
	const monthPanel = (
		<section className="calendar-month-panel" data-testid="interview-calendar" aria-label={monthLabel}>
			<header className="calendar-panel-header">
				<div className="min-w-0">
					<h2 className="type-section capitalize">{monthLabel}</h2>
					<p className="type-metadata text-ink-2">{copy("monthCount", { count: counts.month })}</p>
				</div>
				<div className="flex items-center gap-1">
					<IconButton size="icon-sm" label={t`Previous month`} onClick={() => shift(-1)} icon="caret-left" />
					<Button
						size="sm"
						variant="secondary"
						disabled={dayKey(month).slice(0, 7) === todayKey.slice(0, 7)}
						onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
					>
						<Trans>This month</Trans>
					</Button>
					<IconButton size="icon-sm" label={t`Next month`} onClick={() => shift(1)} icon="caret-right" />
				</div>
			</header>
			<CalendarGrid
				month={month}
				days={days}
				byDay={byDay}
				todayKey={todayKey}
				locale={locale.toString()}
				timeZone={timeZone}
				compact={mobile}
				onMonthChange={setMonth}
				onEdit={edit}
				onSchedule={schedule}
			/>
			<footer className="calendar-legend" style={{ columnGap: "var(--space-24)", rowGap: "var(--space-12)" }}>
				<span className="whitespace-nowrap">{copy("gridCount", { count: counts.grid })}</span>
				{INTERVIEW_KINDS.map((kind) => (
					<span
						key={kind.value}
						data-calendar-kind={kind.value}
						className="calendar-kind-label shrink-0 whitespace-nowrap"
					>
						<Icon name={calendarKindIcon[kind.value]} />
						{interviewTypeLabel(kind.value)}
					</span>
				))}
			</footer>
		</section>
	);
	return (
		<div className="application-calendar">
			{mobile && (
				<nav data-calendar-week aria-label={copy("week")} className="calendar-week-strip">
					{monthGrid(new Date(year, monthIndex - 1, date), calendarWeekStart(i18n.locale))
						.filter((day) => {
							const start = new Date(
								year,
								monthIndex - 1,
								date - ((new Date(year, monthIndex - 1, date).getDay() - calendarWeekStart(i18n.locale) + 7) % 7),
							);
							return day >= start && day < new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
						})
						.map((day) => {
							const key = dayKey(day);
							const items = byDay.get(key) ?? [];
							const label = new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(day);
							return (
								<Popover
									key={key}
									modal
									open={weekDayOpen === key}
									onOpenChange={(open) => setWeekDayOpen(open ? key : null)}
								>
									<PopoverTrigger
										render={<Button variant="ghost" size="calendar-date" />}
										data-day={key}
										aria-current={key === todayKey ? "date" : undefined}
										aria-label={label}
										className="calendar-week-date"
									>
										<span className="type-metadata">
											{new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(day)}
										</span>
										<span>{day.getDate()}</span>
										<span className="type-metadata">{items.length || "·"}</span>
									</PopoverTrigger>
									<PopoverContent
										aria-label={label}
										className="calendar-day-popover"
										finalFocus={() =>
											dialog.open
												? false
												: document.querySelector<HTMLElement>(`[data-calendar-week] [data-day="${key}"]`)
										}
									>
										<PopoverTitle>{label}</PopoverTitle>
										{items.map((item) => (
											<CalendarEvent
												key={`${item.application.id}-${item.interview.id}`}
												item={item}
												timeZone={timeZone}
												presentation="detail"
												onOpen={() => edit(item)}
											/>
										))}
										<Button variant="secondary" onClick={() => schedule(day)}>
											<Trans>Schedule interview</Trans>
										</Button>
									</PopoverContent>
								</Popover>
							);
						})}
				</nav>
			)}
			{!mobile && monthPanel}
			<aside className="calendar-agenda" aria-label={t`Upcoming interviews`}>
				<header className="calendar-panel-header">
					<div>
						<h2 className="type-section">
							<Trans>Upcoming interviews</Trans>
						</h2>
						<p className="type-metadata text-ink-2">{copy("upcomingCount", { count: counts.upcoming })}</p>
					</div>
					<IconButton size="icon" label={t`Schedule interview`} onClick={() => schedule()} icon="calendar-plus" />
				</header>
				<div id={agendaId} className="calendar-agenda-body" data-expanded={expanded || undefined}>
					{upcoming.length === 0 ? (
						<EmptyState
							density="compact"
							icon="calendar-blank"
							title={<Trans>Nothing scheduled yet</Trans>}
							actions={
								<Button variant="secondary" onClick={() => schedule()}>
									<Trans>Schedule interview</Trans>
								</Button>
							}
						/>
					) : (
						groups.map(([key, items]) => (
							<section key={key} className="calendar-agenda-group">
								<h3 className="type-metadata text-ink-2">{heading(key)}</h3>
								{items.map((item) => (
									<CalendarEvent
										key={`${item.application.id}-${item.interview.id}`}
										item={item}
										timeZone={timeZone}
										presentation="agenda"
										onOpen={() => edit(item)}
									/>
								))}
							</section>
						))
					)}
				</div>
				<footer className="calendar-agenda-footer">
					{upcoming.length > 5 && (
						<Button
							variant="secondary"
							size="sm"
							aria-expanded={expanded}
							aria-controls={agendaId}
							onClick={() => setExpanded((value) => !value)}
						>
							{expanded ? copy("showNext") : copy("showAll", { count: counts.upcoming })}
						</Button>
					)}
					<bdi dir="ltr" className="type-metadata text-ink-2">
						{timeZone}
					</bdi>
				</footer>
			</aside>
			{mobile && (
				<Collapsible open={monthOpen} onOpenChange={setMonthOpen} className="calendar-month-disclosure">
					<CollapsibleTrigger variant="heading" className="w-full justify-between">
						<span>{monthLabel}</span>
						<span>{monthOpen ? copy("hideMonth") : copy("showMonth")}</span>
						<Icon name="caret-down" className={monthOpen ? "rotate-180" : undefined} />
					</CollapsibleTrigger>
					<CollapsibleContent>{monthPanel}</CollapsibleContent>
				</Collapsible>
			)}

			<InterviewDialog
				open={dialog.open}
				onOpenChange={(open) => {
					if (!open) {
						setDialog({ open: false });
					}
				}}
				application={dialog.open ? dialog.application : null}
				applications={allApplications}
				interview={dialog.open ? dialog.interview : null}
				day={dialog.open ? dialog.day : null}
				onOpenApplication={onOpen}
				finalFocus={returnFocus}
			/>
		</div>
	);
}

export function ApplicationCalendarSkeleton(): React.JSX.Element {
	const mobile = useBreakpoint() === "mobile";
	return (
		<div className="application-calendar" aria-hidden="true">
			{mobile ? (
				<div className="calendar-week-strip">
					{Array.from({ length: 7 }, (_, index) => (
						<Skeleton key={index} className="h-16" />
					))}
				</div>
			) : (
				<div className="calendar-month-panel">
					<div className="calendar-panel-header">
						<Skeleton className="h-6 w-32" />
					</div>
					<div className="calendar-grid">
						{Array.from({ length: 6 }, (_, week) => (
							<div className="calendar-week" key={week}>
								{Array.from({ length: 7 }, (_, day) => (
									<div key={day} className="calendar-day">
										<Skeleton className="h-6 w-6 self-end" />
									</div>
								))}
							</div>
						))}
					</div>
					<div className="calendar-legend">
						<Skeleton className="h-6 w-48" />
					</div>
				</div>
			)}
			<div className="calendar-agenda">
				<div className="calendar-panel-header">
					<Skeleton className="h-6 w-32" />
				</div>
				<div className="calendar-agenda-body">
					<SkeletonContent shape="rows" count={5} />
				</div>
				<div className="calendar-agenda-footer">
					<Skeleton className="h-6 w-24" />
				</div>
			</div>
		</div>
	);
}
