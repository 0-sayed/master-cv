import type { Resume } from "./draft";
// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, renderHook } from "@testing-library/react";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { ORPCError } from "@orpc/client";
import { sortSectionItemsByPeriod } from "@reactive-resume/resume/section-sort";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { applyFontPairing, getRecommendedFontPairing } from "../editor/design/presets";
import {
	readUnsavedResumeData,
	replaceResumeFonts,
	savePendingChanges,
	useBuilderResumeUpdateSubscription,
	useResumeCleanup,
	useResumeStore,
	useResumeUpdateSubscription,
} from "./draft";
import { storageKey, clearPersonalStorage, browserStorage } from "@/libs/browser-storage";
import { writeStoredDraft } from "@/libs/stored-draft";

const orpcMocks = vi.hoisted(() => ({
	getResumeById: vi.fn(),
	patchResume: vi.fn(),
	streamSubscribe: vi.fn(),
	updateResume: vi.fn(),
	importResume: vi.fn(),
	confirmImport: vi.fn(),
	readMaster: vi.fn(async () => ({ profileRevision: 0 })),
	restoreVersion: vi.fn(),
}));

const useBlockerMock = vi.hoisted(() => vi.fn());

const consumeEventIteratorMock = vi.hoisted(() => vi.fn());

const queryClientMock = vi.hoisted(() => ({
	setQueryData: vi.fn(),
}));

const routerParamsMock = vi.hoisted(() => ({
	value: {} as { resumeId?: string },
}));

const toastMocks = vi.hoisted(() => ({
	add: vi.fn(() => "sync-error-toast"),
	close: vi.fn(),
}));

vi.mock("@orpc/client", async (importOriginal) => ({
	ORPCError: (await importOriginal<typeof import("@orpc/client")>()).ORPCError,
	consumeEventIterator: consumeEventIteratorMock,
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => queryClientMock,
}));

vi.mock("@tanstack/react-router", () => ({
	useParams: () => routerParamsMock.value,
	useBlocker: useBlockerMock,
}));

vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		career: { master: { read: { call: orpcMocks.readMaster } } },
		resume: {
			restoreVersion: { call: orpcMocks.restoreVersion },
			import: { call: orpcMocks.importResume },
			confirmImport: { call: orpcMocks.confirmImport },
			getById: {
				call: orpcMocks.getResumeById,
				queryOptions: ({ input }: { input: { id: string } }) => ({
					queryKey: ["resume", "getById", input.id],
				}),
			},
			patch: {
				call: orpcMocks.patchResume,
			},
			update: {
				call: orpcMocks.updateResume,
			},
		},
	},
	streamClient: {
		resume: {
			updates: {
				subscribe: orpcMocks.streamSubscribe,
			},
		},
	},
}));

vi.mock("@reactive-resume/ui/components/toast", () => ({
	toast: toastMocks,
}));

function cloneResumeData(data: ResumeData): ResumeData {
	return structuredClone(data);
}

function makeResume(id: string): Resume {
	return {
		id,
		name: "Resume",
		slug: id,
		tags: [],
		data: cloneResumeData(defaultResumeData),
		isLocked: false,
		isPublic: false,
		hasPassword: false,
		createdAt: new Date("2026-05-20T09:00:00.000Z"),
		updatedAt: new Date("2026-05-26T12:00:00.000Z"),
	};
}

function withBasicsName(resume: Resume, name: string): Resume {
	return {
		...resume,
		data: {
			...resume.data,
			basics: {
				...resume.data.basics,
				name,
			},
		},
	};
}

