import type { PdfRuleCode } from "./catalog";
import type { FixtureOptions } from "./test-fixtures";
import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { lintResumeForAts } from "../ats";
import { PDF_ATS_RULE_CODES, pdfRuleCategory, pdfRuleSeverity } from "./catalog";
import { buildExtractedDocument } from "./extract";
import { analyzePdfResume } from "./index";
import { healthyResume, healthyResumeLines, makeRawExtraction, scannedResume, twoColumnResume } from "./test-fixtures";

const now = new Date("2026-11-18T12:00:00Z");
const check = (raw: ReturnType<typeof makeRawExtraction>, code: string) =>
	analyzePdfResume(raw, { now }).checks.find((result) => result.code === code)?.status;

const textOf = (line: (typeof healthyResumeLines)[number]) => (typeof line === "string" ? line : line.text);
const without = (pattern: RegExp) =>
	healthyResume({ lines: healthyResumeLines.filter((line) => !pattern.test(textOf(line))) });
const appended = (text: string) => healthyResume({ lines: [...healthyResumeLines, text] });

const additionalCases: readonly [PdfRuleCode, ReturnType<typeof healthyResume>, ReturnType<typeof healthyResume>?][] = [
	["FILE_TOO_LARGE", healthyResume({ file: { sizeBytes: 3_000_000 } })],
	["LARGE_FILE_SIZE", healthyResume({ file: { sizeBytes: 1_500_000 } })],
	["REPLACEMENT_CHARACTERS", appended("\uFFFD")],
	["PRIVATE_USE_CHARACTERS", appended("\uE001")],
	["LIGATURE_CHARACTERS", appended("ﬁ ﬁ ﬁ")],
	["HIGH_IMAGE_COVERAGE", healthyResume({ pages: { 1: { operators: { imageAreaRatio: 0.8 } } } })],
	["NO_EMAIL", without(/ada@example\.com/)],
	["NO_PHONE", without(/\+44 20 7946 0100/)],
	["NO_PROFESSIONAL_LINK", without(/github\.com/)],
	["NO_SUMMARY_SECTION", without(/^SUMMARY$/)],
	["NO_SKILLS_SECTION", without(/^SKILLS$/)],
	["NO_EDUCATION_SECTION", without(/^EDUCATION$/)],
	["NO_BULLET_POINTS", without(/^•/)],
	["REVERSED_DATE_RANGE", appended("Mar 2022 - Jan 2020")],
	["FUTURE_DATED_ENTRY", appended("Jan 2030 - Present")],
	["UNPARSEABLE_DATE_RANGE", appended("Analyst, Somewhere | Jan 20 - Mar 22")],
	["LOST_WORD_SPACING", appended("designedandshippedreliablesoftwareforcustomers ".repeat(10))],
	["NO_EXPERIENCE_SECTION", without(/^(EXPERIENCE|PROJECTS)$/)],
	["NO_RECOGNIZED_HEADINGS", without(/^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|PUBLICATIONS|AWARDS)$/)],
	["FEW_SECTION_HEADINGS", without(/^(SUMMARY|EDUCATION|SKILLS|PROJECTS|PUBLICATIONS|AWARDS)$/)],
	["NO_DATES_FOUND", without(/(?:19|20)\d{2}/)],
	[
		"NO_CURRENT_ROLE_MARKER",
		healthyResume({
			lines: healthyResumeLines.map((line) => (typeof line === "string" ? line.replace("Present", "2023") : line)),
		}),
	],
	[
		"ALL_CAPS_RUNS",
		healthyResume({
			lines: [
				...healthyResumeLines,
				...Array.from({ length: 10 }, () => "THIS IS AN ENTIRE SENTENCE IN CAPITAL LETTERS"),
			],
		}),
	],
	[
		"SMALL_BODY_TEXT",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" ? { text: line, size: 7 } : { ...line, size: 7 },
			),
		}),
	],
	[
		"NARROW_PAGE_MARGINS",
		healthyResume({
			lines: healthyResumeLines.map((line, index) =>
				typeof line === "string" ? { text: line, x: 4, y: 4 + index * 14 } : { ...line, x: 4, y: 4 + index * 14 },
			),
		}),
	],
	[
		"MULTIPLE_EMAILS",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" && line.includes("ada@example.com") ? `${line} ada@personal.test` : line,
			),
		}),
	],
	["GARBLED_TEXT", appended("\uE000".repeat(50))],
	["MULTI_COLUMN_LAYOUT", twoColumnResume()],
	["READING_ORDER_INVERSION", twoColumnResume()],
	[
		"COLUMN_GUTTER",
		twoColumnResume({
			streamOrder: (lines) => [...lines].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0)),
		}),
	],
	[
		"MANY_DISTINCT_FONTS",
		healthyResume({
			lines: healthyResumeLines.map((line, index) =>
				typeof line === "string" ? { text: line, fontRef: `font-${index}` } : { ...line, fontRef: `font-${index}` },
			),
		}),
	],
	["TEXT_OUTSIDE_PAGE", healthyResume({ lines: [...healthyResumeLines, { text: "Outside page", x: -30, y: 100 }] })],
	["BARE_URL_WITHOUT_PROTOCOL", appended("www.example.com")],
	["AMBIGUOUS_NUMERIC_DATE", appended("05/06/2020")],
	[
		"PHONE_FORMAT_UNUSUAL",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" ? line.replace("+44 20 7946 0100", "+1 (1234) 123-456-7890") : line,
			),
		}),
	],
	["FIRST_PERSON_PRONOUNS", appended("I led my team. I designed my work. I improved my systems.")],
	["LONG_BULLETS", appended(`• Delivered ${"important improvements for the product and its customers ".repeat(8)}.`)],
	[
		"REPEATED_PHRASES",
		healthyResume({
			lines: [
				...healthyResumeLines,
				...Array.from({ length: 5 }, () => "• Delivered the project to customers successfully."),
			],
		}),
	],
	["NON_STANDARD_BULLET_GLYPHS", appended("\uE001 Delivered the project successfully.")],
	[
		"HEADINGS_NOT_DISTINGUISHED",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" ? line : { ...line, text: line.text.toLowerCase(), size: 10, fontRef: "g_d0_f1" },
			),
		}),
	],
	[
		"NO_QUANTIFIED_IMPACT",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" && line.startsWith("•") ? "• Helped the team with daily activities." : line,
			),
		}),
	],
	[
		"WEAK_ACTION_VERBS",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" && line.startsWith("•") ? "• Helped the team with daily activities." : line,
			),
		}),
	],
	["NO_NAME_LINE", healthyResume({ lines: healthyResumeLines.slice(1) })],
	[
		"NO_ROLE_LINES",
		healthyResume({ lines: healthyResumeLines.filter((line) => !/\s(?:[|·–—]|at)\s|,\s/.test(textOf(line))) }),
	],
	["TEXT_IN_MARGIN_ZONE", healthyResume({ lines: [...healthyResumeLines, { text: "ada@example.com", x: 2, y: 15 }] })],
	[
		"EMPLOYMENT_GAP",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" ? line.replace("Mar 2015 - Dec 2019", "Mar 2010 - Dec 2012") : line,
			),
		}),
	],
	["READING_ORDER_RISK", healthyResume({ streamOrder: (lines) => [...lines].reverse() })],
	[
		"TABLE_LIKE_LAYOUT",
		healthyResume({
			lines: Array.from({ length: 15 }, (_, row) =>
				[56, 200, 350].map((x, column) => ({ text: `Column ${column} data`, x, y: 60 + row * 20 })),
			).flat(),
		}),
	],
	[
		"TIGHT_LINE_SPACING",
		healthyResume({
			lines: healthyResumeLines.map((line, index) =>
				typeof line === "string" ? { text: line, y: 60 + index * 8 } : { ...line, y: 60 + index * 8 },
			),
		}),
	],
	[
		"DENSE_PAGE",
		healthyResume({
			lines: Array.from({ length: 65 }, (_, index) => ({
				text: "An experience with enough words to fill a substantial amount of page space",
				y: 10 + index * 12,
				size: 12,
			})),
		}),
	],
	[
		"CONTACT_NOT_ON_FIRST_PAGE",
		healthyResume({
			pageCount: 2,
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" && line.includes("ada@example.com") ? { text: line, page: 2 } : line,
			),
		}),
	],
	["MIXED_DATE_FORMATS", healthyResume({ lines: [...healthyResumeLines, "2010 - 2012", "2013 - 2014"] })],
	["LOW_TEXT_DENSITY", makeRawExtraction({ lines: ["Jane Doe"] })],
	["VERY_SHORT_DOCUMENT", makeRawExtraction({ lines: ["Jane Doe"] })],
	[
		"SPLIT_CHARACTER_SPACING",
		healthyResume({
			lines: healthyResumeLines.map((line) =>
				typeof line === "string" ? { text: line, perCharacter: true } : { ...line, perCharacter: true },
			),
		}),
		healthyResume({ lines: [...healthyResumeLines, ...healthyResumeLines] }),
	],
	[
		"EMAIL_SPLIT_ACROSS_ITEMS",
		makeRawExtraction({
			lines: [
				...healthyResumeLines
					.filter((line) => !textOf(line).includes("ada@example.com"))
					.map((line, index) =>
						typeof line === "string" ? { text: line, y: 120 + index * 14 } : { ...line, y: 120 + index * 14 },
					),
				{ text: "ada", x: 56, y: 80 },
				{ text: "@", x: 90, y: 80 },
				{ text: "example.com", x: 120, y: 80 },
			],
		}),
	],
	[
		"LINK_TEXT_URL_MISMATCH",
		makeRawExtraction({
			lines: [{ text: "https://github.com/adalovelace", x: 56, y: 60, size: 10 }],
			links: [{ page: 1, url: "https://tracking.example.net/click", rect: [56, 771, 300, 785] }],
		}),
		makeRawExtraction({
			lines: [{ text: "https://github.com/adalovelace", x: 56, y: 60, size: 10 }],
			links: [{ page: 1, url: "https://github.com/adalovelace", rect: [56, 771, 300, 785] }],
		}),
	],
	[
		"FEW_DATES",
		healthyResume({
			lines: [
				...healthyResumeLines.filter((line) => !/(?:19|20)\d{2}/.test(textOf(line))),
				"Jan 2020 - Present",
				"Experience ".repeat(200),
			],
		}),
	],
	[
		"REPEATED_HEADER_FOOTER",
		makeRawExtraction({
			pageCount: 2,
			lines: [
				{ text: "Confidential Resume", page: 1, y: 10 },
				{ text: "Confidential Resume", page: 2, y: 10 },
				{ text: "Experience details", page: 1, y: 90 },
				{ text: "Education details", page: 2, y: 90 },
			],
		}),
		makeRawExtraction({
			pageCount: 2,
			lines: [
				{ text: "First page header", page: 1, y: 10 },
				{ text: "Second page header", page: 2, y: 10 },
				{ text: "Experience details", page: 1, y: 90 },
				{ text: "Education details", page: 2, y: 90 },
			],
		}),
	],
];

