import type { ScheduledInterview } from "../interviews";
import type { IconName } from "@reactive-resume/ui/components/icon";
import { useLingui } from "@lingui/react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { formatDuration, interviewTypeLabel } from "../interviews";
import { getInterfaceDateLocale } from "@/libs/locale";
export const calendarKindIcon = {
	screening: "phone",
	technical: "code",
	behavioral: "chat-text",
	onsite: "buildings",
	other: "dots-three",
} satisfies Record<ScheduledInterview["interview"]["kind"], IconName>;
export type CalendarEventProps = {
	item: ScheduledInterview;
	timeZone: string;
	presentation: "chip" | "agenda" | "detail";
	tabIndex?: number;
	onOpen: () => void;
};
export function CalendarEvent({ item, timeZone, presentation, tabIndex, onOpen }: CalendarEventProps) {
	const { i18n } = useLingui();
	const locale = getInterfaceDateLocale(i18n.locale);
	const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
	const date = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "full" }).format(item.start);
	const range = `${time.format(item.start)} – ${time.format(item.end)}`;
	const kind = interviewTypeLabel(item.interview.kind);
	const label = `${item.application.company} · ${item.application.role} · ${date} · ${range} · ${kind}`;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						size={presentation === "chip" ? "calendar-chip" : "row"}
						variant="ghost"
						dir="auto"
						tabIndex={tabIndex}
						aria-label={label}
						data-calendar-kind={item.interview.kind}
						data-calendar-event={presentation}
						data-upcoming-interview={presentation === "agenda" ? item.interview.id : undefined}
						className="calendar-event w-full min-w-0 justify-start"
						onClick={(event) => {
							event.stopPropagation();
							onOpen();
						}}
					/>
				}
			>
				{presentation !== "chip" && (
					<bdi dir="ltr" className="calendar-event-time type-metadata tabular-nums">
						{time.format(item.start)}
					</bdi>
				)}
				<Icon name={calendarKindIcon[item.interview.kind]} />
				<span className="calendar-event-identity">
					<bdi dir="auto" className="truncate font-semibold">
						{item.application.company}
					</bdi>
					<span aria-hidden="true">·</span>
					<bdi dir="auto" className="truncate">
						{item.application.role}
					</bdi>
				</span>
			</TooltipTrigger>
			<TooltipContent className="grid gap-1 wrap-anywhere">
				<bdi dir="auto">{item.application.company}</bdi>
				<bdi dir="auto">{item.application.role}</bdi>
				<span>{date}</span>
				<bdi dir="ltr">
					{range} · {timeZone}
				</bdi>
				<span>
					{kind} · {formatDuration(item.interview.durationMinutes, i18n.locale)}
				</span>
				{item.interview.location && <bdi dir="auto">{item.interview.location}</bdi>}
			</TooltipContent>
		</Tooltip>
	);
}
