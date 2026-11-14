import type { ReadinessResults } from "@reactive-resume/resume/ats";
import type { PdfAtsReport } from "@reactive-resume/resume/ats-pdf";
import type { JobTermReport } from "@reactive-resume/schema/job-evidence";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { create } from "zustand/react";
import { emptyReadiness, invalidateReadiness, jobReadiness } from "@reactive-resume/resume/ats";
import { useResumeData, isEditableElementFocused } from "../../builder/draft";
import { hasResumePreviewContent } from "../../preview/resume-thumbnail.shared";
import { TYPING_DEBOUNCE_MS, UPDATE_DEBOUNCE_MS } from "../../preview/timing";
import { useEditorStore, sameEditorIdentity } from "../store";
import { evaluateReadiness } from "./evaluate";
import { useCheckIntroduction } from "./introduction";
import { mergeDocumentReadiness, scheduleReadiness } from "./readiness";
import { orpc } from "@/libs/orpc/client";

const empty = (): ReadinessResults => ({
	pdf: emptyReadiness("pdf"),
	writing: emptyReadiness("writing"),
	job: emptyReadiness("job"),
});
const useReadinessStore = create<{
	results: ReadinessResults;
	pdfReport: PdfAtsReport | null;
	jobReport: JobTermReport | null;
	retry: number;
	requestRetry: () => void;
}>((set) => ({
	results: empty(),
	pdfReport: null,
	jobReport: null,
	retry: 0,
	requestRetry: () => set((state) => ({ retry: state.retry + 1 })),
}));
/** Mounted once by the editor shell, independently of the visible panel. No extracted text is retained. */
export function useReadinessLifecycle() {
	const identity = useEditorStore((state) => state.identity);
	const data = useResumeData();
	const retry = useReadinessStore((state) => state.retry);
	const jobOptions = orpc.career.jobTargets.evidence.queryOptions({ input: { resumeId: identity?.resumeId ?? "" } });
	const job = useQuery({
		...jobOptions,
		queryKey: [...jobOptions.queryKey, identity?.ownerId, identity?.baseRevision, retry],
		enabled: Boolean(identity),
		staleTime: 0,
	});
	useEffect(() => {
		if (!identity || !data) return;
		let cancelled = false;
		if (!job.data?.literal) {
			useReadinessStore.setState((state) => ({
				jobReport: null,
				results: {
					...state.results,
					job: {
						...emptyReadiness("job"),
						...(job.error ? { state: "failed" as const } : job.isFetching ? { state: "checking" as const } : {}),
					},
				},
			}));
			return;
		}
		const report = job.data.literal;
		void crypto.subtle
			.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)))
			.then((bytes) => {
				if (cancelled || !sameEditorIdentity(identity, useEditorStore.getState().identity)) return;
				const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
				const result = jobReadiness(
					{
						...identity,
						baseRevision: report.identity.resumeRevision,
						contentHash: report.identity.contentHash,
						jobId: report.identity.jobId,
						jobRevision: report.identity.jobRevision,
						rubricVersion: report.identity.rubricVersion,
						normalizationVersion: report.identity.normalizationVersion,
					},
					report,
				);
				useReadinessStore.setState((state) => ({
					jobReport: report,
					results: {
						...state.results,
						job:
							hash === report.identity.contentHash
								? result
								: invalidateReadiness({ ...state.results, job: result }, "job").job,
					},
				}));
			})
			.catch(() => {
				if (!cancelled)
					useReadinessStore.setState((state) => ({
						results: { ...state.results, job: { ...emptyReadiness("job"), state: "failed" } },
					}));
			});
		return () => {
			cancelled = true;
		};
	}, [identity, data, job.data, job.error, job.isFetching]);
	useEffect(() => {
		if (!identity || !data) {
			useReadinessStore.setState({ results: empty(), pdfReport: null, jobReport: null });
			return;
		}
		if (
			useReadinessStore.getState().results.pdf.source?.ownerId !== identity.ownerId ||
			useReadinessStore.getState().results.pdf.source?.resumeId !== identity.resumeId
		)
			useReadinessStore.setState({ results: empty(), pdfReport: null, jobReport: null });
		useReadinessStore.setState({
			results: invalidateReadiness(invalidateReadiness(useReadinessStore.getState().results, "pdf"), "writing"),
			pdfReport: null,
		});
		const current = () => sameEditorIdentity(identity, useEditorStore.getState().identity);
		return scheduleReadiness(
			(signal) => {
				if (current() && hasResumePreviewContent(data))
					useReadinessStore.setState((state) => ({
						results: {
							...state.results,
							pdf: { ...emptyReadiness("pdf"), state: "checking", source: null, checkedAt: null },
						},
					}));
				return evaluateReadiness({ identity, data }, signal);
			},
			(result) => {
				if (current())
					useReadinessStore.setState((state) => ({
						...result,
						results: mergeDocumentReadiness(state.results, result.results),
					}));
			},
			isEditableElementFocused() ? TYPING_DEBOUNCE_MS : UPDATE_DEBOUNCE_MS,
		);
	}, [identity, data, retry]);
	useEffect(() => () => useReadinessStore.setState({ results: empty(), pdfReport: null, jobReport: null }), []);
}
/** Hook consumers get no obsolete success during the effect-cleanup boundary. */
export function useReadiness() {
	const identity = useEditorStore((state) => state.identity);
	const state = useReadinessStore();
	let results = state.results;
	for (const kind of ["pdf", "writing", "job"] as const) {
		const result = results[kind];
		if (result.source && !sameEditorIdentity(result.source, identity)) results = invalidateReadiness(results, kind);
	}
	const { introduced, setIntroduced } = useCheckIntroduction(identity?.ownerId);
	return {
		...state,
		results,
		introduced,
		setIntroduced,
	};
}
