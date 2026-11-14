// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { analyzeJobTerms, JOB_NORMALIZATION_VERSION, JOB_RUBRIC_VERSION } from "@reactive-resume/resume/ats";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useEditorStore } from "../store";
import { useReadiness, useReadinessLifecycle } from "./use-readiness";
const state = vi.hoisted(() => ({
	query: { data: undefined as unknown, error: null, isFetching: false },
	data: undefined as unknown,
	options: undefined as { queryKey: unknown[] } | undefined,
}));
vi.mock("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey: unknown[] }) => {
		state.options = options;
		return state.query;
	},
}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { career: { jobTargets: { evidence: { queryOptions: () => ({ queryKey: ["selected-job"] }) } } } },
}));
vi.mock("../../builder/draft", () => ({ useResumeData: () => state.data, isEditableElementFocused: () => false }));
vi.mock("./evaluate", () => ({ evaluateReadiness: vi.fn() }));
vi.mock("./readiness", async (importOriginal) => ({
	...(await importOriginal<typeof import("./readiness")>()),
	scheduleReadiness: () => () => {},
}));
vi.mock("./introduction", () => ({ useCheckIntroduction: () => ({ introduced: true, setIntroduced: vi.fn() }) }));
afterEach(() => {
	cleanup();
	useEditorStore.getState().reset();
	vi.restoreAllMocks();
});
const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "v1", editGeneration: 0 };
async function report(jobId: string) {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(state.data)));
	const contentHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
	return analyzeJobTerms({
		identity: {
			resumeId: "cv",
			resumeRevision: "v1",
			contentHash,
			jobId,
			jobRevision: "1",
			normalizationVersion: JOB_NORMALIZATION_VERSION,
			rubricVersion: JOB_RUBRIC_VERSION,
		},
		jobText: "React",
		passages: [],
	});
}
function show() {
	useEditorStore.getState().setIdentity(identity);
	state.data = structuredClone(defaultResumeData);
	return renderHook(() => {
		useReadinessLifecycle();
		return useReadiness();
	});
}
it("moves no-job to checking and completes only the selected job without disturbing document dimensions", async () => {
	state.query = { data: undefined, error: null, isFetching: false };
	const hook = show();
	expect(hook.result.current.results.job.state).toBe("not-checked");
	const pdf = hook.result.current.results.pdf;
	const writing = hook.result.current.results.writing;
	state.query = { data: undefined, error: null, isFetching: true };
	hook.rerender();
	expect(hook.result.current.results.job.state).toBe("checking");
	state.query = { data: { literal: await report("B") }, error: null, isFetching: false };
	hook.rerender();
	await waitFor(() => expect(hook.result.current.results.job.source).toMatchObject({ jobId: "B" }));
	expect(hook.result.current.results.pdf).toBe(pdf);
	expect(hook.result.current.results.writing).toBe(writing);
});
it("cancels a late digest for job A after job B is selected", async () => {
	state.query = { data: undefined, error: null, isFetching: false };
	const hook = show();
	const first = await report("A");
	const second = await report("B");
	const digest = crypto.subtle.digest.bind(crypto.subtle);
	let release!: (value: ArrayBuffer) => void;
	const bytes = await digest("SHA-256", new TextEncoder().encode(JSON.stringify(state.data)));
	vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = resolve;
			}),
	);
	state.query = { data: { literal: first }, error: null, isFetching: false };
	hook.rerender();
	state.query = { data: { literal: second }, error: null, isFetching: false };
	hook.rerender();
	await waitFor(() => expect(hook.result.current.results.job.source).toMatchObject({ jobId: "B" }));
	await act(async () => {
		release(bytes);
		await Promise.resolve();
	});
	expect(hook.result.current.results.job.source).toMatchObject({ jobId: "B" });
});
it("clears owner-bound job evidence on an owner or CV switch", async () => {
	state.query = { data: undefined, error: null, isFetching: false };
	const hook = show();
	state.query = { data: { literal: await report("A") }, error: null, isFetching: false };
	hook.rerender();
	await waitFor(() => expect(hook.result.current.results.job.state).toBe("complete"));
	state.query = { data: undefined, error: null, isFetching: false };
	act(() => useEditorStore.getState().setIdentity({ ...identity, ownerId: "another", resumeId: "other" }));
	expect(hook.result.current.results.job.source).toBeNull();
});

it("keeps the evidence request stable while typing and refreshes after an acknowledged save", async () => {
	state.query = { data: undefined, error: null, isFetching: false };
	const hook = show();
	state.query = { data: { literal: await report("A") }, error: null, isFetching: false };
	hook.rerender();
	await waitFor(() => expect(hook.result.current.results.job.state).toBe("complete"));
	const savedKey = state.options?.queryKey;
	state.data = { ...defaultResumeData, summary: { ...defaultResumeData.summary, content: "Unsaved change" } };
	act(() => useEditorStore.getState().setIdentity({ ...identity, editGeneration: 1 }));
	expect(state.options?.queryKey).toEqual(savedKey);
	await waitFor(() => expect(hook.result.current.results.job.state).toBe("stale"));
	act(() => useEditorStore.getState().setIdentity({ ...identity, editGeneration: 1, baseRevision: "v2" }));
	expect(state.options?.queryKey).not.toEqual(savedKey);
});
