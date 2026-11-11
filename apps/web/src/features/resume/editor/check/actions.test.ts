import { beforeEach, expect, it, vi } from "vite-plus/test";
import { captureUndoAction } from "../undo-action";
const state = vi.hoisted(() => ({ ownerId: "alice", resumeId: "a", editGeneration: 1, canUndo: true, undo: vi.fn() }));
vi.mock("../../builder/draft", () => ({ useResumeStore: { getState: () => state } }));
beforeEach(() => {
	Object.assign(state, { ownerId: "alice", resumeId: "a", editGeneration: 1, canUndo: true });
	state.undo.mockClear();
});
it("expires Undo after another edit or a document or owner switch", () => {
	for (const change of [{ editGeneration: 2 }, { resumeId: "b" }, { ownerId: "bob" }]) {
		const undo = captureUndoAction();
		Object.assign(state, change);
		undo();
		expect(state.undo).not.toHaveBeenCalled();
	}
});
it("allows the current action only once", () => {
	const undo = captureUndoAction();
	undo();
	state.editGeneration++;
	undo();
	expect(state.undo).toHaveBeenCalledTimes(1);
});
