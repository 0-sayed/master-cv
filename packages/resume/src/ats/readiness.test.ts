import type { PdfAtsReport } from "../ats-pdf/types";
import { describe, expect, it } from "vite-plus/test";
import { pdfReadiness, invalidateReadiness, emptyReadiness } from "./readiness";
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
