// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createReviewState, readReviewDraft, removeReviewDraft, saveReviewDraft } from "./review-draft";

const identity = { ownerId: "review-owner", flowId: "550e8400-e29b-41d4-a716-446655440000" };
type FakeRequest = { result?: unknown; onsuccess?: () => void; onupgradeneeded?: () => void };
const rows = new Map<string, unknown>();
const database = {
	createObjectStore: () => {},
	close: () => {},
	transaction: () => {
		const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void } = {};
		const store = {
			openCursor: () => {
				const request: FakeRequest = {};
				queueMicrotask(() => request.onsuccess?.());
				return request;
			},
			put: (value: unknown, key: string) => {
				rows.set(key, value);
				queueMicrotask(() => tx.oncomplete?.());
			},
			get: (key: string) => {
				const request: FakeRequest = {};
				queueMicrotask(() => {
					request.result = rows.get(key);
					request.onsuccess?.();
					queueMicrotask(() => tx.oncomplete?.());
				});
				return request;
			},
			delete: (key: string) => {
				rows.delete(key);
				queueMicrotask(() => tx.oncomplete?.());
			},
		};
		return Object.assign(tx, { objectStore: () => store });
	},
};
afterEach(async () => {
	await removeReviewDraft(identity);
	rows.clear();
	vi.unstubAllGlobals();
});

it("saves and restores issue targets and confirmed resolutions", async () => {
	vi.stubGlobal("indexedDB", {
		open: () => {
			const request: FakeRequest = {};
			queueMicrotask(() => {
				request.result = database;
				request.onupgradeneeded?.();
				request.onsuccess?.();
			});
			return request;
		},
	});
	const issue = { field: "location" as const, source: "Cairo", section: "experience" as const, entryIndex: 0 };
	const state = { ...createReviewState(defaultResumeData, identity.flowId), resolvedIssues: { 0: true } };
	await saveReviewDraft({
		version: 1,
		...identity,
		expiresAt: Date.now() + 60_000,
		file: new File(["resume"], "resume.pdf"),
		initial: defaultResumeData,
		pages: [{ page: 1, text: "Resume" }],
		issues: [issue],
		partial: false,
		state,
	});

	const restored = await readReviewDraft(identity);

	expect(restored?.issues).toEqual([issue]);
	expect(restored?.state.resolvedIssues).toEqual({ 0: true });
	const legacyFlowId = "550e8400-e29b-41d4-a716-446655440001";
	await saveReviewDraft({
		version: 1,
		...identity,
		flowId: legacyFlowId,
		expiresAt: Date.now() + 60_000,
		file: new File(["resume"], "resume.pdf"),
		initial: defaultResumeData,
		pages: [{ page: 1, text: "Resume" }],
		issues: [{ field: "position", source: "Engineer" }],
		partial: false,
		state: createReviewState(defaultResumeData, legacyFlowId),
	});
	expect(await readReviewDraft({ ...identity, flowId: legacyFlowId })).toMatchObject({
		issues: [{ field: "position", source: "Engineer" }],
	});
});
