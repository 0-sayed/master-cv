import { afterEach, expect, it, vi } from "vite-plus/test";
import { useEditorStore } from "../store";
import { waitForRender } from "./fit";
vi.mock("@/features/resume/builder/draft", () => ({ useResumeStore: { getState: () => ({}) } }));
const identity = { ownerId: "alice", resumeId: "a", baseRevision: "v1", editGeneration: 1 };
afterEach(() => {
	useEditorStore.getState().reset();
	vi.useRealTimers();
});
it("times out without claiming that an old render fits", async () => {
	vi.useFakeTimers();
	useEditorStore.getState().setIdentity(identity);
	const waiting = waitForRender(identity);
	await vi.advanceTimersByTimeAsync(8000);
	expect(await waiting).toBe("timed-out");
	expect(vi.getTimerCount()).toBe(0);
});
it("cancels on user edits or document switches", async () => {
	vi.useFakeTimers();
	useEditorStore.getState().setIdentity(identity);
	const waiting = waitForRender(identity);
	useEditorStore.getState().setIdentity({ ...identity, editGeneration: 2 });
	expect(await waiting).toBe("cancelled");
	expect(vi.getTimerCount()).toBe(0);
});
it("accepts only the requested generation, including its own Fit adjustment", async () => {
	useEditorStore.getState().setIdentity(identity);
	const waiting = waitForRender(identity);
	useEditorStore.getState().setRendered({ identity, pageCount: 1, pageMap: undefined, file: new Blob() });
	expect(await waiting).toBe("rendered");
});
