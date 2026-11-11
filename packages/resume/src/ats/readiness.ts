import type { PdfAtsReport } from "../ats-pdf/types";
export type ReadinessDimension = "pdf" | "writing" | "job";
export type ReadinessState = "not-checked" | "checking" | "complete" | "skipped" | "partial" | "stale" | "failed";
export type ReadinessSource = {
	ownerId: string;
	resumeId: string;
	baseRevision: string;
	editGeneration: number;
	contentHash: string;
};
export type PdfReadinessSource = ReadinessSource & {
	bytesHash: string;
	versions: { renderer: string; template: string; fonts: string; locale: string };
};
export type JobReadinessSource = ReadinessSource & { jobId: string; jobRevision: string };
export type ReadinessIssue = {
	id: string;
	rule: string;
	ruleVersion: string;
	severity: "blocker" | "warning" | "tip";
	reason: string;
	evidence: { expected?: string; observed?: string };
	target: { field?: string; page?: number; span?: string };
	action: "review" | "preview-fix";
};
type ResultBody = {
	issues: readonly ReadinessIssue[];
	checker: string;
	extractor: string;
	options: Readonly<Record<string, string | number | boolean>>;
	coverage: readonly string[];
};
type Lifecycle<S> =
	| { state: "not-checked"; source: null; checkedAt: null }
	| { state: "checking" | "failed" | "skipped"; source: S | null; checkedAt: null }
	| { state: "complete" | "partial" | "stale"; source: S; checkedAt: string };
export type ReadinessResult = ResultBody &
	(
		| ({ dimension: "pdf" } & Lifecycle<PdfReadinessSource>)
		| ({ dimension: "writing" } & Lifecycle<ReadinessSource>)
		| ({ dimension: "job" } & Lifecycle<JobReadinessSource>)
	);
export type ReadinessResults = Record<ReadinessDimension, ReadinessResult>;
export function emptyReadiness<D extends ReadinessDimension>(
	dimension: D,
): ResultBody & { dimension: D; state: "not-checked"; source: null; checkedAt: null } {
	return {
		dimension,
		state: "not-checked",
		source: null,
		checkedAt: null,
		issues: [],
		checker: "",
		extractor: "",
		options: {},
		coverage: [],
	};
}
export function pdfReadiness(source: PdfReadinessSource, report: PdfAtsReport): ReadinessResult {
	const partial = report.document.truncated || report.analysis?.status !== "complete";
	return {
		dimension: "pdf",
		state: report.analysis?.status === "failed" ? "failed" : partial ? "partial" : "complete",
		source,
		checkedAt: report.analysis?.status === "failed" ? null : new Date().toISOString(),
		checker: `pdf-rules:${report.version}`,
		extractor: "pdfjs:6.4.299",
		options: { operatorBudgetMs: 30_000, maxPages: 30 },
		coverage: report.analysis?.reasons ?? ["coverage-unavailable"],
		issues: [...report.findings, ...report.tips].map((finding, index) => ({
			id: `${finding.code}:${finding.evidence?.page ?? "document"}:${index}`,
			rule: finding.code,
			ruleVersion: String(report.version),
			severity: finding.severity,
			reason: finding.code,
			evidence: finding.evidence?.snippet ? { observed: finding.evidence.snippet } : {},
			target: finding.evidence?.page ? { page: finding.evidence.page } : {},
			action: "review",
		})),
	} as ReadinessResult;
}
export function invalidateReadiness(results: ReadinessResults, dimension: ReadinessDimension): ReadinessResults {
	const current = results[dimension];
	return {
		...results,
		[dimension]: current.source && current.checkedAt ? { ...current, state: "stale" } : emptyReadiness(dimension),
	};
}
