import { expect, it } from "vite-plus/test";
import { pdfCheckSchema } from "./pdf-check";

it("preserves incomplete analysis and rule execution failures on the wire", () => {
	const report = {
		version: 1,
		score: 100,
		cappedBy: [],
		categories: [],
		checks: [
			{
				code: "NO_EXPERIENCE_SECTION",
				category: "sections",
				severity: "warning",
				status: "skip",
				skipReason: "execution-failed",
				findings: [],
			},
		],
		findings: [],
		tips: [],
		counts: { blocker: 0, warning: 0, tip: 0 },
		applicableChecks: 0,
		passedChecks: 0,
		skippedChecks: 1,
		jd: null,
		file: { name: "synthetic.pdf", sizeBytes: 10, magicBytesOk: true },
		document: { pageCount: 1, truncated: false, wordCount: 1, operatorsAvailable: false },
		analysis: { status: "partial", reasons: ["page-1-operators-failed"] },
	};
	expect(pdfCheckSchema.parse(report)).toEqual(report);
});
