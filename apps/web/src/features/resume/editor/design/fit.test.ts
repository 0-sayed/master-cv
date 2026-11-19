import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { produce } from "immer";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useEditorStore } from "../store";
import { measureOverflow, runFit, waitForRender } from "./fit";
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

it("measures only the last physical page and hides substantial overflow", () => {
	const data = structuredClone(defaultResumeData);
	data.metadata.typography.body.fontSize = 10;
	data.metadata.typography.body.lineHeight = 1.5;
	const map = {
		pages: [
			{ width: 595, height: 842 },
			{ width: 595, height: 842 },
		],
		nodes: [{ kind: "header" as const, key: "spill", page: 1, x: 0, y: 20, width: 500, height: 90 }],
	};
	expect(measureOverflow(data, { pageCount: 2, pageMap: map })).toMatchObject({ lines: 6, targetPages: 1 });
	expect(measureOverflow(data, { pageCount: 1, pageMap: map })).toBeNull();
	const fullPageHeight = (map.pages[0]?.height ?? 0) - data.metadata.page.marginY * 2 * (72 / 25.4);
	map.pages = Array.from({ length: 6 }, () => map.pages).flat();
	map.nodes = Array.from({ length: 12 }, (_, page) => ({
		kind: "header" as const,
		key: `page-${page}`,
		page,
		x: 0,
		y: 20,
		width: map.nodes[0]?.width ?? 0,
		height: fullPageHeight,
	}));
	expect(measureOverflow(data, { pageCount: 12, pageMap: map })).toBeNull();
	map.pages = map.pages.slice(0, 3);
	map.nodes = map.nodes.slice(0, 3);
	if (map.nodes[2]) map.nodes[2].height = 60;
	expect(measureOverflow(data, { pageCount: 3, pageMap: map })).toMatchObject({
		lines: 4,
		pageCount: 3,
		targetPages: 2,
	});
	if (map.nodes[0]) map.nodes[0].height = 500;
	expect(measureOverflow(data, { pageCount: 2, pageMap: map })).toBeNull();
	expect(measureOverflow(data, { pageCount: 2, pageMap: undefined })).toBeNull();
});

it.each([true, false])("fits to the requested physical page count, success=%s", async (fits) => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	mocks.toast.mockClear();
	const original = structuredClone(defaultResumeData);
	const state = {
		ownerId: identity.ownerId,
		resumeId: identity.resumeId,
		editGeneration: identity.editGeneration,
		canUndo: true,
		resume: { id: identity.resumeId, data: original },
		undo: vi.fn(),
		updateResumeData: (mutate: (data: ResumeData) => void) => {
			state.resume.data = produce(state.resume.data, mutate);
			state.editGeneration++;
			const next = { ...identity, editGeneration: state.editGeneration };
			useEditorStore.getState().setIdentity(next);
			useEditorStore
				.getState()
				.setRendered({ identity: next, pageCount: fits ? 2 : 3, pageMap: undefined, file: new Blob() });
		},
	};
	mocks.getState.mockImplementation(() => state);
	useEditorStore.getState().setIdentity(identity);
	useEditorStore.getState().setRendered({ identity, pageCount: 3, pageMap: undefined, file: new Blob() });
	await runFit(2);
	expect(state.resume.data).not.toEqual(original);
	expect(state.resume.data.metadata.typography.body.fontSize).toBeGreaterThanOrEqual(9);
	expect(mocks.toast).toHaveBeenCalledWith(
		expect.objectContaining({
			description: fits
				? expect.stringContaining("Fits on 2 pages:")
				: "Still 3 pages at 9 pt. Hide a section or shorten entries.",
			actionProps: { children: "Undo", onClick: expect.any(Function) },
		}),
	);
});
