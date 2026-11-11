import { expect, it } from "vite-plus/test";
import { analyzeDates } from "./analyze/dates";
import { buildResumeSemantics } from "./analyze/semantics";
import { buildExtractedDocument } from "./extract";
import { analyzePdfResume } from "./index";
import { makeRawExtraction } from "./test-fixtures";
const now = new Date("2024-06-15T00:00:00Z");
it.each(["حتى الآن", "الآن", "حاليًا", "حالياً", "حاليا", "حتى اليوم"])(
	"recognizes an Arabic current-role range in extracted PDF text: %s",
	(marker) => {
		const text = `2020 - ${marker}`;
		const result = analyzeDates(buildExtractedDocument(makeRawExtraction({ lines: [text] })), "ar-SA", now);
		expect(result.tokens).toEqual([
			expect.objectContaining({ raw: text, parsed: true, startYear: 2020, endYear: null, ongoing: true }),
		]);
		expect(result.unparseableRanges).toEqual([]);
	},
);
it("recognizes Arabic headings without enabling English role heuristics", () => {
	const raw = makeRawExtraction({
		lines: [
			"أحمد العتيبي",
			"a@example.test",
			"+966 50 123 4567",
			"الخِبْـرَة العَمَلِيَّة",
			"شركة الأفق | مهندس برمجيات",
			"٢٠٢٠ - ٢٠٢٢",
			"التعليم",
			"جامعة الملك سعود",
			"المهارات",
			"Node.js / SQL",
		],
		metadata: { language: "ar-SA" },
	});
	const report = analyzePdfResume(raw, { now, locale: "ar-SA" });
	for (const code of ["NO_EXPERIENCE_SECTION", "NO_EDUCATION_SECTION", "NO_SKILLS_SECTION", "NO_RECOGNIZED_HEADINGS"])
		expect(report.checks.find((check) => check.code === code)?.status).toBe("pass");
	expect(report.checks.find((check) => check.code === "NO_ROLE_LINES")).toMatchObject({
		status: "skip",
		skipReason: "not-english",
	});
});
it.each(["٢٠٢٠ - ٢٠٢٢", "۲۰۲۰ - ۲۰۲۲", "يناير ٢٠٢٠ - مارس ٢٠٢٢", "٢٠٢٠ - حتى الآن"])(
	"scans Arabic date candidates before parsing: %s",
	(text) => {
		const raw = makeRawExtraction({ lines: [text] });
		const result = analyzeDates(buildExtractedDocument(raw), "ar-SA", now);
		expect(result.tokens).toHaveLength(1);
		expect(result.tokens[0]).toMatchObject({ raw: text, parsed: true, startYear: 2020, ongoing: text.includes("الآن") });
	},
);
it("retains ambiguous numeric source and does not invent a Gregorian Hijri date", () => {
	const raw = makeRawExtraction({ lines: ["٠١/٠٢/٢٠٢٤", "١٤٤٥ هـ"] });
	const result = analyzeDates(buildExtractedDocument(raw), "ar-SA", now);
	expect(result.ambiguousNumericDates).toEqual(["٠١/٠٢/٢٠٢٤"]);
	expect(result.tokens.some((token) => token.startYear === 1445)).toBe(false);
});

it.each([
	["شركة الأفق 2020 - 2022", "2020 - 2022", false, false],
	["شركة الأفق 2022 - 2020", "2022 - 2020", true, false],
	["شركة الأفق 2030 - 2032", "2030 - 2032", false, true],
	["شركة الأفق ٢٠٢٠ - ٢٠٢٢", "٢٠٢٠ - ٢٠٢٢", false, false],
])("finds numeric ranges after non-month words: %s", (line, date, reversed, future) => {
	const result = analyzeDates(buildExtractedDocument(makeRawExtraction({ lines: [line] })), "ar-SA", now);
	expect(result.tokens).toHaveLength(1);
	expect(result.tokens[0]).toMatchObject({ raw: date, parsed: true, reversed, future });
});
it.each([
	[null, "en-US", "خبرة في تطوير البرمجيات", false],
	[null, "ar-SA", "Software engineer with experience in building systems", true],
	["ar-SA", "en-US", "Software engineer with experience in building systems", false],
	["en-US", "ar-SA", "خبرة في تطوير البرمجيات", true],
] as const)("uses declared language or text, not date locale (%s, %s)", (language, locale, text, isEnglish) => {
	const raw = makeRawExtraction({ lines: [text], metadata: { language } });
	expect(buildResumeSemantics(raw, buildExtractedDocument(raw), { locale, now }).quality.isEnglish).toBe(isEnglish);
});
