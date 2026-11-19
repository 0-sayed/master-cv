import type { I18n } from "@lingui/core";
import type { AtsRuleCode, AtsSeverity } from "@reactive-resume/resume/ats";
import type { PdfCategory, PdfRuleCode, PdfSeverity } from "@reactive-resume/resume/ats-pdf";
import type { UiLocale } from "@reactive-resume/utils/locale";
import { setupI18n } from "@lingui/core";
import {
	ATS_RULE_CODES,
	ATS_TYPOGRAPHY_THRESHOLDS,
	atsRuleCategory,
	atsRuleSeverity,
} from "@reactive-resume/resume/ats";
import {
	PDF_ATS_RULE_CODES,
	pdfRuleCap,
	pdfRuleCategory,
	pdfRuleDeduction,
	pdfRuleSeverity,
} from "@reactive-resume/resume/ats-pdf";
import { normalizeSearchText } from "@reactive-resume/utils/ui-format";
import { getGuideExample } from "./examples";
import { guideRuleId } from "./links";
export { guideRuleId } from "./links";
import { getPdfFindingMessage } from "@/features/ats-checker/messages";
import { getEditorFindingMessage } from "@/features/resume/editor/check/messages";
import { getUiLocaleMessages } from "@/libs/locale";
import { formatPageNumberInSentence } from "@/libs/page-number";

export type GuideCode = PdfRuleCode | AtsRuleCode;
export type GuideArea = PdfCategory;
export type GuideFilter = "all" | "blocker" | "warning" | "tip" | "editor";
type GuideText = { title: string; why: string; action: string; before: string; after: string };
type GuideBase = { area: GuideArea; text: Record<UiLocale, GuideText> };
export type GuideEntry = GuideBase &
	(
		| { source: "pdf"; code: PdfRuleCode; severity: PdfSeverity; cap: number | null; deduction: number }
		| { source: "editor"; code: AtsRuleCode; severity: AtsSeverity }
	);

export const GUIDE_AREAS = [
	"contact",
	"sections",
	"content",
	"dates",
	"parseability",
	"layout",
] as const satisfies readonly GuideArea[];

function buildGuideEntries(translators: Record<UiLocale, I18n>): readonly GuideEntry[] {
	const locales = ["ar-SA", "en-US"] as const;
	return [
		...PDF_ATS_RULE_CODES.map((code): GuideEntry => ({
			source: "pdf",
			code,
			area: pdfRuleCategory(code),
			severity: pdfRuleSeverity(code),
			cap: pdfRuleCap(code),
			deduction: pdfRuleDeduction(code),
			text: Object.fromEntries(
				locales.map((locale) => [
					locale,
					{ ...getPdfFindingMessage(code, translators[locale]), ...getGuideExample(code, translators[locale]) },
				]),
			) as Record<UiLocale, GuideText>,
		})),
		...ATS_RULE_CODES.map((code): GuideEntry => {
			const category = atsRuleCategory(code);
			const area = category === "headings" ? "sections" : category === "writing" ? "content" : category;
			const minimum =
				code === "SMALL_BODY_FONT"
					? ATS_TYPOGRAPHY_THRESHOLDS.bodyFontSize
					: code === "TIGHT_LINE_HEIGHT"
						? ATS_TYPOGRAPHY_THRESHOLDS.lineHeight
						: code === "TIGHT_PAGE_MARGINS"
							? ATS_TYPOGRAPHY_THRESHOLDS.pageMargin
							: 0;
			const text = Object.fromEntries(
				locales.map((locale) => {
					const translator = translators[locale];
					const ar = locale === "ar-SA";
					const message = getEditorFindingMessage(
						code,
						{
							value: "example.com",
							url: "https://example.com",
							entry: ar ? "«مطور برمجيات»" : "“Software Engineer”",
							name: ar ? "الخبرات" : "Experience",
							names: ar ? "المهارات، التعليم" : "Skills, Education",
							title: ar ? "رحلتي" : "My journey",
							page: formatPageNumberInSentence(1, locale),
							minimum,
							hasScheme: false,
						},
						translator,
					);
					return [
						locale,
						{ title: message.title, why: message.body, action: message.action, ...getGuideExample(code, translator) },
					];
				}),
			) as Record<UiLocale, GuideText>;
			return { source: "editor", code, area, severity: atsRuleSeverity(code), text };
		}),
	];
}

export async function loadGuideEntries(): Promise<readonly GuideEntry[]> {
	const [ar, en] = await Promise.all([getUiLocaleMessages("ar-SA"), getUiLocaleMessages("en-US")]);
	return buildGuideEntries({
		"ar-SA": setupI18n({ locale: ar.locale, messages: { [ar.locale]: ar.messages } }),
		"en-US": setupI18n({ locale: en.locale, messages: { [en.locale]: en.messages } }),
	});
}

export function filterGuideEntries(
	entries: readonly GuideEntry[],
	{
		area,
		query,
		type,
		source,
	}: { area: GuideArea | null; query: string; type: GuideFilter; source?: GuideEntry["source"] | null },
): readonly GuideEntry[] {
	const terms = normalizeSearchText(query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return entries
		.filter((entry) => {
			if (area && entry.area !== area) return false;
			if (source && entry.source !== source) return false;
			if (
				type === "editor"
					? entry.source !== "editor"
					: type !== "all" &&
						((source !== "editor" && entry.source !== "pdf") ||
							(entry.source === "editor"
								? (entry.severity === "info" ? "tip" : "warning") !== type
								: entry.severity !== type))
			)
				return false;
			const haystack = normalizeSearchText(
				[entry.code, ...Object.values(entry.text).flatMap((text) => [text.title, text.why, text.action])].join(" "),
			).toLocaleLowerCase();
			return terms.every((term) => haystack.includes(term));
		})
		.sort((a, b) => GUIDE_AREAS.indexOf(a.area) - GUIDE_AREAS.indexOf(b.area));
}

export function findGuideEntry(entries: readonly GuideEntry[], hash: string): GuideEntry | null {
	try {
		const id = decodeURIComponent(hash.replace(/^#/, ""));
		return entries.find((entry) => guideRuleId(entry.code) === id) ?? null;
	} catch {
		return null;
	}
}
