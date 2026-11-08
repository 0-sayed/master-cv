import { expect, it } from "vite-plus/test";
import { expectedExportDateDisplay, expectedExportTextDisplay } from "./expected-display";

it.each([
	["2015 - 2017", "2015-2017"],
	["١٤٤٠ هـ – ١٤٤١ هـ", "1440-1441 هـ"],
	["۱۴۴۰ هـ - ۱۴۴۱ هـ", "1440-1441 هـ"],
	["من 2010 إلى 2012", "من 2010 إلى 2012"],
	["من 2010 حتى 2012", "من 2010 حتى 2012"],
	["01/2020 – 12/2021", "01/2020-12/2021"],
	["2020-01 – 2021-12", "2020-01-2021-12"],
	["2020-01-02 – 2021-12-31", "2020-01-02-2021-12-31"],
	["١٢/٠٩/٢٠٣٢", "12/09/2032"],
	["1440 هـ", "1440 هـ"],
	["2024 – Present", "2024 - Present"],
	["2024 – حتى الآن", "2024 - حتى الآن"],
])("derives D31 display independently: %s", (source, expected) => {
	expect(expectedExportDateDisplay(source)).toBe(expected);
});
it.each([
	"2017 - 2015",
	"2015 -",
	"2015 هـ - 2017",
	"2020-13 – 2021-12",
	"2020-02-30 – 2021-03-01",
	"1400/01/01 هـ - 1401/01/01 هـ",
	"+966 2015 - 2017",
	"salary 2015 - 2017",
	"https://example.test/2015-2017",
])("leaves unsupported/non-date content intact: %s", (source) => {
	expect(expectedExportDateDisplay(source)).toBe(source);
});

it("D33 leaves English date spacing intact while normalizing digits", () => {
	expect(expectedExportDateDisplay("٢٠١٥ – ۲۰۱۷", false)).toBe("2015 – 2017");
});

it("D33 source display keeps tatweel and the exact owner labelled range", () => {
	expect(expectedExportTextDisplay("١٤٤٥-١٤٤٦ هـ أَحْمَدُ ـٰ")).toBe("1445-1446 هـ أحمد ـ");
	expect(expectedExportDateDisplay("من 2009 إلى 2011")).toBe("من 2009 إلى 2011");
});

it.each(["حتى الآن", "حالياً", "حاليا", "الآن", "الحاضر"])("projects the current RTL ongoing label: %s", (label) => {
	expect(expectedExportTextDisplay(expectedExportDateDisplay(`2020-${label}`))).toBe(
		`2020 - ${label === "حالياً" ? "حاليا" : label}`,
	);
});
