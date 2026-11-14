import type { PdfAtsReport } from "../ats-pdf/types";
import { describe, expect, it } from "vite-plus/test";
import { analyzeJobTerms } from "./job-evidence";
import { pdfReadiness, jobReadiness, invalidateReadiness, emptyReadiness } from "./readiness";
const source = {
	ownerId: "alice",
	resumeId: "cv",
	baseRevision: "v1",
	editGeneration: 1,
	contentHash: "input",
	bytesHash: "bytes",
	versions: { renderer: "r", template: "t", fonts: "f", locale: "ar-SA" },
};
const report = (partial = false) =>
	({
		version: 1,
		analysis: { status: partial ? "partial" : "complete", reasons: partial ? ["operators-skipped"] : [] },
		findings: [],
		tips: [],
		document: { truncated: false },
		skippedChecks: 0,
	}) as unknown as PdfAtsReport;
describe("independent readiness", () => {
	it("publishes literal job coverage separately and rejects a different source revision", () => {
		const jobSource = {
			...source,
			jobId: "job",
			jobRevision: "j1",
			rubricVersion: "literal-v1",
			normalizationVersion: "matching-v2",
		};
		const identity = {
			resumeId: source.resumeId,
			resumeRevision: source.baseRevision,
			contentHash: source.contentHash,
			jobId: jobSource.jobId,
			jobRevision: jobSource.jobRevision,
			rubricVersion: jobSource.rubricVersion,
			normalizationVersion: jobSource.normalizationVersion,
		};
		const jobReport = analyzeJobTerms({ identity, jobText: "React, SAP", passages: [] });
		const result = jobReadiness(jobSource, jobReport);
		expect(result).toMatchObject({ dimension: "job", state: "complete", options: { denominator: 2, matchedCount: 0 } });
		expect(() => jobReadiness({ ...jobSource, jobRevision: "j2" }, jobReport)).toThrow("JOB_SOURCE_CHANGED");
		const initial = { pdf: pdfReadiness(source, report()), writing: emptyReadiness("writing"), job: result };
		const next = invalidateReadiness(initial, "job");
		expect(next.job.state).toBe("stale");
		expect(next.pdf).toBe(initial.pdf);
		expect(next.writing).toBe(initial.writing);
		expect(
			jobReadiness(jobSource, analyzeJobTerms({ identity: jobReport.identity, jobText: "and the", passages: [] }))
				.state,
		).toBe("skipped");
	});
	it("never labels partial, truncated or unmeasured output complete", () => {
		expect(pdfReadiness(source, report(true)).state).toBe("partial");
		expect(pdfReadiness(source, { ...report(), document: { ...report().document, truncated: true } }).state).toBe(
			"partial",
		);
	});
	it("invalidates only the affected dimension and leaves no-job unchecked", () => {
		const pdf = pdfReadiness(source, report());
		const initial = { pdf, writing: emptyReadiness("writing"), job: emptyReadiness("job") };
		const next = invalidateReadiness(initial, "job");
		expect(next.pdf).toBe(pdf);
		expect(next.job.state).toBe("not-checked");
		expect(invalidateReadiness(initial, "pdf").pdf.state).toBe("stale");
	});
	it("requires actual PDF identity and carries diagnostic evidence without mutating input", () => {
		const input = report();
		input.findings = [
			{
				code: "NO_TEXT_LAYER",
				severity: "blocker",
				category: "parseability",
				evidence: { page: 1, snippet: "synthetic" },
			},
		];
		const before = JSON.stringify(input);
		const result = pdfReadiness(source, input);
		expect(result.source).toEqual(source);
		expect(result.issues[0]).toMatchObject({
			severity: "blocker",
			rule: "NO_TEXT_LAYER",
			target: { page: 1 },
			evidence: { observed: "synthetic" },
		});
		expect(JSON.stringify(input)).toBe(before);
	});
});
