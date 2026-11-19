import type { Application } from "./types";
import { describe, expect, it } from "vite-plus/test";
import {
	calendarCounts,
	calendarWeekStart,
	collectInterviews,
	dayKey,
	groupByDay,
	monthGrid,
	moveCalendarFocus,
	upcomingInterviews,
	fromDateTimeLocal,
	toDateTimeLocal,
} from "./interviews";

describe("interviews", () => {
	it("round-trips datetime-local values", () => {
		const iso = fromDateTimeLocal("2026-10-05T09:30");
		expect(iso).not.toBeNull();
		expect(toDateTimeLocal(iso ?? "")).toBe("2026-10-05T09:30");
		expect(fromDateTimeLocal("")).toBeNull();
	});
});

const application: Application = {
	id: "application",
	company: "Example Co",
	role: "Engineer",
	status: "interview",
	closedReason: null,
	coverLetterId: null,
	selectedResumeVersionId: null,
	sentResumeRecordedAt: null,
	sentResumeVersionId: null,
	sentCoverLetterVersionId: null,
	sentCheckScore: null,
	requirements: [],
	location: null,
	salary: null,
	source: null,
	sourceUrl: null,
	notes: null,
	tags: [],
	contacts: [],
	activity: [],
	appliedAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
	resumeId: null,
	jobDescription: null,
	postingSource: null,
	matchScore: null,
	aiMetadata: null,
	resumeFileUrl: null,
	resumeFileName: null,
	coverLetterUrl: null,
	coverLetterName: null,
	followUpAt: null,
	followUpNote: null,
};

function scheduled(at: string, id = "round") {
	return {
		...application,
		activity: [
			{
				id,
				type: "interview" as const,
				at: new Date(at),
				kind: "technical" as const,
				durationMinutes: 60,
				location: "Office",
				notes: "",
				participants: [],
				audience: "hiring-manager" as const,
				timezone: "Asia/Riyadh",
			},
		],
	};
}
it("uses_account_zone_at_month_boundary", () => {
	const date = new Date("2026-11-30T21:30:00Z");
	expect(dayKey(date, "Asia/Riyadh")).toBe("2026-12-01");
	expect(dayKey(date, "UTC")).toBe("2026-11-30");
	expect([...groupByDay(collectInterviews([scheduled(date.toISOString())]), "Asia/Riyadh").keys()]).toEqual([
		"2026-12-01",
	]);
});
it("derives_week_start_from_locale", () => {
	expect(calendarWeekStart("en-US")).toBe(0);
	expect(calendarWeekStart("en-GB")).toBe(1);
	expect(calendarWeekStart("ar-SA")).toBe(0);
});
it("clamps_focus_at_month_end", () => {
	expect(dayKey(moveCalendarFocus(new Date(2027, 0, 31), "PageDown", "ltr", 0))).toBe("2027-02-28");
	expect(dayKey(moveCalendarFocus(new Date(2027, 0, 31), "ArrowRight", "rtl", 0))).toBe("2027-01-30");
	expect(dayKey(moveCalendarFocus(new Date(2027, 0, 31), "Home", "ltr", 1))).toBe("2027-01-25");
});
it.each(["en-US", "ar-SA"])("counts_interviews_not_activity (%s)", (locale) => {
	const apps = Array.from({ length: 15 }, (_, i) =>
		scheduled(
			`2026-${i < 9 ? "11" : "12"}-${String(i < 9 ? 18 + i : 1 + i - 9).padStart(2, "0")}T10:00:00Z`,
			String(i),
		),
	);
	const interviews = collectInterviews(apps);
	expect(
		calendarCounts(
			interviews,
			new Date(2026, 10, 1),
			monthGrid(new Date(2026, 10, 1), calendarWeekStart(locale)),
			"Asia/Riyadh",
			new Date("2026-11-18T00:00:00Z"),
		),
	).toEqual({ month: 9, grid: 15, upcoming: 15 });
	expect(
		collectInterviews([
			{ ...application, activity: [{ id: "note", type: "note", at: new Date(), text: "No interview" }] },
		]),
	).toHaveLength(0);
});
it("keeps ongoing interviews and sorts ties by application and round", () => {
	const a = scheduled("2026-11-18T10:00:00Z", "b");
	const b = { ...scheduled("2026-11-18T10:00:00Z", "a"), id: "z" };
	const items = collectInterviews([b, a]);
	expect(items.map((x) => x.application.id)).toEqual([a.id, b.id]);
	expect(upcomingInterviews(items, new Date("2026-11-18T10:30:00Z"))).toHaveLength(2);
	expect(upcomingInterviews(items, new Date("2026-11-18T11:00:01Z"))).toHaveLength(0);
});
