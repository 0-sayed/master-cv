import { expect, it } from "vite-plus/test";
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