function experienceItem(
	id: string,
	company: string,
	period: string,
): ResumeData["sections"]["experience"]["items"][number] {
	return {
		id,
		company,
		position: "Engineer",
		location: "",
		period,
		description: "",
		hidden: false,
		website: { url: "", label: "", inlineLink: false },
		roles: [],
	};
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("builder resume autosave", () => {
	it("removes an already-saved recovery backup before a later server revision", () => {
		const initial = makeResume("equal-backup");
		const key = storageKey("resumeBackup", initial.id);
		writeStoredDraft(
			"local",
			key,
			{
				ownerId: "alice",
				documentId: initial.id,
				baseRevision: initial.updatedAt.toISOString(),
			},
			initial.data,
		);
		useResumeStore.getState().initialize(initial, "alice");
		expect(useResumeStore.getState().recoveryDraft).toBeUndefined();
		expect(browserStorage.local.getItem(key)).toBeNull();
		useResumeStore.getState().initialize(
			{
				...withBasicsName(initial, "Newer server copy"),
				updatedAt: new Date(initial.updatedAt.getTime() + 1),
			},
			"alice",
		);
		expect(useResumeStore.getState().recoveryDraft).toBeUndefined();
	});
	it("preserves pending recovery until an explicit restore or discard", async () => {
		const initial = makeResume("unanswered-recovery");
		const backup = withBasicsName(initial, "Recover this original draft");
		writeStoredDraft(
			"local",
			storageKey("resumeBackup", initial.id),
			{
				ownerId: "alice",
				documentId: initial.id,
				baseRevision: initial.updatedAt.toISOString(),
			},
			backup.data,
		);
		useResumeStore.getState().initialize(initial, "alice");
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Accidental edit";
		});
		await vi.advanceTimersByTimeAsync(500);
		useResumeStore.getState().initialize(initial, "alice");
		expect(useResumeStore.getState().recoveryDraft?.value.basics.name).toBe("Recover this original draft");
		expect(orpcMocks.updateResume).not.toHaveBeenCalled();
	});
	it("preserves newer typing when a history restore finishes late", () => {
		const initial = makeResume("late-history");
		useResumeStore.getState().initialize(initial, "alice");
		const generation = useResumeStore.getState().editGeneration;
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Newer typing";
		});
		const restored = {
			...withBasicsName(initial, "Old version"),
			updatedAt: new Date(initial.updatedAt.getTime() + 1),
		};
		useResumeStore.getState().replaceResumeFromServer(restored, generation);
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Newer typing");
		expect(useResumeStore.getState().saveStatus).toBe("conflict");
		expect(readUnsavedResumeData(initial.id)?.basics.name).toBe("Newer typing");
	});
	it("binds a delayed history restore to its original visit", async () => {
		const initial = makeResume("history-original-visit");
		useResumeStore.getState().initialize(initial, "alice");
		let complete!: (resume: Resume) => void;
		orpcMocks.restoreVersion.mockReturnValueOnce(
			new Promise<Resume>((resolve) => {
				complete = resolve;
			}),
		);
		const pending = useResumeStore.getState().restoreVersion("old");
		await flushMicrotasks();
		useResumeStore.getState().initialize(initial, "alice");
		complete({ ...withBasicsName(initial, "Obsolete restore"), updatedAt: new Date(initial.updatedAt.getTime() + 1) });
		await expect(pending).rejects.toThrow();
		expect(useResumeStore.getState().resume?.data).toEqual(initial.data);
		expect(useResumeStore.getState().saveStatus).toBe("idle");
	});
	it.each([false, true])(
		"ignores a subscription snapshot older than an acknowledged save (deferred=%s)",
		async (deferred) => {
			consumeEventIteratorMock.mockReturnValue(vi.fn(async () => {}));
			const initial = makeResume(`old-subscription-${deferred}`);
			useResumeStore.getState().initialize(initial, "alice");
			routerParamsMock.value = { resumeId: initial.id };
			const old = withBasicsName(initial, "Old remote snapshot");
			old.updatedAt = new Date(initial.updatedAt.getTime() + 1);
			let complete!: (resume: Resume) => void;
			orpcMocks.getResumeById.mockReturnValueOnce(
				new Promise<Resume>((resolve) => {
					complete = resolve;
				}),
			);
			const hook = renderHook(() => useBuilderResumeUpdateSubscription());
			const handlers = consumeEventIteratorMock.mock.calls[0]?.[1] as {
				onEvent: (event: { mutation: string }) => Promise<void>;
			};
			const input = document.createElement("input");
			document.body.append(input);
			if (deferred) input.focus();
			const incoming = handlers.onEvent({ mutation: "update" });
			if (deferred) {
				complete(old);
				await incoming;
			}
			const saved = {
				...withBasicsName(initial, "Latest saved"),
				updatedAt: new Date(initial.updatedAt.getTime() + 2),
			};
			orpcMocks.updateResume.mockResolvedValueOnce(saved);
			useResumeStore.getState().updateResumeData((draft) => {
				draft.basics.name = "Latest saved";
			});
			await vi.advanceTimersByTimeAsync(500);
			if (!deferred) {
				complete(old);
				await incoming;
			} else {
				input.blur();
				await vi.advanceTimersByTimeAsync(1);
			}
			expect(useResumeStore.getState().resume?.data.basics.name).toBe("Latest saved");
			expect(useResumeStore.getState().acknowledgedUpdatedAt).toEqual(saved.updatedAt);
			input.remove();
			hook.unmount();
		},
	);
	it("refreshes a definitively rejected conflict-copy profile while retaining lost-response retries", async () => {
		const initial = makeResume("copy-profile-conflict");
		useResumeStore.getState().initialize(initial, "alice");
		orpcMocks.updateResume.mockRejectedValue(new ORPCError("RESUME_VERSION_CONFLICT", { status: 409 }));
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Local correction";
		});
		await vi.advanceTimersByTimeAsync(500);
		orpcMocks.readMaster.mockResolvedValueOnce({ profileRevision: 1 }).mockResolvedValueOnce({ profileRevision: 2 });
		orpcMocks.confirmImport
			.mockRejectedValueOnce(new ORPCError("IMPORT_REVIEW_CONFLICT", { status: 409 }))
			.mockResolvedValueOnce({ resumeId: "copy" });
		await expect(useResumeStore.getState().resolveConflict("save-copy")).rejects.toThrow();
		expect(await useResumeStore.getState().resolveConflict("save-copy")).toBe("copy");
		expect(orpcMocks.confirmImport.mock.calls[1]?.[0]).toMatchObject({
			expectedProfileRevision: 2,
			data: { basics: { name: "Local correction" } },
		});
	});
	it("waits for a queued edit after an in-flight save before navigating", async () => {
		const initial = makeResume("navigation-queued");
		useResumeStore.getState().initialize(initial, "alice");
		routerParamsMock.value = { resumeId: initial.id };
		const hook = renderHook(() => useResumeCleanup());
		const completions: Array<(resume: Resume) => void> = [];
		orpcMocks.updateResume.mockImplementation(
			() =>
				new Promise<Resume>((resolve) => {
					completions.push(resolve);
				}),
		);
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "First";
		});
		await vi.advanceTimersByTimeAsync(500);
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Latest";
		});
		const blocker = useBlockerMock.mock.lastCall?.[0];
		let settled = false;
		const result = blocker.shouldBlockFn({ next: { params: {} } }).then((blocked: boolean) => {
			settled = true;
			return blocked;
		});
		assert.exists(completions[0]);
		completions[0](withBasicsName(initial, "First"));
		await flushMicrotasks();
		expect(settled).toBe(false);
		expect(orpcMocks.updateResume.mock.lastCall?.[0].data.basics.name).toBe("Latest");
		assert.exists(completions[1]);
		completions[1](withBasicsName(initial, "Latest"));
		expect(await result).toBe(false);
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Latest");
		hook.unmount();
	});

	it("ends a stalled navigation wait without aborting or discarding the pending save", async () => {
		const initial = makeResume("navigation-timeout");
		useResumeStore.getState().initialize(initial, "alice");
		routerParamsMock.value = { resumeId: initial.id };
		const hook = renderHook(() => useResumeCleanup());
		let complete!: (resume: Resume) => void;
		orpcMocks.updateResume.mockImplementationOnce(
			() =>
				new Promise<Resume>((resolve) => {
					complete = resolve;
				}),
		);
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Pending name";
		});
		const blocker = useBlockerMock.mock.lastCall?.[0];
		let settled = false;
		const result = blocker.shouldBlockFn({ next: { params: {} } }).then((blocked: boolean) => {
			settled = true;
			return blocked;
		});
		await vi.advanceTimersByTimeAsync(10000);
		expect(settled).toBe(true);
		expect(await result).toBe(true);
		expect(useResumeStore.getState().saveStatus).toBe("saving");
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Pending name");
		expect(orpcMocks.updateResume.mock.lastCall?.[1].signal.aborted).toBe(false);

		orpcMocks.updateResume.mockResolvedValueOnce(withBasicsName(initial, "Latest name"));
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Latest name";
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(1);
		complete(withBasicsName(initial, "Pending name"));
		await flushMicrotasks();
		expect(useResumeStore.getState().saveStatus).toBe("saved");
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Latest name");
		expect(await blocker.shouldBlockFn({ next: { params: {} } })).toBe(false);
		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(2);
		hook.unmount();
	});

	beforeEach(() => {
		vi.useFakeTimers();
		orpcMocks.getResumeById.mockReset();
		useBlockerMock.mockReset();
		orpcMocks.patchResume.mockReset();
		orpcMocks.streamSubscribe.mockReset();
		orpcMocks.updateResume.mockReset();
		consumeEventIteratorMock.mockReset();
		queryClientMock.setQueryData.mockClear();
		routerParamsMock.value = {};
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		toastMocks.add.mockClear();
		toastMocks.close.mockClear();
		useResumeStore.getState().reset();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		useResumeStore.getState().reset();
	});

	it("keeps a failed draft in the builder and retries on the next navigation", async () => {
		const initial = makeResume("navigation-error");
		useResumeStore.getState().initialize(initial, "alice");
		routerParamsMock.value = { resumeId: initial.id };
		const hook = renderHook(() => useResumeCleanup());
		orpcMocks.updateResume.mockRejectedValueOnce(new Error("Offline"));
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Keep this draft";
		});
		const blocker = useBlockerMock.mock.lastCall?.[0];
		expect(blocker).toBeDefined();
		expect(await blocker.shouldBlockFn({ next: { params: {} } })).toBe(true);
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Keep this draft");
		expect(blocker.enableBeforeUnload()).toBe(true);
		orpcMocks.updateResume.mockResolvedValueOnce(withBasicsName(initial, "Keep this draft"));
		expect(await blocker.shouldBlockFn({ next: { params: {} } })).toBe(false);
		expect(blocker.enableBeforeUnload()).toBe(false);
		hook.unmount();
	});

	it("initializes and autosaves rapid edits without crypto.randomUUID (HTTP LAN origins)", async () => {
		vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
		const initial = makeResume("resume-rapid");
		const updated = withBasicsName(initial, "Latest Name");
		orpcMocks.updateResume.mockResolvedValue(updated);
		useResumeStore.getState().initialize(initial, "alice");
		expect(useResumeStore.getState().isReady).toBe(true);

		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "First Name";
		});
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Latest Name";
		});

		vi.advanceTimersByTime(500);
		await flushMicrotasks();

		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(1);
		expect(orpcMocks.updateResume).toHaveBeenCalledWith(
			{ id: initial.id, data: updated.data, sessionId: expect.any(String), expectedUpdatedAt: initial.updatedAt },
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(orpcMocks.patchResume).not.toHaveBeenCalled();
		expect(useResumeStore.getState().saveStatus).toBe("saved");
	});

	it("saves the latest pending snapshot after an in-flight save resolves", async () => {
		const initial = makeResume("resume-in-flight");
		const first = withBasicsName(initial, "First Name");
		const latest = withBasicsName(initial, "Latest Name");
		let resolveFirst!: (resume: Resume) => void;

		orpcMocks.updateResume
			.mockReturnValueOnce(
				new Promise<Resume>((resolve) => {
					resolveFirst = resolve;
				}),
			)
			.mockResolvedValueOnce(latest);

		useResumeStore.getState().initialize(initial, "alice");
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "First Name";
		});

		vi.advanceTimersByTime(500);
		await flushMicrotasks();

		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Latest Name";
		});
		vi.advanceTimersByTime(500);
		await flushMicrotasks();

		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(1);

		resolveFirst(first);
		await flushMicrotasks();

		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(2);
		expect(orpcMocks.updateResume.mock.calls[0]?.[0]).toEqual({
			id: initial.id,
			data: first.data,
			sessionId: expect.any(String),
			expectedUpdatedAt: initial.updatedAt,
		});
		expect(orpcMocks.updateResume.mock.calls[1]?.[0]).toEqual({
			id: initial.id,
			data: latest.data,
			sessionId: expect.any(String),
			expectedUpdatedAt: initial.updatedAt,
		});
		expect(orpcMocks.patchResume).not.toHaveBeenCalled();
	});

	it("does not recreate a personal backup when an old save fails after sign-out", async () => {
		const initial = makeResume("signed-out-private");
		useResumeStore.getState().initialize(initial, "alice");
		let reject!: (error: Error) => void;
		orpcMocks.updateResume.mockImplementationOnce(
			() =>
				new Promise((_resolve, fail) => {
					reject = fail;
				}),
		);
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Private old owner";
		});
		await vi.advanceTimersByTimeAsync(500);
		clearPersonalStorage();
		reject(new Error("late network failure"));
		await flushMicrotasks();
		expect(readUnsavedResumeData(initial.id)).toBeUndefined();
		expect(useResumeStore.getState().resume).toBeNull();
	});

	it("reports offline, keeps the draft on this device and sends it when the connection returns", async () => {
		const initial = makeResume("resume-offline");
		const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		orpcMocks.updateResume.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		useResumeStore.getState().initialize(initial, "alice");

		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Written offline";
		});
		vi.advanceTimersByTime(500);
		await flushMicrotasks();

		expect(useResumeStore.getState().saveStatus).toBe("offline");
		expect(readUnsavedResumeData("resume-offline")?.basics.name).toBe("Written offline");
		orpcMocks.updateResume.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		expect(await savePendingChanges("resume-offline")).toBe(false);
		expect(toastMocks.add).toHaveBeenCalledWith(
			expect.objectContaining({ id: "resume-offline-navigation", description: expect.stringContaining("Reconnect") }),
		);

		onLine.mockReturnValue(true);
		orpcMocks.updateResume.mockImplementation((input: { id: string; data: ResumeData }) =>
			Promise.resolve({ ...makeResume(input.id), data: input.data }),
		);
		window.dispatchEvent(new Event("online"));
		await flushMicrotasks();
		await flushMicrotasks();

		expect(orpcMocks.updateResume).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: "resume-offline" }),
			expect.anything(),
		);
		expect(useResumeStore.getState().saveStatus).toBe("saved");
		expect(readUnsavedResumeData("resume-offline")).toBeUndefined();
		onLine.mockRestore();
	});

	it("does not claim local recovery when browser storage is blocked", async () => {
		const initial = makeResume("blocked-storage");
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const blocked = vi.spyOn(browserStorage.local, "setItem").mockImplementation(() => {
			throw new DOMException("Blocked", "SecurityError");
		});
		useResumeStore.getState().initialize(initial, "alice");
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Unsaved private edit";
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(useResumeStore.getState().localRecoveryAvailable).toBe(false);
		expect(useResumeStore.getState().saveStatus).toBe("offline");
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Unsaved private edit");
		blocked.mockRestore();
		online.mockRestore();
	});
	it("requires explicit recovery before sending a same-base local draft", async () => {
		const initial = makeResume("resume-restore");
		writeStoredDraft(
			"local",
			storageKey("resumeBackup", "resume-restore"),
			{ ownerId: "alice", documentId: initial.id, baseRevision: initial.updatedAt.toISOString() },
			withBasicsName(initial, "Kept locally").data,
		);
		orpcMocks.updateResume.mockImplementation((input: { id: string; data: ResumeData }) =>
			Promise.resolve({ ...initial, data: input.data }),
		);
		useResumeStore.getState().initialize(initial, "alice");
		expect(useResumeStore.getState().resume?.data).toEqual(initial.data);
		expect(orpcMocks.updateResume).not.toHaveBeenCalled();
		expect(useResumeStore.getState().recoveryDraft?.value.basics.name).toBe("Kept locally");
		useResumeStore.getState().restoreLocalDraft();
		await flushMicrotasks();
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Kept locally");
		expect(orpcMocks.updateResume.mock.lastCall?.[0].expectedUpdatedAt).toEqual(initial.updatedAt);
	});
	it("uses only acknowledged baselines while typing and metadata refresh race the save", async () => {
		const initial = makeResume("ack-race");
		useResumeStore.getState().initialize(initial, "alice");
		let acknowledge!: (value: Resume) => void;
		orpcMocks.updateResume.mockImplementationOnce(
			() =>
				new Promise<Resume>((resolve) => {
					acknowledge = resolve;
				}),
		);
		orpcMocks.updateResume.mockImplementationOnce(() => new Promise(() => {}));
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "First";
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(orpcMocks.updateResume.mock.calls[0]?.[0].expectedUpdatedAt).toEqual(initial.updatedAt);
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "Second";
		});
		useResumeStore.getState().mergeResumeMetadata({ ...initial, updatedAt: new Date("2026-06-01") });
		await vi.advanceTimersByTimeAsync(500);
		const first = { ...withBasicsName(initial, "First"), updatedAt: new Date("2026-05-27") };
		acknowledge(first);
		await flushMicrotasks();
		expect(orpcMocks.updateResume.mock.calls[1]?.[0]).toMatchObject({
			expectedUpdatedAt: first.updatedAt,
			data: { basics: { name: "Second" } },
		});
		expect(useResumeStore.getState().saveStatus).toBe("saving");
	});
	it("keeps conflict edits without retrying on typing, reconnect or Retry", async () => {
		const initial = makeResume("conflict");
		useResumeStore.getState().initialize(initial, "alice");
		orpcMocks.updateResume.mockRejectedValue(new ORPCError("RESUME_VERSION_CONFLICT", { status: 409 }));
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "Local";
		});
		await vi.advanceTimersByTimeAsync(500);
		expect(useResumeStore.getState().saveStatus).toBe("conflict");
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "Local latest";
		});
		window.dispatchEvent(new Event("online"));
		useResumeStore.getState().retrySave();
		await vi.advanceTimersByTimeAsync(1000);
		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(1);
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Local latest");
		expect(await savePendingChanges(initial.id)).toBe(false);
	});
	it("restoring an older-base draft enters conflict and never overwrites the saved version", async () => {
		const initial = makeResume("stale-recovery");
		writeStoredDraft(
			"local",
			storageKey("resumeBackup", "stale-recovery"),
			{ ownerId: "alice", documentId: initial.id, baseRevision: "2026-01-01T00:00:00.000Z" },
			withBasicsName(initial, "Old draft").data,
		);
		useResumeStore.getState().initialize(initial, "alice");
		useResumeStore.getState().restoreLocalDraft();
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Old draft");
		expect(useResumeStore.getState().saveStatus).toBe("conflict");
		expect(orpcMocks.updateResume).not.toHaveBeenCalled();
	});
	it("retains a conflict when saving a copy fails and only discards after a successful choice", async () => {
		const initial = makeResume("resolve-conflict");
		useResumeStore.getState().initialize(initial, "alice");
		orpcMocks.updateResume.mockRejectedValue(new ORPCError("RESUME_VERSION_CONFLICT", { status: 409 }));
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "Local precious edits";
		});
		await vi.advanceTimersByTimeAsync(500);
		orpcMocks.confirmImport.mockRejectedValueOnce(new Error("Creation unavailable"));
		await expect(useResumeStore.getState().resolveConflict("save-copy")).rejects.toThrow("Creation unavailable");
		expect(readUnsavedResumeData(initial.id)?.basics.name).toBe("Local precious edits");
		expect(useResumeStore.getState().saveStatus).toBe("conflict");
		orpcMocks.getResumeById.mockResolvedValue({ ...initial, updatedAt: new Date("2026-06-01") });
		await useResumeStore.getState().resolveConflict("open-saved");
		expect(useResumeStore.getState().resume?.data).toEqual(initial.data);
		expect(readUnsavedResumeData(initial.id)).toBeUndefined();
		expect(useResumeStore.getState().canUndo).toBe(false);
	});
	it("does not let a late resolution callback replace another account's CV", async () => {
		const initial = makeResume("resolve-owner");
		useResumeStore.getState().initialize(initial, "alice");
		orpcMocks.updateResume.mockRejectedValue(new ORPCError("RESUME_VERSION_CONFLICT", { status: 409 }));
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "Alice local";
		});
		await vi.advanceTimersByTimeAsync(500);
		let complete!: (value: Resume) => void;
		orpcMocks.getResumeById.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		);
		const resolving = useResumeStore.getState().resolveConflict("open-saved");
		const next = makeResume("bob-cv");
		useResumeStore.getState().initialize(next, "bob");
		complete(initial);
		await resolving;
		expect(useResumeStore.getState().ownerId).toBe("bob");
		expect(useResumeStore.getState().resume).toEqual(next);
	});

	it("refuses another owner's recovery on an account switch", () => {
		const initial = makeResume("owner-recovery");
		writeStoredDraft(
			"local",
			storageKey("resumeBackup", "owner-recovery"),
			{ ownerId: "alice", documentId: initial.id, baseRevision: initial.updatedAt.toISOString() },
			withBasicsName(initial, "Alice secret").data,
		);
		useResumeStore.getState().initialize(initial, "bob");
		expect(useResumeStore.getState().recoveryDraft).toBeUndefined();
		expect(useResumeStore.getState().resume?.data).toEqual(initial.data);
	});
});

