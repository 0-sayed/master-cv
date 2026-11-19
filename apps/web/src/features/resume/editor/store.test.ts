import { beforeEach, expect, it } from "vite-plus/test";
import { useEditorStore } from "./store";

const identity = { ownerId: "alice", resumeId: "a", baseRevision: "v1", editGeneration: 1 };
const render = { pageCount: 2, pageMap: undefined, file: new Blob(["selected"]) };
beforeEach(() => useEditorStore.getState().reset());
it("remembers the invoked finding action when a touch press does not move focus", () => {
	const editor = useEditorStore.getState();
	editor.setCheckReturnIssue("finding", "field");
	expect(useEditorStore.getState().checkReturnAction).toBe("field");
	editor.setCheckReturnIssue("finding", "show");
	expect(useEditorStore.getState().checkReturnAction).toBe("show");
	editor.setCheckReturnIssue(null);
	expect(useEditorStore.getState().checkReturnAction).toBeNull();
});
it("keeps the open entry during edits and save acknowledgements until the document changes", () => {
	const editor = useEditorStore.getState();
	const selection = { kind: "item", sectionId: "experience", itemId: "entry" } as const;
	editor.setIdentity(identity);
	editor.select(selection);
	editor.setIdentity({ ...identity, editGeneration: 2 });
	expect(useEditorStore.getState().selection).toEqual(selection);
	editor.setIdentity({ ...identity, editGeneration: 2, baseRevision: "v2" });
	expect(useEditorStore.getState().selection).toEqual(selection);
	editor.setIdentity({ ...identity, resumeId: "other" });
	expect(useEditorStore.getState().selection).toBeNull();
});
it("rejects late renders after edits, owner switches and document switches", () => {
	for (const next of [
		{ ...identity, editGeneration: 2 },
		{ ...identity, ownerId: "bob" },
		{ ...identity, resumeId: "b" },
	]) {
		useEditorStore.getState().setIdentity(identity);
		useEditorStore.getState().setRendered({ ...render, identity });
		useEditorStore.getState().setIdentity(next);
		const before = useEditorStore.getState().rendered;
		useEditorStore.getState().setRendered({ ...render, identity });
		expect(useEditorStore.getState().rendered).toEqual(before);
		expect(before.file).toBeUndefined();
	}
});
it("does not publish a template or history preview as the selected render", () => {
	useEditorStore.getState().setIdentity(identity);
	useEditorStore.getState().setPreviewTemplate("onyx");
	useEditorStore.getState().setRendered({ ...render, identity });
	expect(useEditorStore.getState().rendered.file).toBeUndefined();
	useEditorStore.getState().setPreviewTemplate(null);
	useEditorStore.getState().setHistoryVersion("history");
	useEditorStore.getState().setRendered({ ...render, identity });
	expect(useEditorStore.getState().rendered.file).toBeUndefined();
});
it("preserves scroll across edits but clears the stale return finding", () => {
	const editor = useEditorStore.getState();
	editor.setIdentity(identity);
	editor.setReviewScrollTop("writing", 1250);
	editor.setCheckReturnIssue("lower-finding");
	editor.setMobileView("write");
	editor.setDrawerOpen(false);
	editor.setReviewTab("writing");
	editor.setIdentity({ ...identity, editGeneration: 2 });
	expect(useEditorStore.getState().reviewScrollTop.writing).toBe(1250);
	expect(useEditorStore.getState().checkReturnIssue).toBeNull();
	editor.setIdentity({ ...identity, resumeId: "other" });
	expect(useEditorStore.getState().reviewScrollTop.writing).toBe(0);
	expect(useEditorStore.getState().checkReturnIssue).toBeNull();
});

it("keeps independent review context and clears stale selection before a new revision", () => {
	const editor = useEditorStore.getState();
	editor.setIdentity(identity);
	editor.setReviewExpanded(true);
	editor.setReviewTab("writing");
	editor.setReviewFilter("writing", "warning");
	editor.setReviewScrollTop("writing", 420);
	editor.setReviewScrollTop("ats", 100);
	editor.setCheckIssue("selected");
	editor.setIdentity({ ...identity });
	expect(useEditorStore.getState().checkIssue).toBe("selected");
	editor.setIdentity({ ...identity, baseRevision: "v2" });
	expect(useEditorStore.getState()).toMatchObject({
		reviewExpanded: true,
		reviewTab: "writing",
		reviewFilters: { ats: "all", writing: "warning", ai: "all" },
		reviewScrollTop: { ats: 100, writing: 420, ai: 0 },
		checkIssue: null,
		checkReturnIssue: null,
	});
	for (const next of [
		{ ...identity, ownerId: "other" },
		{ ...identity, resumeId: "other" },
	]) {
		editor.setIdentity(next);
		expect(useEditorStore.getState()).toMatchObject({
			reviewExpanded: false,
			reviewTab: "ats",
			reviewScrollTop: { ats: 0, writing: 0, ai: 0 },
			reviewFilters: { ats: "all", writing: "all", ai: "all" },
		});
	}
});

it("preserves the export session across mobile preview, revision updates, and Review", () => {
	const editor = useEditorStore.getState();
	editor.setIdentity(identity);
	editor.setShareTab("download");
	editor.setExportHistoryFileName("سارة-CV");
	editor.setExportHistoryScrollTop("download", 120);
	editor.setShareTab("history");
	editor.setHistoryVersion("past");
	editor.setExportHistoryScrollTop("history", 640);
	editor.setExportHistoryPreview(true);
	expect(useEditorStore.getState().historyVersionId).toBe("past");
	expect(useEditorStore.getState().exportHistorySession).toMatchObject({
		ownerId: "alice",
		resumeId: "a",
		fileName: "سارة-CV",
		tab: "history",
		scrollTop: { download: 120, history: 640 },
		previewing: true,
	});
	editor.setExportHistoryPreview(false);
	editor.setIdentity({ ...identity, editGeneration: 2 });
	expect(useEditorStore.getState().exportHistorySession?.scrollTop.history).toBe(640);
	editor.setShareTab("download");
	editor.setExportHistoryReview(true);
	expect(useEditorStore.getState().shareTab).toBeNull();
	expect(useEditorStore.getState().exportHistorySession?.reviewReturn).toBe(true);
	editor.setExportHistoryReview(false);
	expect(useEditorStore.getState().shareTab).toBe("download");
	expect(useEditorStore.getState().exportHistorySession).toMatchObject({
		fileName: "سارة-CV",
		scrollTop: { download: 120, history: 640 },
		reviewReturn: false,
	});
	editor.setShareTab(null);
	expect(useEditorStore.getState().historyVersionId).toBeNull();
	expect(useEditorStore.getState().exportHistorySession).toBeNull();
});
it.each([
	{ ...identity, ownerId: "bob" },
	{ ...identity, resumeId: "other" },
])("clears the export session for a different identity %j", (next) => {
	const editor = useEditorStore.getState();
	editor.setIdentity(identity);
	editor.setShareTab("history");
	editor.setHistoryVersion("past");
	editor.setExportHistoryPreview(true);
	editor.setIdentity(next);
	expect(useEditorStore.getState().exportHistorySession).toBeNull();
	expect(useEditorStore.getState().historyVersionId).toBeNull();
});
