import type { AtsRuleCode } from "@reactive-resume/resume/ats";
import type { PdfRuleCode } from "@reactive-resume/resume/ats-pdf";
import { ATS_RULE_CODES } from "@reactive-resume/resume/ats";

export const ATS_GUIDE_ROUTE = "/dashboard/review-guide";
export type ReviewGuideTab = "ats" | "data" | "ai";
export function reviewGuideSearch(search: Record<string, unknown>): {
	tab?: ReviewGuideTab;
	rule?: string;
	returnTo?: string;
} {
	return {
		tab: search.tab === "data" || search.tab === "ai" ? search.tab : "ats",
		...(typeof search.rule === "string" ? { rule: search.rule } : {}),
		...(typeof search.returnTo === "string" && /^\/builder\/(?!\/)[^\\?#]*$/.test(search.returnTo)
			? { returnTo: search.returnTo }
			: {}),
	};
}
export function reviewGuideRedirect(location: { searchStr: string; hash: string }) {
	return {
		href: `${ATS_GUIDE_ROUTE}${location.searchStr}${location.hash ? `#${location.hash.replace(/^#/, "")}` : ""}`,
		statusCode: 308,
		replace: true,
	};
}
export const guideRuleId = (code: PdfRuleCode | AtsRuleCode): string => `rule-${code}`;
export const atsGuideRuleHref = (code: PdfRuleCode | AtsRuleCode): string =>
	`${ATS_GUIDE_ROUTE}?tab=${(ATS_RULE_CODES as readonly string[]).includes(code) ? "data" : "ats"}#${guideRuleId(code)}`;