it("keeps paired examples for every PDF rule", () => {
	const otherPairs = [
		"NO_TEXT_LAYER",
		"IMAGE_ONLY_DOCUMENT",
		"NON_EMBEDDED_FONTS",
		"HIGH_PAGE_COUNT",
		"ENCRYPTED_PDF",
		"XFA_FORM",
		"PDF_PORTFOLIO",
		"ACROFORM_FIELDS",
		"UNTAGGED_PDF",
		"MISSING_DOCUMENT_LANGUAGE",
		"TRUNCATED_ANALYSIS",
		"TYPE3_FONT",
		"INVALID_EMBEDDED_FONT",
		"ROTATED_PAGES",
		"NON_STANDARD_PAGE_SIZE",
		"INVISIBLE_TEXT",
		"WHITE_TEXT",
		"VERTICAL_TEXT",
	];
	expect([...new Set([...additionalCases.map(([code]) => code), ...otherPairs])].sort()).toEqual(
		[...PDF_ATS_RULE_CODES].sort(),
	);
});

it.each(additionalCases)(
	"reports %s only for the matching synthetic document",
	(code, invalid, valid = healthyResume()) => {
		const good = analyzePdfResume(valid, { now }).checks.find((entry) => entry.code === code);
		const report = analyzePdfResume(invalid, { now });
		const bad = report.checks.find((entry) => entry.code === code);
		expect(good?.status).toBe("pass");
		expect(bad).toMatchObject({
			code,
			status: "fail",
			category: pdfRuleCategory(code),
			severity: pdfRuleSeverity(code),
		});
		expect(bad?.findings[0]).toMatchObject({ code, category: pdfRuleCategory(code), severity: pdfRuleSeverity(code) });
		const finding = [...report.findings, ...report.tips].find((entry) => entry.code === code);
		expect(finding).toBeDefined();
		if (finding?.evidence?.page !== undefined) {
			expect(finding.evidence.page).toBeGreaterThanOrEqual(1);
			expect(finding.evidence.page).toBeLessThanOrEqual(invalid.pageCount);
		}
		if (finding?.evidence?.box) {
			expect(Object.values(finding.evidence.box).every(Number.isFinite)).toBe(true);
			expect(finding.evidence.box.width).toBeGreaterThan(0);
			expect(finding.evidence.box.height).toBeGreaterThan(0);
		}
		if (finding?.evidence?.snippet) {
			const normalized = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
			const document = buildExtractedDocument(invalid);
			const snippet = normalized(finding.evidence.snippet.replace(/…$/, ""));
			expect(normalized(document.fullText)).toContain(snippet);
			if (finding.evidence.page !== undefined) {
				const page = document.pages.find((entry) => entry.pageNumber === finding.evidence?.page);
				expect(normalized(page?.lines.map((line) => line.text).join(" ") ?? "")).toContain(snippet);
			}
		}
	},
);

