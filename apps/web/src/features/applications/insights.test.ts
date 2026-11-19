import type { InsightApplication } from "./insights";
import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { describe, expect, it } from "vite-plus/test";
import { computeApplicationInsights } from "./insights";

const clock = new Date("2026-11-18T09:00:00Z");
const event = (stage: ApplicationStatus, at: string) => ({
	id: `${stage}${at}`,
	type: "stage" as const,
	stage,
	at: new Date(at),
});
const job = (id: string, overrides: Partial<InsightApplication> = {}): InsightApplication => ({
	id,
	status: "applied",
	closedReason: null,
	source: "LinkedIn",
	resumeId: "base",
	appliedAt: new Date("2026-11-10T09:00:00Z"),
	createdAt: new Date("2026-11-01T09:00:00Z"),
	activity: [],
	...overrides,
});

describe("computeApplicationInsights", () => {
	it("counts historical applications once", () => {
		const closed = job("a", {
			status: "closed",
			closedReason: "not-selected",
			activity: [
				event("interview", "2026-11-12T09:00:00Z"),
				event("applied", "2026-11-10T09:00:00Z"),
				event("interview", "2026-11-11T09:00:00Z"),
			],
		});
		const result = computeApplicationInsights(
			[closed, closed, job("b", { status: "saved" }), job("c", { status: "closed" })],
			[],
			clock,
		);
		expect([result.tracked, result.sent, result.replied]).toEqual([3, 1, 1]);
		expect(result.funnel.map((row) => row.count)).toEqual([1, 1, 1, 0]);
		expect(result.interviewOutcomes.reduce((sum, row) => sum + row.count, 0)).toBe(result.interviewed);
	});
	it("distinguishes replies from appointments and closures", () => {
		const rows = ["withdrew", "accepted-other", "no-response", "not-selected"].map((reason, index) =>
			job(String(index), {
				status: "closed",
				closedReason: reason as InsightApplication["closedReason"],
				activity: [event("applied", "2026-11-10T09:00:00Z"), event("closed", "2026-11-12T09:00:00Z")],
			}),
		);
		rows.push(
			job("future", {
				activity: [
					event("screening", "2027-01-01T00:00:00Z"),
					{ id: "note", type: "note", at: clock, text: "Interview booked" },
				],
			}),
		);
		expect(computeApplicationInsights(rows, [], clock).replied).toBe(1);
	});
	it("keeps elapsed time precise and exposes omissions", () => {
		const rows = [6, 30].map((hours, index) =>
			job(String(index), {
				activity: [event("screening", new Date(Date.parse("2026-11-10T09:00:00Z") + hours * 3600000).toISOString())],
			}),
		);
		expect(computeApplicationInsights(rows, [], clock).medianDays).toBe(0.75);
		rows.push(
			job("zero", { activity: [event("screening", "2026-11-10T09:00:00Z")] }),
			job("missing", {
				appliedAt: new Date("invalid"),
				status: "screening",
				activity: [event("screening", "2026-11-12T00:00:00Z")],
			}),
			job("negative", { activity: [event("screening", "2026-11-01T00:00:00Z")] }),
		);
		const result = computeApplicationInsights(rows, [], clock);
		expect(result.datedReplies).toBe(3);
		expect(result.omittedDurations).toBe(1);
		expect(result.datedReplies + result.omittedDurations).toBe(result.replied);
		expect(
			computeApplicationInsights(
				[job("same-day", { activity: [event("screening", "2026-11-10T09:00:00Z")] })],
				[],
				clock,
			).medianDays,
		).toBe(0);
	});
	it("uses Riyadh Sunday weeks and excludes future sends", () => {
		const sunday = new Date("2026-11-14T21:00:00Z");
		const result = computeApplicationInsights(
			[
				job("past", { appliedAt: new Date("2026-11-14T20:59:59Z") }),
				job("current", { appliedAt: sunday }),
				job("future", { appliedAt: clock }),
			],
			[],
			sunday,
		);
		expect(result.weeks).toHaveLength(8);
		expect(result.weeks[7]?.start.toISOString()).toBe(sunday.toISOString());
		expect(result.weeks.map((row) => row.count)).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
	});
	it("groups complete sources without synthetic label collisions", () => {
		const sources = ["Other", "Not recorded", "A", "B", "C", "D", "E", "", null];
		const result = computeApplicationInsights(
			sources.map((source, i) => job(String(i), { source })),
			[],
			clock,
		);
		expect(result.sources.rows.filter((row) => row.kind === "other")).toHaveLength(1);
		expect(result.sources.missing?.count).toBe(2);
		expect(result.sources.all.reduce((sum, row) => sum + row.count, 0)).toBe(9);
		expect(result.sources.rows.every((row) => row.denominator === 9)).toBe(true);
		const six = computeApplicationInsights(
			sources.slice(0, 6).map((source, i) => job(String(i), { source })),
			[],
			clock,
		);
		expect(six.sources.rows).toHaveLength(6);
		expect(six.sources.other).toHaveLength(0);
		expect(six.sources.rows.every((row) => row.kind === "source")).toBe(true);
	});
	it("reconciles interview outcomes", () => {
		const reasons = ["accepted", "not-selected", "withdrew", "accepted-other", "no-response", null] as const;
		const rows = reasons.map((closedReason, index) =>
			job(String(index), {
				status: "closed",
				closedReason,
				activity: [event("interview", "2026-11-12T09:00:00Z")],
			}),
		);
		rows.push(job("interview", { status: "interview" }), job("offer", { status: "offer" }));
		const data = computeApplicationInsights(rows, [], clock);
		expect(data.interviewed).toBe(8);
		expect(data.interviewOutcomes.map((row) => row.outcome)).toEqual([
			"interview",
			"offer",
			"accepted",
			"not-selected",
			"withdrew",
			"accepted-other",
			"no-response",
			"unknown",
		]);
		expect(data.interviewOutcomes.map((row) => row.count)).toEqual(Array(8).fill(1));
		expect(data.interviewOutcomes.every((row) => row.denominator === 8)).toBe(true);
	});
	it("classifies only matching document and application pairs", () => {
		const rows = [job("a", { resumeId: "tailored" }), job("b"), job("c", { resumeId: null })];
		expect(computeApplicationInsights(rows, undefined, clock).comparison).toBeNull();
		expect(
			computeApplicationInsights(rows, [{ id: "tailored", type: "resume", application: { id: "a" } }], clock)
				.comparison,
		).toEqual({ tailored: { sent: 1, replied: 0 }, base: { sent: 1, replied: 0 }, excluded: 1 });
	});
});
