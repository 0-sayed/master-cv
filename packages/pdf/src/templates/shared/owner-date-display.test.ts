import { expect, it } from "vite-plus/test";
import { dateDisplay } from "./date-display";

it.each([
	["2020 – 2024", "2020 - 2024"],
	["2015 – حتى الآن", "2015 - حتى الآن"],
	["1999-08 - 2003-12", "08/1999 - 12/2003"],
	["2016-01-2029-05", "01/2016 - 05/2029"],
	["٢٠٢٠-٢٠٢٤", "2020 - 2024"],
])("uses a spaced RTL range without chained dashes: %s", (source, text) => {
	expect(dateDisplay(source, "ar-SA")).toEqual({ text });
});
it("formats an Arabic year-month endpoint without inferring a calendar", () => {
	expect(dateDisplay("1999-08", "ar-SA")).toEqual({ text: "08/1999" });
	expect(dateDisplay("من 2009 إلى 2011", "ar-SA")).toEqual({ text: "من 2009 إلى 2011" });
});
it.each(["2015 – 2017", "1999-08 - 2003-12", "2015 – Present"])("keeps English upstream display: %s", (text) => {
	expect(dateDisplay(text, "en-US")).toEqual({ text });
});
