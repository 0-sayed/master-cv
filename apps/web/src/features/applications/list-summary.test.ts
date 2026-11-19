import { assert, expect, it } from "vite-plus/test";
import { calendarItems } from "./calendar-test-fixtures";
import { summarizeApplicationGroup } from "./list-summary";

const item = calendarItems(1)[0];
assert(item);
const application = { ...item.application, updatedAt: new Date("2026-11-16T10:00:00Z") };
const now = new Date("2026-11-18T09:00:00Z");

it("selects a future interview even when an overdue follow-up would mask it in the row", () => {
	const summary = summarizeApplicationGroup([{ ...application, followUpAt: new Date("2026-11-17T10:00:00Z") }], now);
	expect(summary.upcoming?.kind).toBe("interview");
	expect(summary.upcoming?.at.toISOString()).toBe("2026-11-18T10:00:00.000Z");
});

it("selects the soonest action across every application independently of row order", () => {
	const earlier = { ...application, followUpAt: new Date("2026-11-18T09:30:00Z"), followUpNote: "Review موعد" };
	for (const rows of [
		[application, earlier],
		[earlier, application],
	]) {
		const step = summarizeApplicationGroup(rows, now).upcoming;
		expect(step?.kind).toBe("follow-up");
		expect(step?.at.toISOString()).toBe("2026-11-18T09:30:00.000Z");
	}
});

it("ignores past actions and closed applications", () => {
	expect(summarizeApplicationGroup([application], new Date("2026-11-19T09:00:00Z")).upcoming).toBeUndefined();
	expect(summarizeApplicationGroup([{ ...application, status: "closed" }], now).upcoming).toBeUndefined();
});

it("keeps an ongoing interview until its end, ahead of a later follow-up", () => {
	const rows = [{ ...application, followUpAt: new Date("2026-11-18T12:00:00Z") }];
	expect(summarizeApplicationGroup(rows, new Date("2026-11-18T10:10:00Z")).upcoming?.kind).toBe("interview");
	expect(summarizeApplicationGroup(rows, new Date("2026-11-18T11:59:00Z")).upcoming?.kind).toBe("follow-up");
});

it("uses the latest update across collapsed rows and leaves an empty group empty", () => {
	const newest = new Date("2026-11-19T10:00:00Z");
	expect(summarizeApplicationGroup([{ ...application, updatedAt: newest }, application], now).updatedAt).toEqual(
		newest,
	);
	expect(summarizeApplicationGroup([], now)).toEqual({ upcoming: undefined, updatedAt: undefined });
});
