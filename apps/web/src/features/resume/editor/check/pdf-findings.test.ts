import { expect, it } from "vite-plus/test";
import { PDF_ATS_RULE_CODES } from "@reactive-resume/resume/ats-pdf";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { keepPdfFinding, pdfFindingKey, pdfFieldTarget } from "./pdf-findings";
const finding = {
	code: "MULTI_COLUMN_LAYOUT",
	category: "layout",
	severity: "warning",
	deduction: 0,
	evidence: { page: 1, snippet: "Synthetic" },
} as const;
it("persists a stable PDF finding key in the saved CV and does not duplicate it", () => {
	const data = structuredClone(defaultResumeData);
	keepPdfFinding(data, pdfFindingKey(finding));
	keepPdfFinding(data, pdfFindingKey({ ...finding }));
	const reopened = JSON.parse(JSON.stringify(data));
	expect(reopened.metadata.check.ignored).toEqual([pdfFindingKey(finding)]);
	expect(pdfFindingKey({ ...finding, evidence: { page: 2, snippet: "Synthetic" } })).not.toBe(pdfFindingKey(finding));
});
it("routes field findings to real editor targets, keeping extraction problems in the PDF", () => {
	expect(pdfFieldTarget("NO_EMAIL")).toEqual({ kind: "header" });
	expect(pdfFieldTarget("NO_EXPERIENCE_SECTION")).toEqual({ kind: "section", sectionId: "experience" });
	expect(pdfFieldTarget("NO_TEXT_LAYER")).toBeNull();
});
it("routes every PDF rule to its intended field or document-level recovery", () => {
	const header = new Set([
		"NO_EMAIL",
		"NO_PHONE",
		"NO_NAME_LINE",
		"MULTIPLE_EMAILS",
		"CONTACT_NOT_ON_FIRST_PAGE",
		"EMAIL_SPLIT_ACROSS_ITEMS",
		"PHONE_FORMAT_UNUSUAL",
		"NO_PROFESSIONAL_LINK",
	]);
	const sections: Record<string, string> = {
		NO_EXPERIENCE_SECTION: "experience",
		NO_ROLE_LINES: "experience",
		NO_EDUCATION_SECTION: "education",
		NO_SKILLS_SECTION: "skills",
		NO_SUMMARY_SECTION: "summary",
	};
	for (const code of PDF_ATS_RULE_CODES) {
		const expected = header.has(code)
			? { kind: "header" }
			: sections[code]
				? { kind: "section", sectionId: sections[code] }
				: null;
		expect(pdfFieldTarget(code), code).toEqual(expected);
	}
});
