import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { produce } from "immer";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useEditorStore } from "../store";
import { runFit, waitForRender } from "./fit";
const mocks = vi.hoisted(() => ({ getState: vi.fn(), toast: vi.fn() }));
vi.mock("@/features/resume/builder/draft", () => ({ useResumeStore: { getState: mocks.getState } }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.toast } }));
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

it("offers Undo for the applied Fit adjustment when its preview times out", async () => {
	vi.useFakeTimers();
	i18n.loadAndActivate({ locale: "en", messages: {} });
	mocks.toast.mockClear();
	const original = structuredClone(defaultResumeData);
	const state = {
		ownerId: identity.ownerId,
		resumeId: identity.resumeId,
		editGeneration: identity.editGeneration,
		canUndo: true,
		resume: { id: identity.resumeId, data: original },
		undo: () => {
			state.resume.data = original;
		},
		updateResumeData: (mutate: (data: ResumeData) => void) => {
			state.resume.data = produce(state.resume.data, mutate);
			state.editGeneration++;
			useEditorStore.getState().setIdentity({ ...identity, editGeneration: state.editGeneration });
		},
	};
	mocks.getState.mockImplementation(() => state);
	useEditorStore.getState().setIdentity(identity);
	useEditorStore.getState().setRendered({ identity, pageCount: 2, pageMap: undefined, file: new Blob() });
	const fitting = runFit();
	await vi.advanceTimersByTimeAsync(8000);
	expect(await fitting).toBe("timed-out");
	expect(state.resume.data).not.toEqual(original);
	expect(mocks.toast).toHaveBeenCalledWith(
		expect.objectContaining({
			type: "error",
			description: "The resume preview could not be updated. The last valid preview is still shown.",
			actionProps: { children: "Undo", onClick: expect.any(Function) },
		}),
	);
	mocks.toast.mock.calls[0]?.[0].actionProps.onClick();
	expect(state.resume.data).toEqual(original);
});
