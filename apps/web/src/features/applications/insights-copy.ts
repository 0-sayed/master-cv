import { msg } from "@lingui/core/macro";

export const insightCopy = {
	sent: msg({ message: "Applications sent", context: "applications.insights.sent" }),
	tracked: msg({ message: "{count} tracked jobs", context: "applications.insights.tracked" }),
	reply: msg({ message: "Heard back", context: "applications.insights.reply" }),
	median: msg({ message: "Time to first reply", context: "applications.insights.median" }),
	days: msg({ message: "{count} days", context: "applications.insights.days" }),
	coverage: msg({
		message: "{dated} dated replies · {omitted} without usable dates",
		context: "applications.insights.coverage",
	}),
	datedReplies: msg({
		message: "{count, plural, one {{dated} dated reply} other {{dated} dated replies}}",
		context: "applications.insights.datedReplies",
	}),
	missingDates: msg({ message: "without usable dates", context: "applications.insights.missingDates" }),
	funnel: msg({ message: "How far applications get", context: "applications.insights.funnel" }),
	weekly: msg({ message: "Applications sent each week", context: "applications.insights.weekly" }),
	period: msg({ message: "{count} sent in 8 weeks · day/month", context: "applications.insights.period" }),
	current: msg({ message: "Partial week", context: "applications.insights.current" }),
	sources: msg({ message: "Where applications come from", context: "applications.insights.sources" }),
	highest: msg({ message: "Highlight: most recorded source", context: "applications.insights.highest" }),
	outcomes: msg({ message: "What happened after an interview?", context: "applications.insights.outcomes" }),
	interviewed: msg({ message: "{count} reached Interview", context: "applications.insights.interviewed" }),
	comparison: msg({ message: "Do replies differ by resume?", context: "applications.insights.comparison" }),
	tailored: msg({ message: "Resume tailored for this job", context: "applications.insights.tailored" }),
	base: msg({ message: "Another linked resume", context: "applications.insights.base" }),
	excluded: msg({ message: "{count} sent without a linked resume", context: "applications.insights.excluded" }),
	noncausal: msg({
		message: "Small samples. Differences do not show that tailoring caused a reply.",
		context: "applications.insights.noncausal",
	}),
	sample: msg({
		message: "Fewer than 5 records. More data is needed to show a reliable rate.",
		context: "applications.insights.sample",
	}),
	medianSample: msg({
		message: "At least 5 dated replies are needed to show a median.",
		context: "applications.insights.medianSample",
	}),
	comparisonSample: msg({
		message: "Each resume group needs at least 5 sent applications to show rate bars.",
		context: "applications.insights.comparisonSample",
	}),
	emptyTitle: msg({ message: "Your search is taking shape", context: "applications.insights.emptyTitle" }),
	empty: msg({
		message: "Track at least 5 jobs to explore your application insights.",
		context: "applications.insights.empty",
	}),
	noSends: msg({ message: "No applications sent yet", context: "applications.insights.noSends" }),
	noWeeks: msg({ message: "No applications were sent in these 8 weeks.", context: "applications.insights.noWeeks" }),
	noInterviews: msg({
		message: "No applications reached Interview yet.",
		context: "applications.insights.noInterviews",
	}),
	missing: msg({ message: "Not recorded", context: "applications.insights.missing" }),
	other: msg({ message: "Other sources", context: "applications.insights.other" }),
	correct: msg({ message: "Update sources in the list", context: "applications.insights.correct" }),
	method: msg({ message: "Calculations and data tables", context: "applications.insights.method" }),
	methodText: msg({
		message:
			"A reply is a recorded Screening, Interview, Offer, or Not selected transition after sending. Later stages imply skipped earlier stages. Closed applications remain included. Notes and appointments do not count as replies. Durations use elapsed days and omit unusable dates. Sources include saved jobs. Weeks start Sunday in Riyadh, and the current week is incomplete.",
		context: "applications.insights.methodText",
	}),
	label: msg({ message: "Label", context: "applications.insights.label" }),
	count: msg({ message: "Count / population", context: "applications.insights.count" }),
	share: msg({ message: "Share", context: "applications.insights.share" }),
	unknown: msg({ message: "Unknown outcome", context: "applications.insights.unknown" }),
	loadingDocuments: msg({ message: "Loading resume comparison…", context: "applications.insights.loadingDocuments" }),
	documentError: msg({ message: "Could not refresh resume details", context: "applications.insights.documentError" }),
	documentHint: msg({
		message: "Other charts remain available. Retry to load the resume comparison.",
		context: "applications.insights.documentHint",
	}),
	retry: msg({ message: "Retry", context: "applications.insights.retry" }),
	export: msg({ message: "Export PNG", context: "applications.insights.export" }),
	exportError: msg({
		message: "Could not export the funnel. Try again.",
		context: "applications.insights.exportError",
	}),
	exported: msg({ message: "Exported pipeline-flow.png", context: "applications.insights.exported" }),
};
