import type { PageMapTarget } from "@reactive-resume/pdf/page-map";
import type { PdfFinding, PdfRuleCode } from "@reactive-resume/resume/ats-pdf";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
/** Stable across report ordering; kept choices belong to the saved CV, never the browser. */
export const pdfFindingKey = (finding: PdfFinding) =>
	`pdf:${finding.code}:${finding.evidence?.page ?? "document"}:${finding.evidence?.snippet ?? ""}`;

export function keepPdfFinding(data: ResumeData, key: string) {
	data.metadata.check ??= { ignored: [], hiddenTerms: [] };
	if (!data.metadata.check.ignored.includes(key)) data.metadata.check.ignored.push(key);
}

export function pdfFieldTarget(code: PdfRuleCode): PageMapTarget | null {
	switch (code) {
		case "NO_EMAIL":
		case "NO_PHONE":
		case "NO_NAME_LINE":
		case "MULTIPLE_EMAILS":
		case "CONTACT_NOT_ON_FIRST_PAGE":
		case "EMAIL_SPLIT_ACROSS_ITEMS":
		case "PHONE_FORMAT_UNUSUAL":
		case "NO_PROFESSIONAL_LINK":
			return { kind: "header" };
		case "NO_EXPERIENCE_SECTION":
		case "NO_ROLE_LINES":
			return { kind: "section", sectionId: "experience" };
		case "NO_EDUCATION_SECTION":
			return { kind: "section", sectionId: "education" };
		case "NO_SKILLS_SECTION":
			return { kind: "section", sectionId: "skills" };
		case "NO_SUMMARY_SECTION":
			return { kind: "section", sectionId: "summary" };
		default:
			return null;
	}
}
