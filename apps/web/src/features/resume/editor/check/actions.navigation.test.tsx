// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useEditorStore } from "../store";
import { useCheckActions } from "./actions";
const mocks = vi.hoisted(() => ({ mode: vi.fn(), scroll: vi.fn(), state: "complete" }));
vi.mock("../use-editor-mode", () => ({ useEditorMode: () => ["check", mocks.mode] }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "mobile" }));
vi.mock("@/features/resume/builder/draft", () => ({ useResumeStore: { getState: () => ({ resume: null }) } }));
vi.mock("../write/reveal", () => ({ getScrollBehavior: () => "instant", revealSelectionInPanel: vi.fn() }));
vi.mock("./use-readiness", () => ({
	useReadiness: () => ({
		results: {
			pdf: {
				state: mocks.state,
				source: { ownerId: "owner", resumeId: "cv", baseRevision: "1", editGeneration: 0, bytesHash: "bytes" },
			},
		},
		pdfReport: {
			findings: [
				{ code: "NO_EMAIL", severity: "warning", evidence: { page: 2 } },
				{ code: "NO_TEXT_LAYER", severity: "blocker" },
				{ code: "NO_PHONE", severity: "warning", evidence: { page: 2, box: { x: 60, y: 80, width: 120, height: 40 } } },
			],
			tips: [],
		},
	}),
}));
beforeEach(() => {
	const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "1", editGeneration: 0 };
	useEditorStore.getState().reset();
	mocks.state = "complete";
	mocks.scroll.mockClear();
	useEditorStore.setState({
		identity,
		reviewExpanded: true,
		rendered: { identity, bytesHash: "bytes", pageCount: 2, pageMap: undefined, version: 1, file: new Blob(["pdf"]) },
	});
	document.body.innerHTML = '<div data-review-page="2"></div>';
	const page = document.querySelector("div");
	if (page) page.scrollIntoView = mocks.scroll;
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(0);
		return 1;
	});
});
afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});
it("navigates to a supplied page without inventing a box and preserves review context", () => {
	const editor = useEditorStore.getState();
	editor.setReviewFilter("ats", "warning");
	editor.setReviewScrollTop("ats", 350);
	const { result } = renderHook(useCheckActions);
	result.current.showPdfOnPage({ code: "NO_EMAIL", category: "contact", severity: "warning", evidence: { page: 2 } });
	expect(mocks.scroll).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
	expect(useEditorStore.getState()).toMatchObject({
		checkIssue: "pdf:NO_EMAIL:2:",
		mobileView: "page",
		pageView: "page",
		reviewExpanded: true,
		reviewFilters: { ats: "warning" },
		reviewScrollTop: { ats: 350 },
	});
});
it("keeps whole-file findings on the human preview and rejects stale results", () => {
	const { result } = renderHook(useCheckActions);
	result.current.showPdfOnPage({ code: "NO_TEXT_LAYER", category: "parseability", severity: "blocker" });
	expect(useEditorStore.getState().pageView).toBe("page");
	expect(mocks.scroll).not.toHaveBeenCalled();
	useEditorStore.getState().setIdentity({ ownerId: "other", resumeId: "cv", baseRevision: "1", editGeneration: 0 });
	result.current.showPdfOnPage({ code: "NO_EMAIL", category: "contact", severity: "warning", evidence: { page: 2 } });
	expect(useEditorStore.getState().checkIssue).toBeNull();
});

it("scrolls to the selected box marker instead of the page heading", () => {
	document.body.innerHTML = '<div data-review-page="2"></div><div data-issue-pin="pdf:NO_PHONE:2:"></div>';
	const marker = document.querySelector("[data-issue-pin]");
	if (marker) marker.scrollIntoView = mocks.scroll;
	const { result } = renderHook(useCheckActions);
	result.current.showPdfOnPage({
		code: "NO_PHONE",
		category: "contact",
		severity: "warning",
		evidence: { page: 2, box: { x: 60, y: 80, width: 120, height: 40 } },
	});
	expect(mocks.scroll).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
	expect(useEditorStore.getState()).toMatchObject({
		checkIssue: "pdf:NO_PHONE:2:",
		pageView: "page",
		mobileView: "page",
	});
});