describe("builder resume undo/redo", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		orpcMocks.updateResume.mockReset();
		// Echo the submitted data back so the autosave completion doesn't count as an external rebase.
		orpcMocks.updateResume.mockImplementation((input: { id: string; data: ResumeData }) =>
			Promise.resolve({ ...makeResume(input.id), data: input.data }),
		);
		routerParamsMock.value = {};
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		useResumeStore.getState().reset();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		useResumeStore.getState().reset();
	});

	it.each(["recovery", "conflict", "locked", "stale"] as const)(
		"rejects font replacement when the preview becomes %s",
		(reason) => {
			const initial = makeResume(`font-${reason}`);
			useResumeStore.getState().initialize(initial, "alice");
			const before = useResumeStore.getState().resume?.data;
			assert(before);
			const after = cloneResumeData(before);
			after.metadata.typography.body.fontFamily = "IBM Plex Sans Arabic";
			if (reason === "recovery") {
				writeStoredDraft(
					"local",
					storageKey("resumeBackup", initial.id),
					{
						ownerId: "alice",
						documentId: initial.id,
						baseRevision: initial.updatedAt.toISOString(),
					},
					withBasicsName(initial, "Recovered edits").data,
				);
				useResumeStore.getState().initialize(initial, "alice");
			}
			if (reason === "conflict") useResumeStore.getState().setSaveStatus("conflict");
			if (reason === "locked")
				useResumeStore.getState().patchResume((resume) => {
					resume.isLocked = true;
				});
			if (reason === "stale")
				useResumeStore.getState().patchResume((resume) => {
					resume.data.basics.name = "Newer edit";
				});
			const current = useResumeStore.getState().resume?.data;
			expect(replaceResumeFonts(before, after)).toBe(false);
			expect(useResumeStore.getState().resume?.data).toBe(current);
			expect(useResumeStore.getState().canUndo).toBe(false);
		},
	);
	it("accepts a font preview as one reversible edit and rejects an unchanged pairing", () => {
		const initial = makeResume("accepted-font");
		useResumeStore.getState().initialize(initial, "alice");
		const before = useResumeStore.getState().resume?.data;
		assert(before);
		expect(replaceResumeFonts(before, before)).toBe(false);
		const after = cloneResumeData(before);
		after.metadata.typography.body.fontFamily = "IBM Plex Sans Arabic";
		expect(replaceResumeFonts(before, after)).toBe(true);
		expect(useResumeStore.getState().resume?.data.metadata.typography).toEqual(after.metadata.typography);
		expect(useResumeStore.getState().undoStack).toHaveLength(1);
		useResumeStore.getState().undo();
		expect(useResumeStore.getState().resume?.data).toEqual(before);
	});
	it("keeps an existing unsuitable font until accepted and restores it with undo", () => {
		const store = useResumeStore.getState;
		const resume = makeResume("font-replacement");
		resume.data.metadata.page.locale = "ar-SA";
		store().initialize(resume, "alice");
		const current = store().resume;
		assert(current);
		const before = structuredClone(current.data);
		const pairing = getRecommendedFontPairing(before);
		assert(pairing);
		expect(store().resume?.data.metadata.typography).toEqual(before.metadata.typography);
		store().updateResumeData((draft) => applyFontPairing(draft.metadata, pairing.id), { newStep: true });
		expect(store().resume?.data.metadata.typography.body.fontFamily).toBe("IBM Plex Sans Arabic");
		expect(store().undoStack).toHaveLength(1);
		store().undo();
		expect(store().resume?.data).toEqual(before);
	});

	it("coalesces rapid edits into a single undo step and restores the pre-burst state", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("undo-coalesce"), "alice");

		store().updateResumeData((draft) => {
			draft.basics.name = "First";
		});
		store().updateResumeData((draft) => {
			draft.basics.name = "Second";
		});

		expect(store().undoStack.length).toBe(1);
		expect(store().canUndo).toBe(true);
		expect(store().canRedo).toBe(false);
		expect(store().resume?.data.basics.name).toBe("Second");

		store().undo();
		expect(store().resume?.data.basics.name).toBe(defaultResumeData.basics.name);
		expect(store().canUndo).toBe(false);
		expect(store().canRedo).toBe(true);

		store().redo();
		expect(store().resume?.data.basics.name).toBe("Second");
		expect(store().canRedo).toBe(false);
	});

	it("merges typing in one field into one step, but not edits to different fields", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("undo-fields"), "alice");

		store().updateResumeData(
			(draft) => {
				draft.basics.name = "J";
			},
			{ coalesceKey: "basics.name" },
		);
		store().updateResumeData(
			(draft) => {
				draft.basics.name = "Jo";
			},
			{ coalesceKey: "basics.name" },
		);
		store().updateResumeData(
			(draft) => {
				draft.basics.headline = "Designer";
			},
			{ coalesceKey: "basics.headline" },
		);

		expect(store().undoStack.length).toBe(2);
		store().undo();
		expect(store().resume?.data.basics.headline).toBe(defaultResumeData.basics.headline);
		expect(store().resume?.data.basics.name).toBe("Jo");
		store().undo();
		expect(store().resume?.data.basics.name).toBe(defaultResumeData.basics.name);
	});

	it("keeps structural actions as steps of their own", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("undo-structural"), "alice");

		store().updateResumeData((draft) => {
			draft.basics.name = "A";
		});
		store().updateResumeData(
			(draft) => {
				draft.sections.skills.hidden = true;
			},
			{ newStep: true },
		);
		store().updateResumeData((draft) => {
			draft.basics.name = "B";
		});

		expect(store().undoStack.length).toBe(3);
	});

	it("merges a multi-edit action with the same key into one step, however long it takes", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("undo-same-step"), "alice");
		const now = vi.spyOn(Date, "now");

		now.mockReturnValue(1_000);
		store().updateResumeData(
			(draft) => {
				draft.metadata.page.gapY = 4;
			},
			{ coalesceKey: "fit:1", sameStep: true },
		);
		now.mockReturnValue(9_000);
		store().updateResumeData(
			(draft) => {
				draft.metadata.page.marginX = 10;
			},
			{ coalesceKey: "fit:1", sameStep: true },
		);
		now.mockRestore();

		expect(store().undoStack).toHaveLength(1);
		store().undo();
		expect(store().resume?.data.metadata.page).toMatchObject({ gapY: 6, marginX: 14 });
	});

	it("restores the exact authored Experience order with one undo after a one-shot sort", () => {
		const store = useResumeStore.getState;
		const initial = makeResume("sort-undo");
		initial.data.sections.experience.items = [
			experienceItem("unknown", "Mystery Co", "Recently"),
			experienceItem("older", "Older Co", "2018 - 2020"),
			experienceItem("current", "Current Co", "2023 - Present"),
		];
		const authoredItems = cloneResumeData(initial.data).sections.experience.items;
		store().initialize(initial, "alice");

		store().updateResumeData((draft) => {
			draft.sections.experience.items = sortSectionItemsByPeriod(
				draft.sections.experience.items,
				draft.metadata.page.locale,
			).items;
		});

		expect(store().resume?.data.sections.experience.items.map(({ id }) => id)).toEqual(["current", "older", "unknown"]);
		expect(store().undoStack).toHaveLength(1);

		store().undo();
		expect(store().resume?.data.sections.experience.items).toEqual(authoredItems);
		expect(store().canUndo).toBe(false);
	});

	it("retains the chosen order through autosave/reload and never resorts later field edits", async () => {
		const store = useResumeStore.getState;
		const initial = makeResume("sort-persistence");
		initial.data.sections.experience.items = [
			experienceItem("older", "Older Co", "2018 - 2020"),
			experienceItem("current", "Current Co", "2023 - Present"),
		];
		let savedResume: Resume | undefined;
		orpcMocks.updateResume.mockImplementation((input: { id: string; data: ResumeData }) => {
			savedResume = { ...makeResume(input.id), data: cloneResumeData(input.data) };
			return Promise.resolve(savedResume);
		});
		store().initialize(initial, "alice");

		store().updateResumeData((draft) => {
			draft.sections.experience.items = sortSectionItemsByPeriod(
				draft.sections.experience.items,
				draft.metadata.page.locale,
			).items;
		});
		vi.advanceTimersByTime(500);
		await flushMicrotasks();

		expect(orpcMocks.updateResume).toHaveBeenCalledTimes(1);
		expect(savedResume?.data.sections.experience.items.map(({ id }) => id)).toEqual(["current", "older"]);
		if (!savedResume) throw new Error("expected the sorted resume to be saved");

		store().reset();
		store().initialize(savedResume, "alice");
		store().updateResumeData((draft) => {
			const currentItem = draft.sections.experience.items.find(({ id }) => id === "current");
			if (currentItem) currentItem.period = "2010 - 2011";
		});

		expect(store().resume?.data.sections.experience.items.map(({ id }) => id)).toEqual(["current", "older"]);
	});

	it("separates edits outside the coalesce window into distinct undo steps", async () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("undo-boundary"), "alice");

		store().updateResumeData((draft) => {
			draft.basics.name = "A";
		});

		// Let the autosave flush (echoes the data back) and advance past the coalesce window.
		vi.advanceTimersByTime(600);
		await flushMicrotasks();

		store().updateResumeData((draft) => {
			draft.basics.name = "B";
		});

		expect(store().undoStack.length).toBe(2);

		store().undo();
		expect(store().resume?.data.basics.name).toBe("A");

		store().undo();
		expect(store().resume?.data.basics.name).toBe(defaultResumeData.basics.name);
	});

	it("clears the redo branch when a new edit follows an undo", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("undo-redo-clear"), "alice");

		store().updateResumeData((draft) => {
			draft.basics.name = "One";
		});
		store().undo();
		expect(store().canRedo).toBe(true);

		store().updateResumeData((draft) => {
			draft.basics.name = "Two";
		});

		expect(store().canRedo).toBe(false);
		expect(store().redoStack.length).toBe(0);
	});

	it("preserves the undo stack when the server echoes the current data (autosave)", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("rebase-echo"), "alice");

		store().updateResumeData((draft) => {
			draft.basics.name = "Edited";
		});
		expect(store().undoStack.length).toBe(1);

		const current = store().resume;
		if (!current) throw new Error("expected a current resume");
		const generation = store().editGeneration;
		// Autosave echo: the server returns data identical to what's already in the store.
		store().replaceResumeFromServer({ ...current, data: cloneResumeData(current.data) });

		expect(store().editGeneration).toBe(generation);
		expect(store().undoStack.length).toBe(1);
		expect(store().canUndo).toBe(true);
	});

	it("clears the undo stack when the server sends different data (external rebase)", () => {
		const store = useResumeStore.getState;
		store().initialize(makeResume("rebase-external"), "alice");

		store().updateResumeData((draft) => {
			draft.basics.name = "Edited";
		});
		expect(store().undoStack.length).toBe(1);

		const current = store().resume;
		if (!current) throw new Error("expected a current resume");
		// External / AI rebase: incoming data differs, so the local undo history no longer applies.
		store().replaceResumeFromServer(withBasicsName(current, "External Name"));

		expect(store().undoStack.length).toBe(0);
		expect(store().canUndo).toBe(false);
	});
});

