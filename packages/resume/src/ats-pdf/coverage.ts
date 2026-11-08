import type { PdfAnalysisCoverage, PdfCheckResult, RawExtraction } from "./types";

/** Coverage is independent of score: no findings never proves every check ran. */
export function summarizePdfCoverage(raw: RawExtraction, checks: readonly PdfCheckResult[]): PdfAnalysisCoverage {
	const reasons = [...(raw.coverage?.reasons ?? [])];
	if (!raw.coverage) reasons.push("coverage-unknown");
	if (raw.truncated) reasons.push("pages-truncated");
	const pages = raw.coverage?.pages ?? [];
	const validPages = (values: readonly { pageNumber: number }[]) =>
		values.length === raw.pageCount &&
		new Set(values.map((page) => page.pageNumber)).size === raw.pageCount &&
		values.every(
			(page) => Number.isInteger(page.pageNumber) && page.pageNumber >= 1 && page.pageNumber <= raw.pageCount,
		);
	if (!validPages(pages) || !validPages(raw.pages)) reasons.push("pages-missing");
	for (const page of pages)
		for (const key of ["text", "annotations", "operators"] as const)
			if (page[key] !== "complete") reasons.push(`page-${page.pageNumber}-${key}-${page[key]}`);
	for (const check of checks)
		if (
			check.status === "skip" &&
			(check.skipReason === "execution-failed" ||
				check.skipReason === "no-operators" ||
				check.skipReason === "encrypted")
		)
			reasons.push(`check-${check.code}-${check.skipReason}`);
	const unique = [...new Set(reasons)];
	const hasText = raw.pages.some((page) => page.items.some((item) => item.str.trim()));
	const noSuccessfulText = !!raw.coverage && !pages.some((page) => page.text === "complete");
	return {
		status: !hasText || noSuccessfulText ? "failed" : unique.length ? "partial" : "complete",
		reasons: !hasText ? [...unique, "no-usable-text"] : unique,
	};
}
