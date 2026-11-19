import { expect, it } from "vite-plus/test";
import { formatVersionMoment, formatVersionTime, groupVersionsByDay, type VersionSummary } from "./format";
const version = (id: string, date: string): VersionSummary => ({
	id,
	kind: "auto",
	name: null,
	createdAt: new Date(date),
});
const now = new Date("2026-11-18T10:00:00Z");
it("groups opposite sides of Riyadh midnight despite identical UTC dates", () => {
	const groups = groupVersionsByDay(
		[version("yesterday", "2026-11-17T20:59:00Z"), version("today", "2026-11-17T21:01:00Z")],
		"en-US",
		now,
	);
	expect(groups.map((group) => [group.key, group.label, group.versions[0]?.id])).toEqual([
		["2026-11-18", "Today", "today"],
		["2026-11-17", "Yesterday", "yesterday"],
	]);
});
it.each(["ar-SA", "en-US"])("uses Gregorian dates and Latin digits for %s", (locale) => {
	const groups = groupVersionsByDay([version("old", "2025-11-10T10:00:00Z")], locale, now);
	const month = new Intl.DateTimeFormat(locale, {
		month: "short",
		calendar: "gregory",
		numberingSystem: "latn",
		timeZone: "Asia/Riyadh",
	})
		.formatToParts(new Date("2025-11-10T10:00:00Z"))
		.find((part) => part.type === "month")?.value;
	expect(groups[0]?.dateLabel).toContain(month);
	expect(groups[0]?.dateLabel).toContain("2025");
	expect(formatVersionMoment(new Date("2026-11-18T10:00:00Z"), locale)).toContain(
		locale === "ar-SA" ? "نوفمبر" : "Nov",
	);
	expect(formatVersionTime(new Date("2026-11-17T21:01:00Z"), locale, now)).toContain(
		locale === "ar-SA" ? "اليوم" : "Today",
	);
	expect(groups[0]?.dateLabel).not.toMatch(/[٠-٩]/);
	if (locale === "ar-SA") expect(formatVersionMoment(now, locale)).not.toMatch(/Nov|AM|PM/);
});
it("handles year rollover, stable newest-first ordering, and locale changes", () => {
	const versions = [
		version("old", "2025-12-31T20:59:00Z"),
		version("first", "2025-12-31T21:01:00Z"),
		version("second", "2025-12-31T21:01:00Z"),
	];
	const time = new Date("2026-01-01T10:00:00Z");
	expect(groupVersionsByDay(versions, "en-US", time).map((group) => group.label)).toEqual(["Today", "Yesterday"]);
	expect(groupVersionsByDay(versions, "ar-SA", time)[0]?.versions.map((item) => item.id)).toEqual(["first", "second"]);
	expect(versions.map((item) => item.id)).toEqual(["old", "first", "second"]);
});
