import { expect, it } from "vite-plus/test";
import { freeTextDateRuns } from "./free-text-dates";

it.each([
	["١٤٤٠ هـ - ١٤٤١ هـ", ["1440", " هـ - ", "1441", " هـ"]],
	["1440 هـ – 1441 هـ", ["1440", " هـ - ", "1441", " هـ"]],
	["2010 - 2012", ["2010", " - ", "2012"]],
	["2020-03-01 – 2021-04-02", ["01/03/2020", " - ", "02/04/2021"]],
])("recognizes only ordered date range %s", (source, expected) => {
	expect(freeTextDateRuns(source).map((run) => run.text)).toEqual(expected);
	expect(freeTextDateRuns(source).some((run) => run.numeric)).toBe(true);
});
it.each([
	"2012 - 2010",
	"12 - 20",
	"123456 - 234567",
	"+966 2010 - 2012",
	"https://example.test/2010-2012",
	"x2010 - 2012",
	"2010 - 2012x",
	"2010-15 – 2012-16",
	"1440 هـ - 2021 م",
	"2000 - 2500",
	"Call 020 2010 - 2012",
	"2010 - 2012 5555",
	"Phone: 2010 - 2012",
	"2019-02-31 - 2020-02-31",
	"2019-02-29 - 2020-02-29",
	"Salary 2010 - 2012 SAR",
])("leaves non-dates and unsafe ranges unchanged: %s", (source) => {
	expect(freeTextDateRuns(source)).toEqual([{ text: source }]);
});

it("uses the whole paragraph to protect inline-formatted contacts", () => {
	expect(freeTextDateRuns(" 2010 - 2012", "+966 2010 - 2012")).toEqual([{ text: " 2010 - 2012" }]);
});

it.each([
	["من 2009 إلى 2011", "من 2009 إلى 2011"],
	["من ٢٠٠٩ إلى ۲۰۱۱", "من 2009 إلى 2011"],
	["من 2009 حتى 2011", "من 2009 حتى 2011"],
	["من ٢٠٠٩ وحتى ٢٠١١", "من 2009 وحتى 2011"],
	["بين 2009 و2011", "بين 2009 و2011"],
	["عملت من 2009 إلى 2011 في الشركة", "عملت من 2009 إلى 2011 في الشركة"],
])("D33 preserves labelled free-text range %s except Western digits", (source, expected) => {
	expect(freeTextDateRuns(source)).toEqual([{ text: expected }]);
});

it("keeps both Hijri abbreviations beside their natural RTL endpoints", () => {
	expect(freeTextDateRuns("١٤٤٥ هـ - ١٤٤٦ هـ")).toEqual([
		{ text: "1445", numeric: true },
		{ text: " هـ - " },
		{ text: "1446", numeric: true },
		{ text: " هـ" },
	]);
});