const arabicLines = [
	"محمد علي",
	"mohammed@example.com +٩٦٦ ٥٥ ١٢٣ ٤٥٦٧",
	"الملخص",
	"مهندس برمجيات يقود فرق العمل ويطور الخدمات للعملاء.",
	"الخبرة",
	"مهندس برمجيات في شركة التقنية",
	"٢٠٢٠ - حتى الآن",
	"• قاد تطوير الخدمة وخفض زمن التسليم بنسبة ٢٠٪.",
	"• طور أنظمة الفريق وحسن جودة الخدمات بنسبة ٣٠٪.",
	"• أطلق مشروع التحول وحقق نتائج بنسبة ٤٠٪.",
	"• نظم عملية التطوير وخفض الأخطاء بنسبة ٥٠٪.",
	"التعليم",
	"جامعة الملك سعود",
	"المهارات",
	"البرمجة وتحليل البيانات وإدارة المشاريع",
];

it.each([
	["NO_EMAIL", (line: string) => line.replace("mohammed@example.com", "")],
	["NO_PHONE", (line: string) => line.replace("+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧", "")],
	["NO_EXPERIENCE_SECTION", (line: string) => (line === "الخبرة" ? "" : line)],
	["NO_EDUCATION_SECTION", (line: string) => (line === "التعليم" ? "" : line)],
	["NO_SKILLS_SECTION", (line: string) => (line === "المهارات" ? "" : line)],
	["NO_SUMMARY_SECTION", (line: string) => (line === "الملخص" ? "" : line)],
	["NO_BULLET_POINTS", (line: string) => line.replace(/^•\s*/, "")],
	[
		"NO_RECOGNIZED_HEADINGS",
		(line: string) => (["الملخص", "الخبرة", "التعليم", "المهارات"].includes(line) ? "" : line),
	],
	["FEW_SECTION_HEADINGS", (line: string) => (["الملخص", "التعليم", "المهارات"].includes(line) ? "" : line)],
	["NO_QUANTIFIED_IMPACT", (line: string) => (line.startsWith("•") ? "• شاركت في العمل اليومي مع الفريق." : line)],
	["WEAK_ACTION_VERBS", (line: string) => (line.startsWith("•") ? "• شاركت في العمل اليومي مع الفريق." : line)],
	["FIRST_PERSON_PRONOUNS", (line: string) => (line === "الملخص" ? "أنا قمت بالعمل ولي خبرتي ومهاراتي" : line)],
	["LONG_BULLETS", (line: string) => (line.startsWith("• قاد") ? `• قاد ${"العمل ".repeat(41)}` : line)],
	["NO_DATES_FOUND", (line: string) => (line === "٢٠٢٠ - حتى الآن" ? "" : line)],
	["REVERSED_DATE_RANGE", (line: string) => (line === "٢٠٢٠ - حتى الآن" ? "٢٠٢٤ - ٢٠٢٠" : line)],
	["FUTURE_DATED_ENTRY", (line: string) => (line === "٢٠٢٠ - حتى الآن" ? "٢٠٣٥ - ٢٠٣٦" : line)],
	["NO_CURRENT_ROLE_MARKER", (line: string) => (line === "٢٠٢٠ - حتى الآن" ? "٢٠٢٠ - ٢٠٢٤" : line)],
	["AMBIGUOUS_NUMERIC_DATE", (line: string) => (line === "٢٠٢٠ - حتى الآن" ? "٠١/٠٢/٢٠٢٤" : line)],
] as const)("checks %s with Arabic text", (code, mutate) => {
	const raw = (lines: string[]) => makeRawExtraction({ lines, metadata: { language: "ar-SA" } });
	expect(check(raw(arabicLines), code)).toBe("pass");
	expect(check(raw(arabicLines.map(mutate)), code)).toBe("fail");
});

