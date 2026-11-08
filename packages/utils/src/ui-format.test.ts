import { describe, expect, it } from "vite-plus/test";
import { formatUiNumber, formatUiTimestamp, normalizeSearchText } from "./ui-format";
describe("interface formatting", () => {
	it.each(["ar-SA", "en-US"] as const)("formats Latin digits and explicit fractions/percent in %s", (locale) => {
		expect(
			formatUiNumber(1234.5, locale, { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
		).toBe("1234.50");
		expect(formatUiNumber(0.15, locale, { style: "percent", maximumFractionDigits: 0 })).toContain("15");
		expect(formatUiNumber(12, locale, { numberingSystem: "arab" })).toBe("12");
	});
	it("forces Gregorian Riyadh instants even when a caller supplies a different zone", () => {
		const value = new Date("2026-01-01T22:30:00Z");
		expect(
			formatUiTimestamp(value, "en-US", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
				timeZone: "UTC",
			}),
		).toBe("01/02/2026, 01:30");
		expect(() => formatUiTimestamp(new Date(Number.NaN), "ar-SA", {})).toThrow(RangeError);
	});
	it("normalizes comparison text only and preserves meaningful Arabic letters", () => {
		const title = "سِـيرة ٢";
		expect(normalizeSearchText(title)).toBe("سيرة 2");
		expect(normalizeSearchText("سيرة ۲")).toBe(normalizeSearchText("سيرة 2"));
		expect(title).toBe("سِـيرة ٢");
		expect(normalizeSearchText("أإآى")).toBe("أإآى");
		expect(normalizeSearchText("e\u0301")).toBe("é");
	});
});