describe("resume update stream subscription", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		orpcMocks.streamSubscribe.mockReset();
		consumeEventIteratorMock.mockReset();
		orpcMocks.getResumeById.mockReset();
		queryClientMock.setQueryData.mockClear();
		routerParamsMock.value = {};
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		useResumeStore.getState().reset();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		useResumeStore.getState().reset();
	});

	it.each([
		{ name: "resubscribes after the stream drops", error: new Error("stream dropped"), subscribes: 2, reported: 1 },
		// A signed-out tab would otherwise send a 401 every 2.5 s until it closes.
		{ name: "stops once the session is signed out", error: new ORPCError("UNAUTHORIZED"), subscribes: 1, reported: 0 },
	])("$name", ({ error, subscribes, reported }) => {
		const onUpdate = vi.fn().mockResolvedValue(undefined);
		const onError = vi.fn();
		consumeEventIteratorMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));

		renderHook(() => useResumeUpdateSubscription({ resumeId: "resume-retry", onUpdate, onError }));
		expect(orpcMocks.streamSubscribe).toHaveBeenCalledTimes(1);

		const handlers = consumeEventIteratorMock.mock.calls[0]?.[1] as { onError: (error: unknown) => void };
		act(() => handlers.onError(error));
		expect(onError).toHaveBeenCalledTimes(reported);
		act(() => {
			vi.advanceTimersByTime(2500);
		});
		expect(orpcMocks.streamSubscribe).toHaveBeenCalledTimes(subscribes);
	});

	it("replaces the builder draft from the server when there are no pending local edits", async () => {
		const initial = makeResume("resume-clean");
		const remote = withBasicsName(initial, "Remote Name");
		const cancel = vi.fn().mockResolvedValue(undefined);
		consumeEventIteratorMock.mockReturnValue(cancel);
		orpcMocks.getResumeById.mockResolvedValue(remote);
		routerParamsMock.value = { resumeId: initial.id };
		useResumeStore.getState().initialize(initial, "alice");

		renderHook(() => useBuilderResumeUpdateSubscription());
		const handlers = consumeEventIteratorMock.mock.calls[0]?.[1] as { onEvent: () => Promise<void> } | undefined;

		await act(async () => {
			await handlers?.onEvent();
		});

		expect(queryClientMock.setQueryData).toHaveBeenCalledWith(["resume", "getById", initial.id], remote);
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Remote Name");
	});

	it("does not overwrite pending local builder edits when a remote update arrives", async () => {
		const initial = makeResume("resume-pending");
		const remote = withBasicsName(initial, "Remote Name");
		const cancel = vi.fn().mockResolvedValue(undefined);
		consumeEventIteratorMock.mockReturnValue(cancel);
		orpcMocks.getResumeById.mockResolvedValue(remote);
		routerParamsMock.value = { resumeId: initial.id };
		useResumeStore.getState().initialize(initial, "alice");
		useResumeStore.getState().updateResumeData((draft) => {
			draft.basics.name = "Local Name";
		});

		renderHook(() => useBuilderResumeUpdateSubscription());
		const handlers = consumeEventIteratorMock.mock.calls[0]?.[1] as { onEvent: () => Promise<void> } | undefined;

		await act(async () => {
			await handlers?.onEvent();
		});

		expect(queryClientMock.setQueryData).toHaveBeenCalledWith(["resume", "getById", initial.id], remote);
		expect(useResumeStore.getState().resume?.data.basics.name).toBe("Local Name");
	});
	it("retries a conflict copy with one immutable confirmation flow", async () => {
		orpcMocks.confirmImport.mockReset();
		const initial = makeResume("copy-retry");
		useResumeStore.getState().initialize(initial, "alice");
		orpcMocks.updateResume.mockRejectedValue(new ORPCError("RESUME_VERSION_CONFLICT", { status: 409 }));
		useResumeStore.getState().updateResumeData((d) => {
			d.basics.name = "Keep these edits";
		});
		await vi.advanceTimersByTimeAsync(500);
		orpcMocks.confirmImport
			.mockRejectedValueOnce(new Error("Lost response"))
			.mockResolvedValueOnce({ resumeId: "one-copy" });
		await expect(useResumeStore.getState().resolveConflict("save-copy")).rejects.toThrow("Lost response");
		expect(await useResumeStore.getState().resolveConflict("save-copy")).toBe("one-copy");
		expect(orpcMocks.confirmImport).toHaveBeenCalledTimes(2);
		expect(orpcMocks.confirmImport.mock.calls[0]?.[0]).toMatchObject({
			data: { basics: { name: "Keep these edits" } },
		});
		expect(orpcMocks.confirmImport.mock.calls[0]?.[0]).toEqual(orpcMocks.confirmImport.mock.calls[1]?.[0]);
		expect(orpcMocks.importResume).not.toHaveBeenCalled();
	});
});