it("checks an Arabic name line", () => {
	const raw = (name: string) => makeRawExtraction({ lines: [name], metadata: { language: "ar-SA" } });
	expect(check(raw("محمد علي"), "NO_NAME_LINE")).toBe("pass");
	expect(check(raw("محمد"), "NO_NAME_LINE")).toBe("fail");
});

it("checks Arabic documents for multiple personal emails and professional links", () => {
	const raw = (lines: string[]) => makeRawExtraction({ lines, metadata: { language: "ar-SA" } });
	const withLink = [...arabicLines, "https://github.com/mohammed"];
	expect(check(raw(withLink), "NO_PROFESSIONAL_LINK")).toBe("pass");
	expect(check(raw(arabicLines), "NO_PROFESSIONAL_LINK")).toBe("fail");
	expect(check(raw(arabicLines), "MULTIPLE_EMAILS")).toBe("pass");
	expect(
		check(
			raw(arabicLines.map((line) => (line.includes("mohammed@example.com") ? `${line} other@example.com` : line))),
			"MULTIPLE_EMAILS",
		),
	).toBe("fail");
});

it("checks date counts and employment gaps in Arabic text", () => {
	const raw = (lines: string[]) =>
		makeRawExtraction({ lines: [...lines, "العمل ".repeat(200)], metadata: { language: "ar-SA" } });
	const oneRange = arabicLines.map((line) => (line === "٢٠٢٠ - حتى الآن" ? "٢٠٢٠ - ٢٠٢٤" : line));
	const twoRanges = oneRange.flatMap((line) => (line === "التعليم" ? ["٢٠١٠ - ٢٠١٢", line] : [line]));
	expect(check(raw(oneRange), "FEW_DATES")).toBe("fail");
	expect(check(raw(twoRanges), "FEW_DATES")).toBe("pass");
	expect(check(raw(oneRange), "EMPLOYMENT_GAP")).toBe("pass");
	expect(check(raw(twoRanges), "EMPLOYMENT_GAP")).toBe("fail");
});

