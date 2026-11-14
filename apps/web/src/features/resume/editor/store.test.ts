import { beforeEach, expect, it } from "vite-plus/test";
import { useEditorStore } from "./store";

const identity = { ownerId: "alice", resumeId: "a", baseRevision: "v1", editGeneration: 1 };
const render = { pageCount: 2, pageMap: undefined, file: new Blob(["selected"]) };
beforeEach(() => useEditorStore.getState().reset());
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
it("preserves Check scroll and return finding across modes and edits, scoped to the document", () => {
	const editor = useEditorStore.getState();
	editor.setIdentity(identity);
	editor.setCheckScrollTop(1250);
	editor.setCheckReturnIssue("lower-finding");
	editor.setMobileView("write");
	editor.setDrawerOpen(false);
	editor.setCheckTab("writing");
	editor.setIdentity({ ...identity, editGeneration: 2 });
	expect(useEditorStore.getState().checkScrollTop).toBe(1250);
	expect(useEditorStore.getState().checkReturnIssue).toBe("lower-finding");
	editor.setIdentity({ ...identity, resumeId: "other" });
	expect(useEditorStore.getState().checkScrollTop).toBe(0);
	expect(useEditorStore.getState().checkReturnIssue).toBeNull();
});
