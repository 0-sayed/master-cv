import { expect, it } from "vite-plus/test";
import { parseResumeData } from "./data";
import { formatYearMonth, readLegacyDates } from "./dates";
import { defaultResumeData } from "./default";
import { parsePeriod, parseSingleDate } from "./period";
it.each(["٢٠٢٠ - ٢٠٢٢", "۲۰۲۰ - ۲۰۲۲"])("reads numeric alphabets without inventing month precision: %s", (value) => {
	expect(parsePeriod(value, "ar-SA")).toEqual({ start: { year: 2020 }, end: { year: 2022 }, ongoing: false });
});
it("reads Arabic months and a multiword ongoing marker", () => {
	expect(parseSingleDate("يناير ٢٠٢٠", "ar-SA")).toEqual({ year: 2020, month: 1 });
	expect(parsePeriod("٢٠٢٠ - حتى الآن", "ar-SA")).toEqual({ start: { year: 2020 }, ongoing: true });
});
it("preserves uncertain calendars and original ambiguous evidence", () => {
	expect(readLegacyDates("١٤٤٥ هـ", { locale: "ar-SA", single: false }).raw).toBe("١٤٤٥ هـ");
	expect(readLegacyDates("٠١/٠٢/٢٠٢٤", { locale: "ar-SA", single: false }).raw).toBe("٠١/٠٢/٢٠٢٤");
});
it.each(["يناير ٢٠٢٠ - مارس ٢٠٢٢", "١٤٤٥ هـ", "٠١/٠٢/٢٠٢٤"])(
	"preserves precision and uncertainty through two schema round trips: %s",
	(value) => {
		const dates = readLegacyDates(value, { locale: "ar-SA", single: false });
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = "ar-SA";
		data.sections.projects.items = [
			{
				id: "p",
				hidden: false,
				name: "مشروع",
				description: "",
				period: "",
				website: { url: "", label: "", inlineLink: false },
				dates,
			},
		];
		const actual = parseResumeData(parseResumeData(data)).sections.projects.items[0]?.dates;
		expect(actual).toEqual(dates);
		if (value.startsWith("يناير")) expect(actual).toEqual({ start: "2020-01", end: "2022-03", present: false });
	},
);

it.each(["short", "long"] as const)(
	"D33 structured Arabic %s dates use Gregorian months and Western digits",
	(format) => {
		const value = formatYearMonth("2022-03", { locale: "ar-SA", format });
		expect(value).toContain("مارس");
		expect(value).toContain("2022");
		expect(value).not.toMatch(/[٠-٩۰-۹]/u);
	},
);
