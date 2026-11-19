import { describe, expect, it, vi } from "vite-plus/test";
import { i18n, setupI18n } from "@lingui/core";
import { ATS_RULE_CODES, ATS_TYPOGRAPHY_THRESHOLDS, atsRuleSeverity } from "@reactive-resume/resume/ats";
import {
	PDF_ATS_RULE_CODES,
	pdfRuleCap,
	pdfRuleCategory,
	pdfRuleDeduction,
	pdfRuleSeverity,
} from "@reactive-resume/resume/ats-pdf";
import { GUIDE_EXAMPLES, assertGuideExamples } from "./examples";
import { filterGuideEntries, findGuideEntry, guideRuleId, loadGuideEntries } from "./model";
import { getPdfFindingMessage } from "@/features/ats-checker/messages";
import { getEditorFindingMessage } from "@/features/resume/editor/check/messages";
import { getUiLocaleMessages } from "@/libs/locale";
import { formatPageNumberInSentence } from "@/libs/page-number";

describe("catalog-backed ATS guide", () => {
	it("covers every catalog code exactly once with bilingual examples and source metadata", async () => {
		const locale = i18n.locale;
		const entries = await loadGuideEntries();
		expect(entries.map((entry) => entry.code)).toEqual([...PDF_ATS_RULE_CODES, ...ATS_RULE_CODES]);
		expect(new Set(entries.map((entry) => guideRuleId(entry.code))).size).toBe(entries.length);
		expect(
			["parseability", "layout", "sections", "contact", "dates", "content"].map(
				(area) => entries.filter((entry) => entry.area === area).length,
			),
		).toEqual([27, 21, 12, 17, 13, 9]);
		expect(
			["blocker", "warning", "tip", "editor"].map(
				(type) =>
					filterGuideEntries(entries, { area: null, query: "", type: type as "blocker" | "warning" | "tip" | "editor" })
						.length,
			),
		).toEqual([9, 47, 21, 22]);
		const en = setupI18n({ locale: "en-US", messages: { "en-US": (await getUiLocaleMessages("en-US")).messages } });
		const ar = setupI18n({ locale: "ar-SA", messages: { "ar-SA": (await getUiLocaleMessages("ar-SA")).messages } });
		for (const entry of entries) {
			for (const text of Object.values(entry.text))
				expect(Object.values(text).every((value) => value.length > 0)).toBe(true);
			for (const text of Object.values(entry.text)) expect(Object.values(text).join(" ")).not.toContain("(translator)");
			if (entry.source === "pdf") {
				expect(entry.area).toBe(pdfRuleCategory(entry.code));
				expect(entry.severity).toBe(pdfRuleSeverity(entry.code));
				expect(entry.cap).toBe(pdfRuleCap(entry.code));
				expect(entry.deduction).toBe(pdfRuleDeduction(entry.code));
				expect(entry.text["en-US"]).toMatchObject(getPdfFindingMessage(entry.code, en));
				expect(entry.text["ar-SA"]).toMatchObject(getPdfFindingMessage(entry.code, ar));
			} else {
				expect(entry.severity).toBe(atsRuleSeverity(entry.code));
				expect(entry).not.toHaveProperty("cap");
				expect(entry).not.toHaveProperty("deduction");
				for (const [locale, translator] of [
					["en-US", en],
					["ar-SA", ar],
				] as const) {
					const arabic = locale === "ar-SA";
					const minimum =
						entry.code === "SMALL_BODY_FONT"
							? ATS_TYPOGRAPHY_THRESHOLDS.bodyFontSize
							: entry.code === "TIGHT_LINE_HEIGHT"
								? ATS_TYPOGRAPHY_THRESHOLDS.lineHeight
								: entry.code === "TIGHT_PAGE_MARGINS"
									? ATS_TYPOGRAPHY_THRESHOLDS.pageMargin
									: 0;
					const message = getEditorFindingMessage(
						entry.code,
						{
							value: "example.com",
							url: "https://example.com",
							entry: arabic ? "«مطور برمجيات»" : "“Software Engineer”",
							name: arabic ? "الخبرات" : "Experience",
							names: arabic ? "المهارات، التعليم" : "Skills, Education",
							title: arabic ? "رحلتي" : "My journey",
							page: formatPageNumberInSentence(1, locale),
							minimum,
							hasScheme: false,
						},
						translator,
					);
					expect(entry.text[locale]).toMatchObject({ title: message.title, why: message.body, action: message.action });
				}
			}
		}
		expect(i18n.locale).toBe(locale);
	});
	it("diagnoses missing and obsolete illustrations", () => {
		const missing = { ...GUIDE_EXAMPLES };
		delete (missing as Partial<typeof missing>).NO_EMAIL;
		expect(() => assertGuideExamples(missing)).toThrow(/missing.*NO_EMAIL/i);
		expect(() => assertGuideExamples({ ...GUIDE_EXAMPLES, OBSOLETE: {} })).toThrow(/obsolete.*OBSOLETE/i);
	});
	it("searches both languages globally with stable order and combined filters", async () => {
		const entries = await loadGuideEntries();
		const options = { area: null, query: "  missing_email  ", type: "all" as const };
		expect(filterGuideEntries(entries, options).map((entry) => entry.code)).toEqual(["MISSING_EMAIL"]);
		const target = entries.find((entry) => entry.code === "MISSING_EMAIL");
		if (!target) throw new Error("Missing editor email rule");
		expect(filterGuideEntries(entries, { ...options, query: target.text["ar-SA"].title })).toContain(target);
		expect(
			filterGuideEntries(entries, { ...options, query: target.text["ar-SA"].title.replaceAll("ا", "اـ") }),
		).toContain(target);
		expect(
			filterGuideEntries(entries, { ...options, query: "email", type: "editor" }).every(
				(entry) => entry.source === "editor",
			),
		).toBe(true);
		expect(
			filterGuideEntries(entries, { ...options, query: "", area: "contact" }).every(
				(entry) => entry.area === "contact",
			),
		).toBe(true);
		expect(filterGuideEntries(entries, { ...options, query: "no such rule xyz" })).toEqual([]);
	});
	it("resolves only complete safe rule anchors", async () => {
		const entries = await loadGuideEntries();
		expect(findGuideEntry(entries, "#rule-NO_EMAIL")?.code).toBe("NO_EMAIL");
		expect(findGuideEntry(entries, "rule-MISSING_EMAIL")?.code).toBe("MISSING_EMAIL");
		for (const hash of ["#rule-NO_EMAIL-extra", "#rule-%", "#rule-UNKNOWN", ""])
			expect(findGuideEntry(entries, hash)).toBeNull();
	});
});

it("updates guide explanations and illustrations when domain thresholds change", async () => {
	const thresholds = Object.fromEntries(
		Object.entries(ATS_TYPOGRAPHY_THRESHOLDS).map(([key, value]) => [key, value * 2]),
	);
	vi.resetModules();
	vi.doMock("@reactive-resume/resume/ats", async (importOriginal) => ({
		...(await importOriginal<typeof import("@reactive-resume/resume/ats")>()),
		ATS_TYPOGRAPHY_THRESHOLDS: thresholds,
	}));
	try {
		const model = await import("./model");
		const entries = await model.loadGuideEntries();
		for (const [code, minimum] of [
			["SMALL_BODY_FONT", String(thresholds.bodyFontSize)],
			["TIGHT_LINE_HEIGHT", String(thresholds.lineHeight)],
			["TIGHT_PAGE_MARGINS", String(thresholds.pageMargin)],
		]) {
			const entry = entries.find((item) => item.code === code);
			expect(entry?.text["en-US"].why).toContain(minimum);
			expect(entry?.text["en-US"].after).toContain(minimum);
			expect(entry?.text["ar-SA"].after).toContain(minimum);
		}
	} finally {
		vi.doUnmock("@reactive-resume/resume/ats");
		vi.resetModules();
	}
});