it("checks short and dense Arabic text", () => {
	const raw = (lines: string[]) => makeRawExtraction({ lines, metadata: { language: "ar-SA" } });
	const long = [...arabicLines, "العمل ".repeat(200)];
	for (const code of ["LOW_TEXT_DENSITY", "VERY_SHORT_DOCUMENT"] as const) {
		expect(check(raw(long), code)).toBe("pass");
		expect(check(raw(arabicLines), code)).toBe("fail");
	}
});

it("checks Arabic heading emphasis", () => {
	const headings = ["الملخص", "الخبرة", "التعليم", "المهارات"];
	const raw = (emphasized: boolean) =>
		makeRawExtraction({
			metadata: { language: "ar-SA" },
			lines: arabicLines.map((text) => ({ text, size: emphasized && headings.includes(text) ? 14 : 10 })),
		});
	expect(check(raw(true), "HEADINGS_NOT_DISTINGUISHED")).toBe("pass");
	expect(check(raw(false), "HEADINGS_NOT_DISTINGUISHED")).toBe("fail");
});

it("checks Arabic contact placement and phone format", () => {
	const contact = "mohammed@example.com +٩٦٦ ٥٥ ١٢٣ ٤٥٦٧";
	const raw = (page: number, phone: string) =>
		makeRawExtraction({
			metadata: { language: "ar-SA" },
			pageCount: 2,
			lines: arabicLines.map((text) =>
				text === contact ? { text: text.replace("+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧", phone), page } : { text, page: 1 },
			),
		});
	expect(check(raw(1, "+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧"), "CONTACT_NOT_ON_FIRST_PAGE")).toBe("pass");
	expect(check(raw(2, "+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧"), "CONTACT_NOT_ON_FIRST_PAGE")).toBe("fail");
	expect(check(raw(1, "+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧"), "PHONE_FORMAT_UNUSUAL")).toBe("pass");
	expect(check(raw(1, "+١ (١٢٣٤) ١٢٣-٤٥٦-٧٨٩٠"), "PHONE_FORMAT_UNUSUAL")).toBe("fail");
});

