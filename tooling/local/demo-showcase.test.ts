import { expect, it } from "vite-plus/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { lintResumeForAts, type AtsRuleCode } from "@reactive-resume/resume/ats";
import { analyzePdfResume, harvestPdfDocument, type PdfRuleCode } from "@reactive-resume/resume/ats-pdf";
import { demoFixture } from "./demo-fixture";

const now = new Date("2026-11-19T09:00:00Z");
const plannedDataRules = [
	"MISSING_PHONE",
	"UNPARSEABLE_PERIOD",
	"EMPTY_PERIOD",
	"MISSING_EXPERIENCE_DESCRIPTION",
	"NON_STANDARD_SECTION_TITLE",
	"TWO_COLUMN_LAYOUT",
	"PROSE_SECTION_IN_SIDEBAR",
	"SMALL_BODY_FONT",
	"TIGHT_LINE_HEIGHT",
	"TIGHT_PAGE_MARGINS",
] as const satisfies readonly AtsRuleCode[];
const plannedPdfRules = [
	"NO_PHONE",
	"NO_EXPERIENCE_SECTION",
	"SMALL_BODY_TEXT",
	"MIXED_DATE_FORMATS",
	"NO_SKILLS_SECTION",
	"UNTAGGED_PDF",
	"NO_PROFESSIONAL_LINK",
	"NO_CURRENT_ROLE_MARKER",
	"FIRST_PERSON_PRONOUNS",
	"WEAK_ACTION_VERBS",
	"NO_QUANTIFIED_IMPACT",
	"LONG_BULLETS",
	"READING_ORDER_RISK",
] as const satisfies readonly PdfRuleCode[];

it("adds an Arabic before-and-after pair for the existing invented career", () => {
	expect(demoFixture.showcaseResumes.map((resume) => resume.name)).toEqual(["سيرة قبل التحسين", "سيرة احترافية"]);
	for (const { data } of demoFixture.showcaseResumes) {
		expect(data.basics.name.trim()).toBe(demoFixture.resumes[0].basics.name.trim());
		expect(data.basics.email).toMatch(/\.test$/);
		expect(data.metadata.page.locale).toBe("ar-SA");
		expect(data.sections.experience.items.map((item) => [item.company, item.position]).sort()).toEqual(
			demoFixture.resumes[0].sections.experience.items.map((item) => [item.company, item.position]).sort(),
		);
	}
});

it.each([0, 1])("runs both deterministic families on showcase %i and its real exported PDF", async (index) => {
	const showcase = demoFixture.showcaseResumes[index];
	if (!showcase) throw new Error("Missing showcase CV");
	const dataReport = lintResumeForAts(showcase.data, { now });
	const file = await act(() => createResumePdfFile({ data: showcase.data, filename: "showcase.pdf" }));
	const bytes = new Uint8Array(await file.arrayBuffer());
	const task = getDocument({ data: bytes, fontExtraProperties: true });
	try {
		const raw = await harvestPdfDocument(await task.promise, {
			file: { name: file.name, sizeBytes: file.size, magicBytesOk: true },
		});
		const pdfReport = analyzePdfResume(raw, { now, locale: "ar-SA" });
		expect(pdfReport.checks.filter((check) => check.skipReason === "execution-failed")).toEqual([]);
		if (index === 0) {
			const dataCodes = dataReport.findings.map((finding) => finding.code);
			const pdfCodes = [...pdfReport.findings, ...pdfReport.tips].map((finding) => finding.code);
			expect([...new Set(dataCodes)].sort()).toEqual([...plannedDataRules].sort());
			expect([...new Set(pdfCodes)].sort()).toEqual([...plannedPdfRules].sort());
			expect(new Set([...dataCodes, ...pdfCodes]).size).toBeGreaterThanOrEqual(12);
		} else {
			expect(showcase.data.metadata.check?.ignored ?? []).toEqual([]);
			expect(dataReport.findings.filter((finding) => finding.severity !== "info")).toEqual([]);
			expect(pdfReport.findings).toEqual([]);
			for (const code of ["FIRST_PERSON_PRONOUNS", "WEAK_ACTION_VERBS", "NO_QUANTIFIED_IMPACT", "LONG_BULLETS"]) {
				expect(pdfReport.checks.find((check) => check.code === code)?.status).toBe("pass");
			}
		}
	} finally {
		await task.destroy();
	}
});
