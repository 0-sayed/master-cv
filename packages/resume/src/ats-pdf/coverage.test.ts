import assert from "node:assert/strict";
import { expect, it, vi } from "vite-plus/test";
import { summarizePdfCoverage } from "./coverage";
import { analyzePdfResume } from "./index";
import { PDF_CHECKS } from "./rules";
import { healthyResume } from "./test-fixtures";
const evidence = () => ({
	pages: [
		{ pageNumber: 1, text: "complete" as const, annotations: "complete" as const, operators: "complete" as const },
	],
	reasons: [],
});
it("keeps legacy unknown coverage partial even with no findings", () => {
	const report = analyzePdfResume(healthyResume(), { now: new Date("2024-06-15") });
	expect(report.findings).toEqual([]);
	expect(report.analysis?.status).toBe("partial");
});
it("requires every page and every requested pass", () => {
	const raw = { ...healthyResume(), coverage: evidence() };
	expect(summarizePdfCoverage(raw, []).status).toBe("complete");
	expect(summarizePdfCoverage({ ...raw, truncated: true }, []).status).toBe("partial");
	expect(summarizePdfCoverage({ ...raw, pageCount: 2 }, []).status).toBe("partial");
	for (const key of ["text", "annotations", "operators"] as const) {
		const coverage = evidence();
		const first = coverage.pages[0];
		assert(first);
		const second = { ...first, pageNumber: 2, [key]: "failed" as const };
		expect(
			summarizePdfCoverage(
				{ ...raw, pageCount: 2, coverage: { pages: [first, second], reasons: [`${key}-failed`] } },
				[],
			).status,
		).toBe("partial");
	}
});
it("marks all-text failure as failed and a thrown rule as partial", () => {
	const raw = { ...healthyResume(), coverage: evidence() };
	expect(
		summarizePdfCoverage(
			{
				...raw,
				coverage: {
					pages: [{ pageNumber: 1, text: "failed", annotations: "complete", operators: "complete" }],
					reasons: ["text-failed"],
				},
			},
			[],
		).status,
	).toBe("failed");
	const check = PDF_CHECKS[0];
	assert(check);
	const spy = vi.spyOn(check, "run").mockImplementation(() => {
		throw new Error("controlled failure");
	});
	try {
		const report = analyzePdfResume(raw);
		expect(report.analysis?.status).toBe("partial");
		expect(report.checks[0]?.skipReason).toBe("execution-failed");
	} finally {
		spy.mockRestore();
	}
});

it("does not call invalid or mismatched page identities complete", () => {
	const raw = { ...healthyResume(), coverage: evidence() };
	const first = evidence().pages[0];
	const rawFirst = raw.pages[0];
	assert(first && rawFirst);
	expect(
		summarizePdfCoverage({ ...raw, coverage: { pages: [{ ...first, pageNumber: 2 }], reasons: [] } }, []).status,
	).toBe("partial");
	expect(summarizePdfCoverage({ ...raw, pages: [{ ...rawFirst, pageNumber: 2 }] }, []).status).toBe("partial");
});
