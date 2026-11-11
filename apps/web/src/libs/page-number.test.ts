import { describe, expect, it } from "vite-plus/test";
import { formatPageNumberInSentence } from "./page-number";

describe("formatPageNumberInSentence", () => {
	it.each([
		[1, "الأولى"],
		[2, "الثانية"],
		[3, "الثالثة"],
		[4, "الرابعة"],
		[5, "الخامسة"],
		[6, "السادسة"],
		[7, "السابعة"],
		[8, "الثامنة"],
		[9, "التاسعة"],
		[10, "العاشرة"],
		[11, "11"],
	])("formats Arabic page %i as a feminine ordinal through ten", (page, expected) => {
		expect(formatPageNumberInSentence(page, "ar-SA")).toBe(expected);
	});

	it.each([1, 2, 10, 11])("keeps English page %i as Latin digits", (page) => {
		expect(formatPageNumberInSentence(page, "en-US")).toBe(String(page));
	});
});
