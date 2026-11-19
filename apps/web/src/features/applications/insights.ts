import type { Application } from "./types";
import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { fromZonedDateTime } from "@reactive-resume/utils/timezone";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";

export type InsightApplication = Pick<
	Application,
	"id" | "status" | "closedReason" | "source" | "appliedAt" | "createdAt" | "activity" | "resumeId"
>;
export type InsightDocument = { id: string; type: string; application: { id: string } | null };
type InsightCount = { count: number; denominator: number; percentage: number | null };
type SourceRow = InsightCount & { kind: "source" | "other" | "missing"; label: string };
export type ApplicationInsightsData = {
	tracked: number;
	sent: number;
	replied: number;
	datedReplies: number;
	omittedDurations: number;
	medianDays: number | null;
	funnel: (InsightCount & { status: ApplicationStatus })[];
	weeks: (InsightCount & { start: Date; end: Date; current: boolean })[];
	sources: { rows: SourceRow[]; other: SourceRow[]; missing: SourceRow | null; all: SourceRow[] };
	interviewed: number;
	interviewOutcomes: (InsightCount & { outcome: string })[];
	comparison: {
		tailored: { sent: number; replied: number };
		base: { sent: number; replied: number };
		excluded: number;
	} | null;
};

const FORWARD_HISTORY = ["saved", "applied", "screening", "interview", "offer"] as const;
const countRow = (count: number, denominator: number): InsightCount => ({
	count,
	denominator,
	percentage: denominator ? (count / denominator) * 100 : null,
});

/** One application contributes once to each historical population. The injected clock excludes future activity. */
export function computeApplicationInsights(
	applications: readonly InsightApplication[],
	documents: readonly InsightDocument[] | undefined,
	now: Date,
): ApplicationInsightsData {
	const validTime = (value: Date) => {
		const time = new Date(value).getTime();
		return Number.isFinite(time) && time <= now.getTime() ? time : null;
	};
	const records = [...new Map(applications.map((application) => [application.id, application])).values()].map(
		(application) => {
			const stages = application.activity
				.flatMap((entry) =>
					entry.type === "stage" && validTime(entry.at) !== null
						? [{ stage: entry.stage, at: new Date(entry.at).getTime() }]
						: [],
				)
				.sort((a, b) => a.at - b.at);
			const rank = Math.max(
				FORWARD_HISTORY.indexOf(application.status as (typeof FORWARD_HISTORY)[number]),
				...stages.map((entry) => FORWARD_HISTORY.indexOf(entry.stage as (typeof FORWARD_HISTORY)[number])),
			);
			const sent = rank >= 1;
			const sentAt = sent
				? (stages.find((entry) => entry.stage === "applied")?.at ?? validTime(application.appliedAt))
				: null;
			const reply = sent
				? stages.find(
						(entry) =>
							(sentAt === null || entry.at >= sentAt) &&
							(REPLY_STAGES.has(entry.stage) ||
								(entry.stage === "closed" && application.closedReason === "not-selected")),
					)
				: undefined;
			return { application, rank, sent, sentAt, reply };
		},
	);
	const sentRecords = records.filter((row) => row.sent);
	const sent = sentRecords.length;
	const replied = sentRecords.filter((row) => row.reply).length;
	const durations = sentRecords.flatMap((row) =>
		row.reply && row.sentAt !== null ? [(row.reply.at - row.sentAt) / DAY_MS] : [],
	);
	const localDay = formatUiTimestamp(now, "en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
	const [month, day, year] = localDay.split("/");
	const midnight = fromZonedDateTime(`${year}-${month}-${day}`, "00:00", "Asia/Riyadh");
	if (!midnight) throw new Error("Invalid insight clock");
	const sunday = midnight.getTime() - new Date(midnight.getTime() + 3 * 3600000).getUTCDay() * DAY_MS;
	const firstWeek = sunday - 7 * 7 * DAY_MS;
	const periodSent = sentRecords.filter((row) => row.sentAt !== null && row.sentAt >= firstWeek).length;
	const weeks = Array.from({ length: 8 }, (_, index) => {
		const start = firstWeek + index * 7 * DAY_MS;
		const end = start + 7 * DAY_MS;
		return {
			...countRow(
				sentRecords.filter((row) => row.sentAt !== null && row.sentAt >= start && row.sentAt < end).length,
				periodSent,
			),
			start: new Date(start),
			end: new Date(end),
			current: index === 7,
		};
	});
	const sourceCounts = new Map<string, number>();
	let missingCount = 0;
	for (const { application } of records) {
		const label = application.source;
		if (!label?.trim()) missingCount++;
		else sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
	}
	const named: SourceRow[] = [...sourceCounts]
		.sort(([a, ac], [b, bc]) => bc - ac || (a < b ? -1 : a > b ? 1 : 0))
		.map(([label, count]) => ({ ...countRow(count, records.length), kind: "source", label }));
	const other = named.length > 6 ? named.slice(5) : [];
	const rows: SourceRow[] = other.length
		? [
				...named.slice(0, 5),
				{
					...countRow(
						other.reduce((sum, row) => sum + row.count, 0),
						records.length,
					),
					kind: "other",
					label: "",
				},
			]
		: named;
	const missing: SourceRow | null = missingCount
		? { ...countRow(missingCount, records.length), kind: "missing", label: "" }
		: null;
	const interviewed = sentRecords.filter((row) => row.rank >= 3);
	const outcomes = [
		"interview",
		"offer",
		"accepted",
		"not-selected",
		"withdrew",
		"accepted-other",
		"no-response",
		"unknown",
	];
	const interviewOutcomes = outcomes.map((outcome) => ({
		outcome,
		...countRow(
			interviewed.filter(
				({ application }) =>
					(application.status === "closed"
						? (application.closedReason ?? "unknown")
						: ["interview", "offer"].includes(application.status)
							? application.status
							: "unknown") === outcome,
			).length,
			interviewed.length,
		),
	}));
	let comparison: ApplicationInsightsData["comparison"] = null;
	if (documents !== undefined) {
		comparison = { tailored: { sent: 0, replied: 0 }, base: { sent: 0, replied: 0 }, excluded: 0 };
		const madeFor = new Map(
			documents
				.filter((document) => document.type === "resume")
				.map((document) => [document.id, document.application?.id]),
		);
		for (const { application, reply } of sentRecords) {
			if (!application.resumeId) {
				comparison.excluded++;
				continue;
			}
			const group = madeFor.get(application.resumeId) === application.id ? comparison.tailored : comparison.base;
			group.sent++;
			if (reply) group.replied++;
		}
	}
	return {
		tracked: records.length,
		sent,
		replied,
		datedReplies: durations.length,
		omittedDurations: replied - durations.length,
		medianDays: median(durations),
		funnel: FORWARD_HISTORY.slice(1).map((status, index) => ({
			status,
			...countRow(sentRecords.filter((row) => row.rank >= index + 1).length, sent),
		})),
		weeks,
		sources: { rows, other, missing, all: missing ? [...named, missing] : named },
		interviewed: interviewed.length,
		interviewOutcomes,
		comparison,
	};
}

const DAY_MS = 86_400_000;
const REPLY_STAGES = new Set<ApplicationStatus>(["screening", "interview", "offer"]);

function median(values: number[]) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