it("checks URLs and split email in Arabic text", () => {
	const options = { language: "ar-SA" };
	const raw = (url: string) => makeRawExtraction({ metadata: options, lines: [...arabicLines, url] });
	expect(check(raw("https://example.com"), "BARE_URL_WITHOUT_PROTOCOL")).toBe("pass");
	expect(check(raw("www.example.com"), "BARE_URL_WITHOUT_PROTOCOL")).toBe("fail");
	const link = (url: string) =>
		makeRawExtraction({
			metadata: options,
			lines: [
				{ text: "https://github.com/mohammed", x: 56, y: 60 },
				{ text: "محمد علي", y: 90 },
			],
			links: [{ page: 1, url, rect: [56, 771, 300, 785] }],
		});
	expect(check(link("https://github.com/mohammed"), "LINK_TEXT_URL_MISMATCH")).toBe("pass");
	expect(check(link("https://other.example.com"), "LINK_TEXT_URL_MISMATCH")).toBe("fail");
	const email = (split: boolean) =>
		makeRawExtraction({
			metadata: options,
			lines: split
				? [
						{ text: "محمد علي", y: 60 },
						{ text: "mohammed", x: 56, y: 80 },
						{ text: "@", x: 110, y: 80 },
						{ text: "example.com", x: 130, y: 80 },
					]
				: [
						{ text: "محمد علي", y: 60 },
						{ text: "mohammed@example.com", y: 80 },
					],
		});
	expect(check(email(false), "EMAIL_SPLIT_ACROSS_ITEMS")).toBe("pass");
	expect(check(email(true), "EMAIL_SPLIT_ACROSS_ITEMS")).toBe("fail");
});

it("checks Arabic date formats", () => {
	const raw = (dates: string[]) =>
		makeRawExtraction({ metadata: { language: "ar-SA" }, lines: [...arabicLines, ...dates] });
	expect(check(raw([]), "UNPARSEABLE_DATE_RANGE")).toBe("pass");
	expect(check(raw(["يناير ٢٠ - مارس ٢٢"]), "UNPARSEABLE_DATE_RANGE")).toBe("fail");
	expect(check(raw([]), "MIXED_DATE_FORMATS")).toBe("skip");
	expect(check(raw(["٢٠١٠ - ٢٠١٢"]), "MIXED_DATE_FORMATS")).toBe("pass");
	expect(
		check(
			raw(["٢٠١٠ - ٢٠١٢", "٢٠١٣ - ٢٠١٤", "يناير ٢٠١٥ - مارس ٢٠١٦", "يناير ٢٠١٧ - مارس ٢٠١٨"]),
			"MIXED_DATE_FORMATS",
		),
	).toBe("fail");
});

