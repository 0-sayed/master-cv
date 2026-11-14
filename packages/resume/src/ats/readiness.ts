import type { PdfAtsReport } from "../ats-pdf/types";
import type { JobTermReport } from "@reactive-resume/schema/job-evidence";
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
export type JobReadinessSource = ReadinessSource & {
	jobId: string;
	jobRevision: string;
	rubricVersion: string;
	normalizationVersion: string;
};
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

/** Literal occurrences only. A late result cannot be relabelled with the current source. */
export function jobReadiness(source: JobReadinessSource, report: JobTermReport): ReadinessResult {
	const identity = report.identity;
	if (
		source.resumeId !== identity.resumeId ||
		source.baseRevision !== identity.resumeRevision ||
		source.contentHash !== identity.contentHash ||
		source.jobId !== identity.jobId ||
		source.jobRevision !== identity.jobRevision ||
		source.rubricVersion !== identity.rubricVersion ||
		source.normalizationVersion !== identity.normalizationVersion
	)
		throw new Error("JOB_SOURCE_CHANGED");
	if (report.state === "not-checked") return emptyReadiness("job");
	return {
		dimension: "job",
		...(report.state === "not-checkable"
			? { state: "skipped" as const, checkedAt: null }
			: { state: "complete" as const, checkedAt: new Date().toISOString() }),
		source,
		checker: identity.rubricVersion,
		extractor: identity.normalizationVersion,
		options: {
			denominator: report.denominator,
			matchedCount: report.matchedCount,
			unmatchedCount: report.unmatchedCount,
			truncated: report.selection.truncated,
		},
		coverage: report.exclusions,
		issues: [],
	};
}
