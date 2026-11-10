import { afterEach, expect, it, vi } from "vite-plus/test";
import { formatRelativeTime, formatRelativeTimeUnit } from "./locale";

afterEach(() => vi.useRealTimers());

it.each([
	[1, "قبل ساعة واحدة"],
	[2, "قبل ساعتين"],
	[3, "قبل 3 ساعات"],
	[11, "قبل 11 ساعة"],
	[100, "قبل 100 ساعة"],
])("formats Arabic %i-hour inflection with Latin digits and unbreakable words", (hours, expected) => {
	expect(formatRelativeTimeUnit(-hours, "hour", "ar-SA")).toBe(expected.replaceAll(" ", "\u00a0"));
});

it("keeps English number and unit together in document, application and history timestamps", () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
	expect(formatRelativeTime("2026-11-10T00:00:00Z", "en-US")).toBe("14\u00a0hours\u00a0ago");
	expect(formatRelativeTime("2026-11-10T00:00:00Z", "ar-SA")).toBe("قبل\u00a014\u00a0ساعة");
});

it.each([
	[1, "خلال دقيقة واحدة"],
	[2, "خلال دقيقتين"],
	[3, "خلال 3 دقائق"],
	[11, "خلال 11 دقيقة"],
	[100, "خلال 100 دقيقة"],
])("keeps upcoming interview %i-minute inflections unbreakable", (minutes, expected) => {
	expect(formatRelativeTimeUnit(minutes, "minute", "ar-SA")).toBe(expected.replaceAll(" ", "\u00a0"));
});