it("distinguishes scans, missing fonts and long documents from the healthy fixture", () => {
	const healthy = healthyResume();
	for (const code of ["NO_TEXT_LAYER", "IMAGE_ONLY_DOCUMENT", "NON_EMBEDDED_FONTS", "HIGH_PAGE_COUNT"])
		expect(check(healthy, code)).toBe("pass");
	expect(check(scannedResume(), "NO_TEXT_LAYER")).toBe("fail");
	expect(check(scannedResume(), "IMAGE_ONLY_DOCUMENT")).toBe("fail");
	expect(check(healthyResume({ fonts: [{ missingFile: true }] }), "NON_EMBEDDED_FONTS")).toBe("fail");
	expect(check(healthyResume({ pageCount: 12 }), "HIGH_PAGE_COUNT")).toBe("fail");
});

it.each([
	["ENCRYPTED_PDF", { metadata: { isEncrypted: true } }],
	["XFA_FORM", { metadata: { isXfa: true } }],
	["PDF_PORTFOLIO", { metadata: { isCollection: true } }],
	["ACROFORM_FIELDS", { metadata: { hasAcroForm: true } }],
	["UNTAGGED_PDF", { metadata: { isTagged: false } }],
	["MISSING_DOCUMENT_LANGUAGE", { metadata: { language: null } }],
	["TRUNCATED_ANALYSIS", { truncated: true }],
	["TYPE3_FONT", { fonts: [{ isType3: true }] }],
	["INVALID_EMBEDDED_FONT", { fonts: [{ isInvalid: true }] }],
	["ROTATED_PAGES", { pages: { 1: { rotation: 90 } } }],
	["NON_STANDARD_PAGE_SIZE", { pages: { 1: { width: 400, height: 400 } } }],
	["INVISIBLE_TEXT", { pages: { 1: { operators: { invisibleTextItems: 1 } } } }],
	["WHITE_TEXT", { pages: { 1: { operators: { whiteFillTextItems: 1 } } } }],
	["VERTICAL_TEXT", { fonts: [{ vertical: true }] }],
] satisfies [PdfRuleCode, FixtureOptions][])("reports %s only on the matching synthetic document", (code, options) => {
	expect(check(healthyResume(), code)).toBe("pass");
	expect(check(healthyResume(options), code)).toBe("fail");
});

it("agrees with the data check when the candidate has no phone but a reference does", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.phone = "";
	const raw = makeRawExtraction({
		lines: [
			...healthyResumeLines.map((line) => (typeof line === "string" ? line.replace("+44 20 7946 0100", "") : line)),
			"References",
			"Reference Person +1 212 555 0101",
		],
	});
	expect(lintResumeForAts(data, { now }).findings.some((finding) => finding.code === "MISSING_PHONE")).toBe(true);
	expect(check(raw, "NO_PHONE")).toBe("fail");
});

it("accepts the candidate email and phone on the healthy fixture", () => {
	expect(check(healthyResume(), "NO_EMAIL")).toBe("pass");
	expect(check(healthyResume(), "NO_PHONE")).toBe("pass");
});

it.each(["+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧", "+۹۶۶ ۵۵ ۱۲۳ ۴۵۶۷"])("recognizes the candidate phone %s", (phone) => {
	const data = structuredClone(defaultResumeData);
	data.basics.phone = phone;
	const raw = makeRawExtraction({ lines: ["مرشح تجريبي", "candidate@example.test", phone, "الخبرة", "مهندس"] });
	expect(lintResumeForAts(data, { now }).findings.some((finding) => finding.code === "MISSING_PHONE")).toBe(false);
	expect(check(raw, "NO_PHONE")).toBe("pass");
	expect(check(raw, "PHONE_FORMAT_UNUSUAL")).toBe("pass");
});

it("does not mistake an Arabic digit year range for a phone number", () => {
	const raw = makeRawExtraction({ lines: ["مرشح تجريبي", "candidate@example.test", "الخبرة", "٢٠٢٠ - ٢٠٢٤"] });
	expect(check(raw, "NO_PHONE")).toBe("fail");
});
