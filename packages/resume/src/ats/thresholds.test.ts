import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ATS_TYPOGRAPHY_THRESHOLDS, lintResumeForAts } from "./index";
it("uses the exported typography minimums in rule findings", () => {
	const data = structuredClone(defaultResumeData);
	data.metadata.typography.body.fontSize = 1;
	data.metadata.typography.body.lineHeight = 1;
	data.metadata.page.marginX = 1;
	data.metadata.page.marginY = 1;
	const report = lintResumeForAts(data);
	for (const [code, minimum] of [
		["SMALL_BODY_FONT", ATS_TYPOGRAPHY_THRESHOLDS.bodyFontSize],
		["TIGHT_LINE_HEIGHT", ATS_TYPOGRAPHY_THRESHOLDS.lineHeight],
		["TIGHT_PAGE_MARGINS", ATS_TYPOGRAPHY_THRESHOLDS.pageMargin],
	] as const) {
		const findings = report.findings.filter((finding) => finding.code === code);
		expect(findings.length).toBeGreaterThan(0);
		expect(findings.every((finding) => finding.params?.minimum === minimum)).toBe(true);
	}
});
