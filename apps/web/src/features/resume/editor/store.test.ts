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
