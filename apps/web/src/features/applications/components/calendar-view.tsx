import type { ScheduledInterview } from "../interviews";
import type { Application } from "../types";
import type { InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { INTERVIEW_KINDS } from "@reactive-resume/schema/applications/data";
import { Button } from "@reactive-resume/ui/components/button";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { cn } from "@reactive-resume/utils/style";
import {
	collectInterviews,
	dayKey,
	formatDuration,
	groupByDay,
	interviewKindOf,
	interviewTypeLabel,
	monthGrid,
	upcomingInterviews,
} from "../interviews";
import { isHttpLink } from "../links";
import { InterviewDialog } from "./interview-dialog";
import { useCareerTime, useNow } from "@/features/career/shared";
import { getInterfaceDateLocale } from "@/libs/locale";

const MAX_CHIPS_PER_DAY = 3;

type DialogState =
	| { open: false }
	| { open: true; application: Application | null; interview: InterviewTimelineEntry | null; day: Date | null };

type ApplicationCalendarProps = {
	// Applications matching the page filters; their interviews are shown.
	applications: Application[];
	// Every application, offered by the "schedule interview" picker.
	allApplications: Application[];
	onOpen: (application: Application) => void;
};

export function ApplicationCalendar({ applications, allApplications, onOpen }: ApplicationCalendarProps) {
	const { i18n } = useLingui();
	const locale = getInterfaceDateLocale(i18n.locale);
	const [month, setMonth] = useState(() => {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), 1);
	});
	// Which way the last month change went: the new month's days slide in from that side. 0 = no change yet.
	const [direction, setDirection] = useState<-1 | 0 | 1>(0);
	const [dialog, setDialog] = useState<DialogState>({ open: false });

	const interviews = collectInterviews(applications);
	const byDay = groupByDay(interviews);
	const upcoming = upcomingInterviews(interviews);
	const upcomingByDay = [...groupByDay(upcoming).values()];
	const days = monthGrid(month);

	// oxlint-disable-next-line react/purity -- Read today on each render so an open calendar updates after midnight when navigated.
	const today = new Date();
	const todayKey = dayKey(today);
	const tomorrowKey = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
	const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
	const monthCount = interviews.filter(
		(item) => item.start.getFullYear() === month.getFullYear() && item.start.getMonth() === month.getMonth(),
	).length;

	const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
	const monthFormat = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
	const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
	const dayHeadingFormat = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" });

	const goToMonth = (next: Date) => {
		setDirection(next > month ? 1 : -1);
		setMonth(next);
	};
	const shiftMonth = (delta: number) => goToMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
	const schedule = (day: Date | null = null) => setDialog({ open: true, application: null, interview: null, day });
	const edit = (item: ScheduledInterview) =>
		setDialog({ open: true, application: item.application, interview: item.interview, day: null });

	const dayHeading = (date: Date) => {
		const key = dayKey(date);
		if (key === todayKey) return t`Today`;
		if (key === tomorrowKey) return t`Tomorrow`;
		return dayHeadingFormat.format(date);
	};

	return (
		<div className="flex min-h-0 flex-1 gap-6 max-lg:flex-col">
			<section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-testid="interview-calendar">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<div className="flex items-baseline gap-2">
						<h2 className="text-lg font-semibold capitalize">{monthFormat.format(month)}</h2>
						<span className="type-body text-ink-3">
							{monthCount === 0 ? (
								<Trans>No interviews</Trans>
							) : monthCount === 1 ? (
								<Trans>1 interview</Trans>
							) : (
								<Trans>{monthCount} interviews</Trans>
							)}
						</span>
					</div>

					<div className="ms-auto flex items-center gap-1">
						<Button size="icon-sm" variant="ghost" title={t`Previous month`} onClick={() => shiftMonth(-1)}>
							<Icon name="caret-left" size={16} />
						</Button>
						<Button
							size="sm"
							variant="secondary"
							disabled={isCurrentMonth}
							onClick={() => goToMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
						>
							<Trans>This month</Trans>
						</Button>
						<Button size="icon-sm" variant="ghost" title={t`Next month`} onClick={() => shiftMonth(1)}>
							<Icon name="caret-right" size={16} />
						</Button>
						<Button size="sm" className="ms-2" onClick={() => schedule()}>
							<Icon name="calendar-plus" size={16} />
							<Trans>Schedule interview</Trans>
						</Button>
					</div>
				</div>

				<div className="shrink-0 overflow-hidden rounded-xl border border-line bg-surface">
					<div className="grid grid-cols-7">
						{days.slice(0, 7).map((day) => (
							<div
								key={`weekday-${day.getDay()}`}
								className="border-b border-line p-2 text-center text-[11px] font-medium tracking-wide text-ink-3 uppercase"
							>
								{weekdayFormat.format(day)}
							</div>
						))}
					</div>
					<div
						key={`${month.getFullYear()}-${month.getMonth()}`}
						className={cn(
							"grid grid-cols-7",
							direction !== 0 && "transition-[opacity,translate] duration-standard ease-enter starting:opacity-0",
							direction === 1 && "starting:translate-x-2 rtl:starting:-translate-x-2",
							direction === -1 && "starting:-translate-x-2 rtl:starting:translate-x-2",
						)}
					>
						{days.map((day, i) => {
							const key = dayKey(day);
							const items = byDay.get(key) ?? [];
							const inMonth = day.getMonth() === month.getMonth();
							const isToday = key === todayKey;
							const extra = items.length - MAX_CHIPS_PER_DAY;
							const date = dayHeadingFormat.format(day);
							const scheduleLabel = t`Schedule an interview on ${date}`;
							return (
								<div
									key={key}
									data-day={key}
									className={cn(
										"group/day relative flex min-h-16 flex-col gap-1 border-line p-1 sm:min-h-24 sm:p-1.5",
										i % 7 !== 6 && "border-e",
										i < 35 && "border-b",
										!inMonth && "bg-sunken/30",
									)}
								>
									<div className="flex items-center justify-between">
										<button
											type="button"
											title={scheduleLabel}
											aria-label={scheduleLabel}
											className="flex size-6 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 max-sm:hidden"
											onClick={() => schedule(day)}
										>
											<Icon name="plus" size={14} />
										</button>
										<span
											className={cn(
												"flex size-6 items-center justify-center rounded-full type-metadata",
												!inMonth && "text-ink-3",
												isToday && "bg-accent font-semibold text-on-accent",
											)}
										>
											{day.getDate()}
										</span>
									</div>
									{items.slice(0, MAX_CHIPS_PER_DAY).map((item) => (
										<InterviewChip
											key={item.interview.id}
											item={item}
											time={timeFormat.format(item.start)}
											onOpen={() => edit(item)}
										/>
									))}
									{extra > 0 && (
										<Popover>
											<PopoverTrigger
												render={
													<button
														type="button"
														className="self-start rounded-md px-1.5 py-0.5 text-[11px] text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
													/>
												}
											>
												<Trans>+{extra} more</Trans>
											</PopoverTrigger>
											<PopoverContent align="start" className="flex w-60 flex-col gap-1 p-2">
												<p className="px-1 pb-1 type-metadata font-medium">{dayHeading(day)}</p>
												{items.map((item) => (
													<InterviewChip
														key={item.interview.id}
														item={item}
														time={timeFormat.format(item.start)}
														onOpen={() => edit(item)}
													/>
												))}
											</PopoverContent>
										</Popover>
									)}
								</div>
							);
						})}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 type-metadata text-ink-3">
					{INTERVIEW_KINDS.map((kind) => (
						<span key={kind.value} className="flex items-center gap-1.5">
							<span className="size-2 rounded-full" style={{ background: kind.color }} />
							{interviewTypeLabel(kind.value)}
						</span>
					))}
				</div>
			</section>

			<aside className="flex shrink-0 flex-col gap-4 lg:w-80">
				<h3 className="type-body font-semibold">
					<Trans>Upcoming interviews</Trans>
				</h3>

				{upcoming.length === 0 ? (
					<EmptyState
						density="compact"
						icon="calendar-blank"
						title={<Trans>Nothing scheduled yet</Trans>}
						description={
							<Trans>Add screening calls and technical interviews to see them here and on the calendar.</Trans>
						}
						actions={
							<Button variant="secondary" onClick={() => schedule()}>
								<Icon name="calendar-plus" />
								<Trans>Schedule interview</Trans>
							</Button>
						}
					/>
				) : (
					upcomingByDay.map((group) => {
						const first = group[0];
						if (!first) return null;
						return (
							<div key={dayKey(first.start)} className="flex flex-col gap-2">
								<h4 className="type-metadata font-medium text-ink-3">{dayHeading(first.start)}</h4>
								{group.map((item) => (
									<UpcomingCard
										key={item.interview.id}
										item={item}
										timeRange={`${timeFormat.format(item.start)} – ${timeFormat.format(item.end)}`}
										locale={i18n.locale}
										onEdit={() => edit(item)}
										onOpenApplication={() => onOpen(item.application)}
									/>
								))}
							</div>
						);
					})
				)}
			</aside>

			<InterviewDialog
				open={dialog.open}
				onOpenChange={(open) => !open && setDialog({ open: false })}
				application={dialog.open ? dialog.application : null}
				applications={allApplications}
				interview={dialog.open ? dialog.interview : null}
				day={dialog.open ? dialog.day : null}
			/>
		</div>
	);
}

