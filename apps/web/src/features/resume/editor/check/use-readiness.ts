import type { ReadinessResults } from "@reactive-resume/resume/ats";
import type { PdfAtsReport } from "@reactive-resume/resume/ats-pdf";
import { useEffect } from "react";
import { create } from "zustand/react";
import { emptyReadiness, invalidateReadiness } from "@reactive-resume/resume/ats";
import { useResumeData, isEditableElementFocused } from "../../builder/draft";
import { hasResumePreviewContent } from "../../preview/resume-thumbnail.shared";
import { TYPING_DEBOUNCE_MS, UPDATE_DEBOUNCE_MS } from "../../preview/timing";
import { useEditorStore, sameEditorIdentity } from "../store";
import { evaluateReadiness } from "./evaluate";
import { useCheckIntroduction } from "./introduction";
import { scheduleReadiness } from "./readiness";

const empty = (): ReadinessResults => ({
	pdf: emptyReadiness("pdf"),
	writing: emptyReadiness("writing"),
	job: emptyReadiness("job"),
});
const useReadinessStore = create<{
	results: ReadinessResults;
	pdfReport: PdfAtsReport | null;
	retry: number;
	requestRetry: () => void;
}>((set) => ({
	results: empty(),
	pdfReport: null,
	retry: 0,
	requestRetry: () => set((state) => ({ retry: state.retry + 1 })),
}));
/** Mounted once by the editor shell, independently of the visible panel. No extracted text is retained. */
export function useReadinessLifecycle() {
	const identity = useEditorStore((state) => state.identity);
	const data = useResumeData();
	const retry = useReadinessStore((state) => state.retry);
	useEffect(() => {
		if (!identity || !data) {
			useReadinessStore.setState({ results: empty(), pdfReport: null });
			return;
		}
		if (
			useReadinessStore.getState().results.pdf.source?.ownerId !== identity.ownerId ||
			useReadinessStore.getState().results.pdf.source?.resumeId !== identity.resumeId
		)
			useReadinessStore.setState({ results: empty(), pdfReport: null });
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
				if (current()) useReadinessStore.setState(result);
			},
			isEditableElementFocused() ? TYPING_DEBOUNCE_MS : UPDATE_DEBOUNCE_MS,
		);
	}, [identity, data, retry]);
	useEffect(() => () => useReadinessStore.setState({ results: empty(), pdfReport: null }), []);
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
