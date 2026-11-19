import { msg } from "@lingui/core/macro";
export const calendarCopy = {
	monthCount: msg({
		message: "{count, plural, one {# interview this month} other {# interviews this month}}",
		context: "applications.calendar.monthCount",
	}),
	gridCount: msg({
		message: "{count, plural, one {# in the grid} other {# in the grid}}",
		context: "applications.calendar.gridCount",
	}),
	upcomingCount: msg({
		message: "{count, plural, one {# upcoming} other {# upcoming}}",
		context: "applications.calendar.upcomingCount",
	}),
	dayCount: msg({
		message: "{date}: {count, plural, one {# interview} other {# interviews}}",
		context: "applications.calendar.dayCount",
	}),
	showAll: msg({ message: "Show all ({count})", context: "applications.calendar.showAll" }),
	showNext: msg({ message: "Show next 5", context: "applications.calendar.showNext" }),
	showMonth: msg({ message: "Show month", context: "applications.calendar.showMonth" }),
	hideMonth: msg({ message: "Hide month", context: "applications.calendar.hideMonth" }),
	week: msg({ message: "This week", context: "applications.calendar.week" }),
	keyboard: msg({
		message:
			"Use arrow keys to move between dates. Home and End move within a week. Page Up and Page Down change month. Enter opens the day.",
		context: "applications.calendar.keyboard",
	}),
};
