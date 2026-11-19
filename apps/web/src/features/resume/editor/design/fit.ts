import type { EditorIdentity } from "../store";
import type { FitStep } from "./presets";
import type { PageMap } from "@reactive-resume/pdf/page-map";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { WritableDraft } from "immer";
import { t } from "@lingui/core/macro";
import { toast } from "@reactive-resume/ui/components/toast";
import { useEditorStore } from "../store";
import { captureUndoAction } from "../undo-action";
import { applyDensity, applyMargins, applyTextSize, fitToPages, matchDensity, matchMargins } from "./presets";
import { useResumeStore } from "@/features/resume/builder/draft";

const RENDER_TIMEOUT_MS = 8000;

export type FitOutcome = "rendered" | "timed-out" | "cancelled";
const sameGeneration = (a: EditorIdentity | null | undefined, b: EditorIdentity) =>
	Boolean(a && a.ownerId === b.ownerId && a.resumeId === b.resumeId && a.editGeneration === b.editGeneration);

/** An acknowledgement may advance the baseline; only the requested content generation can satisfy Fit. */
export function waitForRender(identity: EditorIdentity): Promise<FitOutcome> {
	return new Promise((resolve) => {
		const outcome = (): FitOutcome | undefined => {
			const state = useEditorStore.getState();
			if (!sameGeneration(state.identity, identity) || state.previewTemplate || state.historyVersionId)
				return "cancelled";
			if (state.rendered.file && sameGeneration(state.rendered.identity, identity)) return "rendered";
		};
		const immediate = outcome();
		if (immediate) return resolve(immediate);
		const finish = (result: FitOutcome) => {
			clearTimeout(timer);
			unsubscribe();
			resolve(result);
		};
		const unsubscribe = useEditorStore.subscribe(() => {
			const result = outcome();
			if (result) finish(result);
		});
		const timer = setTimeout(() => finish("timed-out"), RENDER_TIMEOUT_MS);
	});
}

function applyStep(metadata: WritableDraft<ResumeData["metadata"]>, step: FitStep) {
	if ("density" in step) applyDensity(metadata, step.density);
	else if ("margins" in step) applyMargins(metadata, step.margins);
	else applyTextSize(metadata, step.size);
}

const densityLabel = () => ({ compact: t`Compact`, normal: t`Normal`, roomy: t`Roomy` });
const marginsLabel = () => ({ narrow: t`narrow margins`, normal: t`normal margins`, wide: t`wide margins` });

/** Offer one fewer physical page only when the last page contains a small tail. */
export function measureOverflow(data: ResumeData, rendered: { pageCount: number; pageMap: PageMap | undefined }) {
	const authored = Math.max(1, data.metadata.layout.pages.length);
	const { pageCount, pageMap } = rendered;
	if (pageCount <= authored || data.metadata.page.format === "free-form") return null;
	const lastPage = pageCount - 1;
	const nodes = pageMap?.nodes.filter((node) => node.page === lastPage && node.height > 0) ?? [];
	if (!nodes.length) return null;
	const top = Math.min(...nodes.map((node) => node.y));
	const bottom = Math.max(...nodes.map((node) => node.y + node.height));
	const height = bottom - top;
	const lineHeight = data.metadata.typography.body.fontSize * data.metadata.typography.body.lineHeight;
	const printableHeight = (pageMap?.pages[lastPage]?.height ?? 0) - data.metadata.page.marginY * 2 * (72 / 25.4);
	if (height <= 0 || lineHeight <= 0 || printableHeight <= 0) return null;
	const lines = Math.ceil(height / lineHeight);
	// Require both <=8 body-line equivalents and <=15% of the printable PDF height to avoid full-page hints.
	if (lines > 8 || height / printableHeight > 0.15) return null;
	return { authored, pageCount, lines, targetPages: lastPage };
}

/**
 * Fit to the requested count (authored pages by default): tightens density, margins, then size (at least 9 pt), waiting for the page
 * to re-render after each step. The whole run is one undo step.
 */
export async function runFit(targetPages?: number) {
	const { resume, updateResumeData } = useResumeStore.getState();
	let identity = useEditorStore.getState().identity;
	if (!resume || !identity || identity.resumeId !== resume.id) return "cancelled" as const;
	const { metadata } = resume.data;
	const authored = Math.max(1, metadata.layout.pages.length, targetPages ?? 1);
	const key = `design.fit:${Date.now()}`;
	let interrupted: FitOutcome | undefined;
	let applied = false;

	const stopped = Symbol("fit-stopped");
	let result: Awaited<ReturnType<typeof fitToPages>>;
	try {
		result = await fitToPages(
			{ density: matchDensity(metadata), margins: matchMargins(metadata), size: metadata.typography.body.fontSize },
			(step) => {
				if (!identity || !sameGeneration(useEditorStore.getState().identity, identity)) {
					interrupted = "cancelled";
					throw stopped;
				}
				applied = true;
				updateResumeData((draft) => applyStep(draft.metadata, step), { coalesceKey: key, sameStep: true });
				identity = useEditorStore.getState().identity;
				if (!identity) {
					interrupted = "cancelled";
					throw stopped;
				}
			},
			async () => {
				if (!identity) {
					interrupted = "cancelled";
					throw stopped;
				}
				const outcome = await waitForRender(identity);
				if (outcome !== "rendered") {
					interrupted = outcome;
					throw stopped;
				}
				return useEditorStore.getState().rendered.pageCount <= authored;
			},
		);
	} catch (error) {
		if (error !== stopped) throw error;
		if (applied && interrupted === "timed-out") {
			toast.add({
				type: "error",
				description: t`The resume preview could not be updated. The last valid preview is still shown.`,
				actionProps: { children: t`Undo`, onClick: captureUndoAction() },
			});
		}
		return interrupted ?? "cancelled";
	}
	const undoAction = { children: t`Undo`, onClick: captureUndoAction() };
	if (!result.fits) {
		const pages = useEditorStore.getState().rendered.pageCount;
		toast.add({
			type: "warning",
			description: t`Still ${pages} pages at 9 pt. Hide a section or shorten entries.`,
			...(applied ? { actionProps: undoAction } : {}),
		});
		return "rendered" as const;
	}
	if (!applied) return "rendered" as const;

	const { density, margins, size } = result.state;
	const details = [density ? densityLabel()[density] : null, margins ? marginsLabel()[margins] : null, t`${size} pt`]
		.filter(Boolean)
		.join(", ");
	const fittedPages = useEditorStore.getState().rendered.pageCount;
	toast.add({
		description: fittedPages === 1 ? t`Fits on one page: ${details}` : t`Fits on ${fittedPages} pages: ${details}`,
		actionProps: undoAction,
	});
	return "rendered" as const;
}