type UpcomingCardProps = {
	item: ScheduledInterview;
	timeRange: string;
	locale: string;
	onEdit: () => void;
	onOpenApplication: () => void;
};

function UpcomingCard({ item, timeRange, locale, onEdit, onOpenApplication }: UpcomingCardProps) {
	const kind = interviewKindOf(item.interview.kind);
	const { relative } = useCareerTime();
	const now = useNow();
	const location = item.interview.location;
	const joinUrl = isHttpLink(location) ? location : null;
	const phone = /^\+?[\d\s()-]{5,}$/.test(location);
	return (
		<article
			data-upcoming-interview={item.interview.id}
			className="grid gap-3 rounded-xl border border-line bg-surface p-4 transition-colors focus-within:border-accent hover:border-line-2"
		>
			<button type="button" className="grid gap-3 text-start" onClick={onEdit}>
				<span className="grid gap-1">
					<span dir="auto" className="type-section tabular-nums">
						{timeRange}
					</span>
					<span className="type-metadata text-ink-2">
						{relative(item.start, now)} · {formatDuration(item.interview.durationMinutes, locale)}
					</span>
				</span>
				<span className="grid min-w-0 gap-1">
					<span dir="auto" className="type-body font-semibold wrap-anywhere">
						{item.application.company}
					</span>
					<span dir="auto" className="type-body wrap-anywhere text-ink-2">
						{item.application.role}
					</span>
				</span>
				<span className="flex items-center gap-2 type-metadata text-ink-2">
					<span aria-hidden="true" className="size-2 rounded-full" style={{ background: kind?.color }} />
					{interviewTypeLabel(item.interview.kind)}
				</span>
			</button>
			{location && (
				<div className="flex min-w-0 items-center gap-2 type-metadata text-ink-2">
					<Icon name={joinUrl ? "link-simple-horizontal" : phone ? "phone" : "map-pin"} className="shrink-0" />
					<span dir="auto" className="min-w-0 flex-1 wrap-anywhere">
						{location}
					</span>
					{joinUrl && (
						<Button
							size="sm"
							variant="secondary"
							nativeButton={false}
							role="link"
							render={<a href={joinUrl} target="_blank" rel="noopener noreferrer" />}
						>
							<Trans>Join</Trans>
						</Button>
					)}
				</div>
			)}
			<button
				type="button"
				className="justify-self-start rounded-sm type-metadata text-accent-text underline-offset-4 hover:underline focus-visible:underline"
				onClick={onOpenApplication}
			>
				<Trans>View application</Trans>
			</button>
		</article>
	);
}

type InterviewChipProps = {
	item: ScheduledInterview;
	time: string;
	onOpen: () => void;
};

function InterviewChip({ item, time, onOpen }: InterviewChipProps) {
	const kind = interviewKindOf(item.interview.kind);
	return (
		<button
			type="button"
			title={`${time} · ${interviewTypeLabel(item.interview.kind)} · ${item.application.company} — ${item.application.role}`}
			className="flex min-w-0 items-center gap-1.5 rounded-md bg-sunken/60 px-1.5 py-0.5 text-start text-[11px] leading-tight transition-colors hover:bg-sunken max-sm:justify-center max-sm:bg-transparent"

			onClick={onOpen}
		>
			<span className="size-2 shrink-0 rounded-full sm:hidden" style={{ background: kind?.color }} />
			<span className="flex min-w-0 items-baseline gap-1.5 max-sm:hidden">
				<span className="shrink-0 text-ink-3 tabular-nums">{time}</span>
				<span className="truncate font-medium">{item.application.company}</span>
			</span>
		</button>
	);
}
