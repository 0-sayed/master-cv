import type { StoredDraft } from "@/libs/stored-draft";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { ImportReviewInput } from "@reactive-resume/schema/resume/import-review";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { WritableDraft } from "immer";
import { t } from "@lingui/core/macro";
import { consumeEventIterator, ORPCError } from "@orpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useParams } from "@tanstack/react-router";
import { debounce, isEqual } from "es-toolkit";
import { useCallback, useEffect, useState } from "react";
import { immer } from "zustand/middleware/immer";
import { create } from "zustand/react";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { syncResumeDates } from "@reactive-resume/schema/resume/dates";
import { toast } from "@reactive-resume/ui/components/toast";
import { generateId } from "@reactive-resume/utils/string";
import { storageKey as registeredStorageKey, browserStorage, onPersonalStorageCleared } from "@/libs/browser-storage";
import { orpc, streamClient } from "@/libs/orpc/client";
import { readStoredDraft, writeStoredDraft } from "@/libs/stored-draft";

export type Resume = {
	id: string;
	name: string;
	slug: string;
	tags: string[];
	data: ResumeData;
	isLocked: boolean;
	createdAt: Date;
	updatedAt: Date;
	hasPassword?: boolean | undefined;
	isPublic?: boolean | undefined;
	showDownloadButtons?: boolean | undefined;
	/** The job application this resume was made for; Check's Job match reads its posting. */
	applicationId?: string | null;
};

// Mirrors the server-side ResumeUpdatedEvent discriminator (packages/api resume/events.ts).
type ResumeUpdateMutation = "sync" | "create" | "update" | "patch" | "lock" | "password" | "delete";
type ResumeUpdateEvent = { mutation: ResumeUpdateMutation };

/**
 * `offline`: the browser is offline; changes are kept on this device and sent when it reconnects.
 * `error`: the server rejected or couldn't be reached while online; changes are kept on this device
 * and the editor offers Retry.
 */
type SaveStatus = "idle" | "saving" | "saved" | "offline" | "error" | "conflict";

type UpdateResumeDataOptions = {
	/**
	 * Identifies the field being edited. Consecutive edits to the same field within a second merge into
	 * one undo step, so typing a sentence undoes as a whole.
	 */
	coalesceKey?: string;
	/** Always a step of its own (structural actions such as adding, moving or deleting). */
	newStep?: boolean;
	/**
	 * Merges into the current step whenever the previous edit had the same key, however long ago: one action
	 * made of several edits, such as Fit to one page, undoes as a whole.
	 */
	sameStep?: boolean;
};

type ResumeStoreState = {
	resume: Resume | null;
	ownerId: string | null;
	editGeneration: number;
	localRecoveryAvailable: boolean;
	acknowledgedUpdatedAt: Date | null;
	recoveryDraft: StoredDraft<ResumeData> | undefined;
	resumeId?: string | undefined;
	isReady: boolean;
	saveStatus: SaveStatus;
	// Undo/redo stacks of `ResumeData` references. Immer's immutable updates share structure, so a
	// step costs only the parts that changed.
	undoStack: ResumeData[];
	redoStack: ResumeData[];
	canUndo: boolean;
	canRedo: boolean;
};

type ResumeStoreActions = {
	initialize: (resume: Resume | null, ownerId: string) => void;
	restoreLocalDraft: () => void;
	discardLocalDraft: () => void;
	resolveConflict: (choice: "save-copy" | "open-saved") => Promise<string | undefined>;
	restoreVersion: (versionId: string) => Promise<Resume>;
	reset: () => void;
	replaceResumeDraft: (resume: Resume) => void;
	replaceResumeFromServer: (resume: Resume, expectedGeneration?: number) => boolean;
	updateResumeData: (fn: (draft: WritableDraft<ResumeData>) => void, options?: UpdateResumeDataOptions) => void;
	patchResume: (fn: (draft: WritableDraft<Resume>) => void) => void;
	mergeResumeMetadata: (resume: Resume) => void;
	setSaveStatus: (status: SaveStatus) => void;
	undo: () => void;
	redo: () => void;
	/** Sends the latest unsaved changes again, e.g. from the "Not saved · Retry" status. */
	retrySave: () => void;
};

type ResumeStore = ResumeStoreState & ResumeStoreActions;

type Runtime = {
	conflictCopy?: ImportReviewInput | undefined;
	abortController: AbortController;
	baseline?: Date;
	conflict: boolean;
	queryClient?: QueryClient;
	hasPendingLocalChanges: boolean;
	isSaving: boolean;
	pendingResume?: Resume | undefined;
	/** The last save failed; don't loop on it. Cleared by the next edit, Retry, reconnecting or success. */
	saveFailed: boolean;
	slowSaveToastId?: string | undefined;
	syncResume: ReturnType<typeof debounce<(resume: Resume) => void>>;
	beforeUnloadHandler?: () => void;
	onlineHandler?: () => void;
	deferredRemoteResume?: Resume | undefined;
	deferredFocusHandler?: (() => void) | undefined;
	/** This visit's saves share one autosave version in History. */
	sessionId: string;
};

type ResumeUpdateSubscriptionOptions = {
	resumeId?: string | undefined;
	onUpdate: (event: ResumeUpdateEvent) => Promise<void> | void;
	onError?: (error: unknown) => void;
};

const SAVE_DEBOUNCE_MS = 500;
const NAVIGATION_SAVE_WAIT_MS = 10_000;
// Edits without a field key coalesce within this window (e.g. dragging); keyed edits to the same field
// coalesce within FIELD_COALESCE_MS (typing a sentence).
const HISTORY_COALESCE_MS = 500;
const FIELD_COALESCE_MS = 1000;
// Bounded stacks. Entries are shared-structure references, so 200 steps stay cheap.
const MAX_HISTORY_ENTRIES = 200;

const runtimes = new Map<string, Runtime>();

// Coalescing bookkeeping. Not reactive — only decides whether the next edit opens a new undo step.
let historyLastEditAt = 0;
let historyLastKey: string | undefined;
let historyCanCoalesce = false;

function resetHistoryRuntime() {
	historyLastEditAt = 0;
	historyLastKey = undefined;
	historyCanCoalesce = false;
}

/** Whether the next edit merges into the current undo step. Exported for tests. */
function shouldCoalesceEdit(
	previous: { at: number; key: string | undefined; canCoalesce: boolean },
	next: { at: number; key: string | undefined; newStep: boolean },
): boolean {
	if (next.newStep || !previous.canCoalesce || previous.key !== next.key) return false;
	const window = next.key === undefined ? HISTORY_COALESCE_MS : FIELD_COALESCE_MS;
	return next.at - previous.at < window;
}

// Unsaved changes survive a reload or a closed tab: they're kept on this device until a save succeeds.
function storeUnsavedResume(resume: Resume) {
	const state = useResumeStore.getState();
	const baseline = runtimes.get(resume.id)?.baseline;
	if (!state.ownerId || state.resumeId !== resume.id || !baseline) return;
	const stored = writeStoredDraft(
		"local",
		registeredStorageKey("resumeBackup", resume.id),
		{ ownerId: state.ownerId, documentId: resume.id, baseRevision: baseline.toISOString() },
		resume.data,
	);
	if (useResumeStore.getState().localRecoveryAvailable !== stored)
		useResumeStore.setState({ localRecoveryAvailable: stored });
}
function clearUnsavedResume(id: string) {
	try {
		browserStorage.local.removeItem(registeredStorageKey("resumeBackup", id));
	} catch {
		/* Live state survives blocked storage. */
	}
}
function readRecoveryDraft(id: string, ownerId: string, baseRevision: string) {
	return readStoredDraft(
		"local",
		registeredStorageKey("resumeBackup", id),
		{ ownerId, documentId: id, baseRevision },
		(value) => {
			const parsed = resumeDataSchema.safeParse(value);
			return parsed.success ? parsed.data : undefined;
		},
	);
}
/** Applies the exact font preview only while its originating draft remains editable. */
export function replaceResumeFonts(before: ResumeData, after: ResumeData): boolean {
	const current = useResumeStore.getState();
	if (
		!current.resume ||
		current.resume.isLocked ||
		current.recoveryDraft ||
		current.saveStatus === "conflict" ||
		current.resume.data !== before ||
		isEqual(before.metadata.typography, after.metadata.typography)
	)
		return false;
	current.updateResumeData(
		(draft) => {
			draft.metadata.typography = after.metadata.typography;
		},
		{ newStep: true },
	);
	return true;
}

export function readUnsavedResumeData(id: string): ResumeData | undefined {
	const state = useResumeStore.getState();
	if (!state.ownerId) return;
	return readRecoveryDraft(id, state.ownerId, state.acknowledgedUpdatedAt?.toISOString() ?? "")?.value;
}

function isBrowserOffline() {
	return typeof navigator !== "undefined" && navigator.onLine === false;
}

let lockedToastId: string | undefined;

function getResumeQueryKey(id: string): QueryKey {
	return orpc.resume.getById.queryOptions({ input: { id } }).queryKey as QueryKey;
}

export function isEditableElementFocused(): boolean {
	const element = document.activeElement as HTMLElement | null;
	if (!element) return false;
	return (
		element.tagName === "INPUT" ||
		element.tagName === "TEXTAREA" ||
		element.tagName === "SELECT" ||
		element.isContentEditable ||
		element.closest(".cm-editor") !== null
	);
}

function externalUpdateMessage(mutation: ResumeUpdateMutation): string {
	if (mutation === "patch") return t`This resume was updated by an AI agent.`;
	if (mutation === "lock" || mutation === "password") return t`This resume's sharing settings changed elsewhere.`;
	return t`Synced changes made in another tab.`;
}

function notifyExternalUpdate(mutation: ResumeUpdateMutation) {
	toast.add({ type: "info", description: externalUpdateMessage(mutation), id: "resume-external-update" });
}

// #54: applies a remote update that was deferred because the user was typing.
function applyDeferredRemoteResume(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime?.deferredRemoteResume) return;

	const resume = runtime.deferredRemoteResume;
	runtime.deferredRemoteResume = undefined;
	if (runtime.deferredFocusHandler) {
		document.removeEventListener("focusout", runtime.deferredFocusHandler, true);
		runtime.deferredFocusHandler = undefined;
	}

	// The user may have started editing again while the update was deferred; local edits win.
	if (runtime.hasPendingLocalChanges) return;

	if (useResumeStore.getState().replaceResumeFromServer(resume)) notifyExternalUpdate("update");
}

// #54: don't overwrite a focused field mid-keystroke; stash the remote resume and apply it on blur.
function deferRemoteResumeUntilBlur(id: string, resume: Resume) {
	const runtime = getRuntime(id);
	if (runtime.deferredRemoteResume && runtime.deferredRemoteResume.updatedAt > resume.updatedAt) return;
	runtime.deferredRemoteResume = resume;

	if (runtime.deferredFocusHandler) return;

	const handler = () => {
		// Let focus settle (e.g. tabbing between fields) before deciding editing has ended.
		window.setTimeout(() => {
			if (runtimes.get(id) !== runtime || runtime.abortController.signal.aborted) return;
			if (isEditableElementFocused()) return;
			applyDeferredRemoteResume(id);
		}, 0);
	};

	runtime.deferredFocusHandler = handler;
	document.addEventListener("focusout", handler, true);
}

function setRuntimeBaseline(resume: Resume) {
	const runtime = getRuntime(resume.id);
	runtime.hasPendingLocalChanges = false;
	runtime.pendingResume = undefined;
	runtime.baseline = resume.updatedAt;
	runtime.conflict = false;
}

async function flushResumeSave(id: string) {
	const runtime = runtimes.get(id);
	if (!runtime || runtime.conflict || runtime.isSaving || !runtime.pendingResume || !runtime.baseline) return;

	const submitted = runtime.pendingResume;
	const submittedData = structuredClone(submitted.data);
	runtime.pendingResume = undefined;
	runtime.isSaving = true;

	try {
		const updated = (await orpc.resume.update.call(
			{ id: submitted.id, data: submittedData, sessionId: runtime.sessionId, expectedUpdatedAt: runtime.baseline },
			{ signal: runtime.abortController.signal },
		)) as Resume;

		if (runtime.abortController.signal.aborted) return;
		runtime.baseline = updated.updatedAt;
		if (useResumeStore.getState().resumeId === id)
			useResumeStore.setState({ acknowledgedUpdatedAt: updated.updatedAt });
		runtime.queryClient?.setQueryData(getResumeQueryKey(submitted.id), updated);

		const currentResume = useResumeStore.getState().resume;
		const currentDataStillMatchesSubmission =
			currentResume?.id === submitted.id && isEqual(currentResume.data, submittedData);

		if (currentDataStillMatchesSubmission && !runtime.pendingResume) {
			runtime.hasPendingLocalChanges = false;
			// The local data still equals what we just saved, so the client already holds the canonical
			// data — only server-owned metadata (updatedAt, etc.) can differ. Merge just that instead of
			// replacing the whole resume: a full replace swaps every nested reference (the server strips
			// `undefined`s, so an equality check on its echo can't even confirm they match), which fires
			// every `data` selector and remounts the entire builder tree on each save-after-typing.
			useResumeStore.getState().mergeResumeMetadata(updated);
			useResumeStore.getState().setSaveStatus("saved");
		} else {
			runtime.hasPendingLocalChanges = true;
			storeUnsavedResume(currentResume ?? submitted);
			useResumeStore.getState().setSaveStatus("saving");
			useResumeStore.getState().mergeResumeMetadata(updated);

			if (!runtime.pendingResume && currentResume?.id === submitted.id && !isEqual(currentResume.data, submittedData)) {
				runtime.syncResume.cancel();
				runtime.pendingResume = structuredClone(currentResume);
			}
		}

		runtime.saveFailed = false;
		if (!runtime.pendingResume && !runtime.hasPendingLocalChanges) clearUnsavedResume(submitted.id);
	} catch (error: unknown) {
		if (runtime.abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
			return;

		runtime.pendingResume ??= submitted;
		runtime.hasPendingLocalChanges = true;
		runtime.saveFailed = true;
		storeUnsavedResume(useResumeStore.getState().resume ?? submitted);
		// The editor bar shows the state ("Offline · saved on this device" or "Not saved · Retry").
		runtime.conflict = error instanceof ORPCError && (error.code === "RESUME_VERSION_CONFLICT" || error.status === 409);
		useResumeStore.getState().setSaveStatus(runtime.conflict ? "conflict" : isBrowserOffline() ? "offline" : "error");
	} finally {
		if (runtime.slowSaveToastId !== undefined) {
			toast.close(runtime.slowSaveToastId);
			runtime.slowSaveToastId = undefined;
		}
		runtime.isSaving = false;
		if (!runtime.abortController.signal.aborted && runtime.pendingResume && !runtime.saveFailed)
			void flushResumeSave(id);
	}
}

function queueResumeSave(resume: Resume) {
	const runtime = getRuntime(resume.id);
	if (runtime.conflict) return;
	runtime.pendingResume = structuredClone(resume);
	runtime.hasPendingLocalChanges = true;
	runtime.saveFailed = false;
	void flushResumeSave(resume.id);
}

function createRuntime(): Runtime {
	const abortController = new AbortController();

	const syncResume = debounce(
		(resume: Resume) => {
			queueResumeSave(resume);
		},
		SAVE_DEBOUNCE_MS,
		{ signal: abortController.signal },
	);

	const runtime: Runtime = {
		abortController,
		conflict: false,
		hasPendingLocalChanges: false,
		isSaving: false,
		saveFailed: false,
		syncResume,
		sessionId: generateId(),
	};

	runtime.beforeUnloadHandler = () => runtime.syncResume.flush();
	window.addEventListener("beforeunload", runtime.beforeUnloadHandler);
	// Changes made offline are sent as soon as the connection comes back.
	runtime.onlineHandler = () => {
		const current = useResumeStore.getState().resume;
		if (runtime.conflict || !runtime.hasPendingLocalChanges || !current) return;
		queueResumeSave(current);
	};
	window.addEventListener("online", runtime.onlineHandler);

	return runtime;
}

function getRuntime(id: string): Runtime {
	const existing = runtimes.get(id);
	if (existing) return existing;

	const runtime = createRuntime();
	runtimes.set(id, runtime);
	return runtime;
}

function bindRuntimeQueryClient(id: string, queryClient: QueryClient) {
	getRuntime(id).queryClient = queryClient;
}

function hasPendingLocalChanges(id: string): boolean {
	return getRuntime(id).hasPendingLocalChanges;
}

function cleanupRuntime(id: string, disposition: "flush" | "discard" = "flush") {
	const runtime = runtimes.get(id);
	if (!runtime) return;

	if (disposition === "flush") runtime.syncResume.flush();
	runtime.abortController.abort();

	if (runtime.beforeUnloadHandler) {
		window.removeEventListener("beforeunload", runtime.beforeUnloadHandler);
	}

	if (runtime.onlineHandler) {
		window.removeEventListener("online", runtime.onlineHandler);
	}

	if (runtime.deferredFocusHandler) {
		document.removeEventListener("focusout", runtime.deferredFocusHandler, true);
	}

	runtimes.delete(id);
}

function syncCurrentResume(id: string) {
	const resume = useResumeStore.getState().resume;
	if (!resume || resume.id !== id) return;

	storeUnsavedResume(resume);
	if (!getRuntime(id).conflict) getRuntime(id).syncResume(resume);
}

export const useResumeStore = create<ResumeStore>()(
	immer((set, get) => ({
		resume: null,
		ownerId: null,
		editGeneration: 0,
		localRecoveryAvailable: false,
		acknowledgedUpdatedAt: null,
		recoveryDraft: undefined,
		resumeId: undefined,
		isReady: false,
		saveStatus: "idle",
		undoStack: [],
		redoStack: [],
		canUndo: false,
		canRedo: false,

		initialize: (resume, ownerId) => {
			for (const id of runtimes.keys()) cleanupRuntime(id, "discard");
			resetHistoryRuntime();
			if (resume) setRuntimeBaseline(resume);
			let recoveryDraft = resume ? readRecoveryDraft(resume.id, ownerId, resume.updatedAt.toISOString()) : undefined;
			if (resume && recoveryDraft && isEqual(recoveryDraft.value, resume.data)) {
				clearUnsavedResume(resume.id);
				recoveryDraft = undefined;
			}
			set((state) => {
				state.resume = resume;
				state.editGeneration += 1;
				state.resumeId = resume?.id;
				state.ownerId = ownerId;
				state.acknowledgedUpdatedAt = resume?.updatedAt ?? null;
				state.recoveryDraft = recoveryDraft;
				state.isReady = resume !== null;
				state.saveStatus = "idle";
				state.undoStack = [];
				state.redoStack = [];
				state.canUndo = false;
				state.canRedo = false;
			});
		},
		restoreLocalDraft: () => {
			const { resume, recoveryDraft } = get();
			if (!resume || !recoveryDraft) return;
			const stale = recoveryDraft.baseRevision !== get().acknowledgedUpdatedAt?.toISOString();
			get().replaceResumeDraft({ ...resume, data: recoveryDraft.value });
			const runtime = getRuntime(resume.id);
			runtime.hasPendingLocalChanges = true;
			runtime.conflict = stale;
			if (stale) runtime.baseline = new Date(recoveryDraft.baseRevision);
			set((state) => {
				state.recoveryDraft = undefined;
				state.localRecoveryAvailable = false;
				state.saveStatus = stale ? "conflict" : "saving";
			});
			const recovered = get().resume;
			if (!stale && recovered) queueResumeSave(recovered);
		},
		discardLocalDraft: () => {
			const { resume } = get();
			if (resume) clearUnsavedResume(resume.id);
			set((state) => {
				state.recoveryDraft = undefined;
				state.localRecoveryAvailable = false;
			});
		},
		restoreVersion: async (versionId) => {
			const { resume, ownerId } = get();
			if (!resume || get().recoveryDraft || !(await savePendingChanges(resume.id)))
				throw new Error(t`Couldn't save your changes. Try again before continuing.`);
			if (get().ownerId !== ownerId || get().resumeId !== resume.id)
				throw new Error(t`The document changed. Try again.`);
			const runtime = getRuntime(resume.id);
			const generation = get().editGeneration;
			const signal = runtime.abortController.signal;
			const restored = (await orpc.resume.restoreVersion.call(
				{ resumeId: resume.id, versionId, expectedUpdatedAt: get().acknowledgedUpdatedAt ?? resume.updatedAt },
				{ signal },
			)) as Resume;
			signal.throwIfAborted();
			if (
				runtimes.get(resume.id) !== runtime ||
				get().ownerId !== ownerId ||
				!get().replaceResumeFromServer(restored, generation)
			)
				throw new Error(t`The document changed. Try again.`);
			return restored;
		},
		resolveConflict: async (choice) => {
			const { resume, ownerId } = get();
			if (!resume || !ownerId) return;
			const runtime = getRuntime(resume.id);
			if (!runtime.conflict) return;
			const local = structuredClone(resume.data);
			const signal = runtime.abortController.signal;
			if (choice === "save-copy" && (!runtime.conflictCopy || !isEqual(runtime.conflictCopy.data, local))) {
				const master = await orpc.career.master.read.call({}, { signal });
				signal.throwIfAborted();
				runtime.conflictCopy = {
					flowId: crypto.randomUUID(),
					name: resume.name,
					data: local,
					expectedProfileRevision: master.profileRevision,
					acceptedFacts: [],
				};
			}
			let result: string | Resume;
			try {
				result =
					choice === "save-copy"
						? (await orpc.resume.confirmImport.call(runtime.conflictCopy as ImportReviewInput, { signal })).resumeId
						: ((await orpc.resume.getById.call({ id: resume.id }, { signal })) as Resume);
			} catch (error) {
				// This code guarantees rollback. Unknown outcomes retain their identical retry payload.
				if (error instanceof ORPCError && error.code === "IMPORT_REVIEW_CONFLICT") runtime.conflictCopy = undefined;
				throw error;
			}

			if (
				signal.aborted ||
				get().ownerId !== ownerId ||
				get().resumeId !== resume.id ||
				!isEqual(get().resume?.data, local)
			)
				return;
			if (choice === "open-saved") {
				get().replaceResumeFromServer(result as Resume);
				get().setSaveStatus("saved");
			} else {
				runtime.hasPendingLocalChanges = false;
				runtime.pendingResume = undefined;
			}
			clearUnsavedResume(resume.id);
			return choice === "save-copy" ? (result as string) : undefined;
		},

		reset: () => {
			for (const id of runtimes.keys()) cleanupRuntime(id, "discard");
			resetHistoryRuntime();

			set((state) => {
				state.resume = null;
				state.editGeneration += 1;
				state.ownerId = null;
				state.recoveryDraft = undefined;
				state.localRecoveryAvailable = false;
				state.acknowledgedUpdatedAt = null;
				state.saveStatus = "idle";
				state.resumeId = undefined;
				state.isReady = false;
				state.undoStack = [];
				state.redoStack = [];
				state.canUndo = false;
				state.canRedo = false;
			});
		},

		replaceResumeDraft: (resume) => {
			resetHistoryRuntime();

			set((state) => {
				state.resume = resume;
				state.editGeneration += 1;
				state.resumeId = resume.id;
				state.isReady = true;
				state.undoStack = [];
				state.redoStack = [];
				state.canUndo = false;
				state.canRedo = false;
			});
		},

		replaceResumeFromServer: (resume, expectedGeneration) => {
			const currentState = get();
			if (currentState.resumeId !== resume.id || currentState.recoveryDraft) return false;
			if (currentState.acknowledgedUpdatedAt && resume.updatedAt < currentState.acknowledgedUpdatedAt) return false;
			if (expectedGeneration !== undefined && currentState.editGeneration !== expectedGeneration) {
				const runtime = getRuntime(resume.id);
				runtime.conflict = true;
				runtime.syncResume.cancel();
				if (currentState.resume) storeUnsavedResume(currentState.resume);
				set((state) => {
					state.saveStatus = "conflict";
				});
				return false;
			}
			setRuntimeBaseline(resume);

			// This runs both for the echo of our own autosave (identical data → keep history) and for
			// external/cross-tab/AI rebases (different data → local undo history no longer applies).
			const current = get().resume;
			const isRebase = !current || !isEqual(current.data, resume.data);
			if (isRebase) resetHistoryRuntime();

			set((state) => {
				state.resume = resume;
				if (isRebase) state.editGeneration += 1;
				state.acknowledgedUpdatedAt = resume.updatedAt;
				state.resumeId = resume.id;
				state.isReady = true;

				if (isRebase) {
					state.undoStack = [];
					state.redoStack = [];
					state.canUndo = false;
					state.canRedo = false;
				}
			});
			return true;
		},

		patchResume: (fn) => {
			set((state) => {
				if (!state.resume) return;
				fn(state.resume as WritableDraft<Resume>);
			});
		},

		setSaveStatus: (status) => {
			set((state) => {
				state.saveStatus = status;
			});
		},

		mergeResumeMetadata: (resume) => {
			set((state) => {
				if (!state.resume || state.resume.id !== resume.id) return;
				if (resume.updatedAt < state.resume.updatedAt) return;

				state.resume.name = resume.name;
				state.resume.slug = resume.slug;
				state.resume.tags = resume.tags;
				state.resume.isLocked = resume.isLocked;
				state.resume.updatedAt = resume.updatedAt;
				state.resume.hasPassword = resume.hasPassword;
				state.resume.isPublic = resume.isPublic;
				state.resume.showDownloadButtons = resume.showDownloadButtons;
			});
		},

		updateResumeData: (fn, options = {}) => {
			const currentResume = get().resume;
			if (!currentResume || get().recoveryDraft) return;

			if (currentResume.isLocked) {
				lockedToastId = toast.add({
					type: "error",
					description: t`This resume is locked and cannot be updated.`,
					id: lockedToastId,
				});
				return;
			}

			// Coalesce bursts: only the first edit of a burst opens a new undo step, holding the pre-edit
			// state. Later edits to the same field fold into it (see shouldCoalesceEdit).
			const now = Date.now();
			const newStep = options.newStep ?? false;
			const coalesce =
				options.sameStep && options.coalesceKey !== undefined && historyLastKey === options.coalesceKey
					? true
					: shouldCoalesceEdit(
							{ at: historyLastEditAt, key: historyLastKey, canCoalesce: historyCanCoalesce },
							{ at: now, key: options.coalesceKey, newStep },
						);
			const snapshotBefore = coalesce ? undefined : currentResume.data;
			historyLastEditAt = now;
			historyLastKey = options.coalesceKey;
			historyCanCoalesce = !newStep;

			set((state) => {
				if (!state.resume) return;

				if (snapshotBefore) {
					state.undoStack.push(snapshotBefore);
					if (state.undoStack.length > MAX_HISTORY_ENTRIES) state.undoStack.shift();
					// A fresh edit invalidates the redo branch.
					state.redoStack = [];
				}

				fn(state.resume.data as WritableDraft<ResumeData>);
				state.editGeneration += 1;
				// The server writes the date text from the dates on save; doing the same here keeps its echo
				// identical to the draft, so an autosave never reads as an outside change.
				syncResumeDates(state.resume.data as ResumeData);
				state.saveStatus = getRuntime(currentResume.id).conflict ? "conflict" : "saving";
				state.canUndo = state.undoStack.length > 0;
				state.canRedo = state.redoStack.length > 0;
			});

			getRuntime(currentResume.id).hasPendingLocalChanges = true;
			syncCurrentResume(currentResume.id);
		},

		undo: () => {
			applyHistoryStep(get, set, "undo");
		},

		redo: () => {
			applyHistoryStep(get, set, "redo");
		},

		retrySave: () => {
			const current = get().resume;
			if (!current || getRuntime(current.id).conflict) return;
			set((state) => {
				state.saveStatus = "saving";
			});
			queueResumeSave(current);
		},
	})),
);

type ImmerSet = (fn: (state: WritableDraft<ResumeStore>) => void) => void;
type StoreGet = () => ResumeStore;

// Shared undo/redo: move the current data to the opposite stack and install the popped snapshot,
// then route the change through the normal autosave path so the preview and sync react as usual.
function applyHistoryStep(get: StoreGet, set: ImmerSet, direction: "undo" | "redo") {
	const state = get();
	const currentResume = state.resume;
	if (!currentResume || state.recoveryDraft) return;

	if (currentResume.isLocked) {
		lockedToastId = toast.add({
			type: "error",
			description: t`This resume is locked and cannot be updated.`,
			id: lockedToastId,
		});
		return;
	}

	const source = direction === "undo" ? state.undoStack : state.redoStack;
	if (source.length === 0) return;

	// The next edit after an undo/redo must start a brand-new undo step.
	resetHistoryRuntime();
	const current = currentResume.data;

	set((draft) => {
		if (!draft.resume) return;

		const from = direction === "undo" ? draft.undoStack : draft.redoStack;
		const to = direction === "undo" ? draft.redoStack : draft.undoStack;

		const snapshot = from.pop();
		if (snapshot === undefined) return;

		to.push(current as WritableDraft<ResumeData>);
		if (to.length > MAX_HISTORY_ENTRIES) to.shift();

		draft.resume.data = snapshot;
		draft.editGeneration += 1;
		draft.saveStatus = getRuntime(currentResume.id).conflict ? "conflict" : "saving";
		draft.canUndo = draft.undoStack.length > 0;
		draft.canRedo = draft.redoStack.length > 0;
	});

	getRuntime(currentResume.id).hasPendingLocalChanges = true;
	syncCurrentResume(currentResume.id);
}

// Mobile builder keeps the live preview mounted across tabs (to preserve zoom/pan), but pauses its PDF
// re-render while the Edit/Design overlay covers it — otherwise every keystroke re-renders a hidden PDF.
// Desktop never pauses. Lives here because it's the SSR-safe module both the shell and preview import.
type PreviewPausedStore = {
	paused: boolean;
	setPaused: (paused: boolean) => void;
};

export const usePreviewPausedStore = create<PreviewPausedStore>()((set) => ({
	paused: false,
	setPaused: (paused) => set({ paused }),
}));

export function usePatchResume() {
	return useResumeStore((state) => state.patchResume);
}

function useBuilderResumeSelector<T>(selector: (resume: Resume) => T): T | undefined {
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;

	return useResumeStore((state) => {
		if (!resumeId || !state.resume || state.resume.id !== resumeId) return undefined;
		return selector(state.resume);
	});
}

export function useCurrentBuilderResumeSelector<T>(selector: (resume: Resume) => T): T {
	const selected = useBuilderResumeSelector(selector);
	if (selected === undefined) throw new Error("Resume data is required before rendering this component.");
	return selected;
}

function useResume(): Resume | undefined {
	return useBuilderResumeSelector((resume) => resume);
}

export function useCurrentResume(): Resume {
	const resume = useResume();
	if (!resume) throw new Error("Resume data is required before rendering this component.");
	return resume;
}

export function useResumeData(): ResumeData | undefined {
	return useBuilderResumeSelector((resume) => resume.data);
}

export function useIsResumeLocked(): boolean {
	return useBuilderResumeSelector((resume) => resume.isLocked) ?? false;
}

export function useUpdateResumeData() {
	const queryClient = useQueryClient();
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;
	const updateResumeData = useResumeStore((state) => state.updateResumeData);

	return useCallback(
		(fn: (draft: WritableDraft<ResumeData>) => void, options?: UpdateResumeDataOptions) => {
			if (!resumeId) return;
			bindRuntimeQueryClient(resumeId, queryClient);
			updateResumeData(fn, options);
		},
		[queryClient, resumeId, updateResumeData],
	);
}

export function useResumeUpdateSubscription({ resumeId, onUpdate, onError }: ResumeUpdateSubscriptionOptions) {
	const [retryNonce, setRetryNonce] = useState(0);

	// oxlint-disable-next-line react/exhaustive-deps -- retryNonce isn't read; bumping it resubscribes after a dropped stream
	useEffect(() => {
		if (!resumeId) return;

		let didCancel = false;
		let retryTimer: number | undefined;
		const cancel = consumeEventIterator(streamClient.resume.updates.subscribe({ id: resumeId }), {
			onEvent: async (event) => {
				const update = (event ?? { mutation: "sync" }) as ResumeUpdateEvent;
				try {
					await onUpdate(update);
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") return;
					onError?.(error);
				}
			},
			onError: (error) => {
				if (didCancel) return;
				// A signed-out session stays signed out; retrying would only repeat the 401.
				if (error instanceof ORPCError && error.code === "UNAUTHORIZED") return;
				onError?.(error);
				retryTimer = window.setTimeout(() => setRetryNonce((value) => value + 1), 2500);
			},
		});

		return () => {
			didCancel = true;
			if (retryTimer) window.clearTimeout(retryTimer);
			void cancel().catch(() => {});
		};
	}, [onError, onUpdate, resumeId, retryNonce]);
}

export function useBuilderResumeUpdateSubscription() {
	const queryClient = useQueryClient();
	const replaceResumeFromServer = useResumeStore((state) => state.replaceResumeFromServer);
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;

	const onUpdate = useCallback(
		async (event: ResumeUpdateEvent) => {
			if (!resumeId) return;

			bindRuntimeQueryClient(resumeId, queryClient);
			const runtime = getRuntime(resumeId);
			const signal = runtime.abortController.signal;
			const resume = (await orpc.resume.getById.call({ id: resumeId }, { signal })) as Resume;
			if (signal.aborted || runtimes.get(resumeId) !== runtime || useResumeStore.getState().resumeId !== resumeId)
				return;
			const acknowledged = useResumeStore.getState().acknowledgedUpdatedAt;
			if (acknowledged && resume.updatedAt < acknowledged) return;

			queryClient.setQueryData(getResumeQueryKey(resumeId), resume);

			if (hasPendingLocalChanges(resumeId)) {
				useResumeStore.getState().mergeResumeMetadata(resume);
				return;
			}

			const current = useResumeStore.getState().resume;
			const isExternalChange =
				event.mutation !== "sync" && current?.id === resume.id && !isEqual(current.data, resume.data);

			if (!isExternalChange) {
				replaceResumeFromServer(resume);
				return;
			}

			// #54: never overwrite a field the user is editing; defer the swap until blur.
			if (isEditableElementFocused()) {
				useResumeStore.getState().mergeResumeMetadata(resume);
				deferRemoteResumeUntilBlur(resumeId, resume);
				return;
			}

			// #53: attribute cross-tab / AI-agent edits instead of silently swapping the document.
			if (replaceResumeFromServer(resume)) notifyExternalUpdate(event.mutation);
		},
		[queryClient, replaceResumeFromServer, resumeId],
	);

	const onError = useCallback((error: unknown) => {
		console.warn("Resume update stream failed, reconnecting:", error);
	}, []);

	useResumeUpdateSubscription({ resumeId, onUpdate, onError });
}

/**
 * Saves pending edits now and resolves once they're on the server (false if saving fails). Route transitions
 * await it before leaving, and History before naming or restoring a version, so the server has what's on
 * screen. Unmount cleanup and browser unload can't await it.
 */
export function savePendingChanges(id: string): boolean | Promise<boolean> {
	const runtime = runtimes.get(id);
	const current = useResumeStore.getState().resume;
	if (!runtime?.hasPendingLocalChanges || current?.id !== id) return true;
	if (runtime.conflict) return false;

	runtime.syncResume.cancel();
	runtime.pendingResume = structuredClone(current);
	useResumeStore.getState().setSaveStatus("saving");

	return new Promise<boolean>((resolve) => {
		const finish = (saved: boolean) => {
			clearTimeout(timeout);
			unsubscribe();
			if (!saved && isBrowserOffline()) {
				toast.add({
					type: "info",
					description: t`You're offline. Reconnect to save your changes before leaving.`,
					id: "resume-offline-navigation",
				});
			}
			resolve(saved);
		};
		const unsubscribe = useResumeStore.subscribe((state) => {
			if (
				state.resume?.id !== id ||
				state.saveStatus === "error" ||
				state.saveStatus === "offline" ||
				state.saveStatus === "conflict"
			) {
				finish(false);
			} else if (state.saveStatus === "saved" && !runtime.hasPendingLocalChanges) {
				finish(true);
			}
		});
		const timeout = setTimeout(() => {
			finish(false);
			// Keep the write in flight: it may already have reached the server.
			runtime.slowSaveToastId = toast.add({
				type: "info",
				description: t`Saving is taking longer than expected. Your changes are still open.`,
				id: runtime.slowSaveToastId,
				timeout: 0,
			});
		}, NAVIGATION_SAVE_WAIT_MS);
		void flushResumeSave(id);
	});
}

export function useResumeCleanup() {
	const params = useParams({ strict: false }) as { resumeId?: string };
	const resumeId = params.resumeId;
	const reset = useResumeStore((state) => state.reset);

	useBlocker({
		shouldBlockFn: async ({ next }) => {
			if (!resumeId || ("resumeId" in next.params && next.params.resumeId === resumeId)) return false;
			return !(await savePendingChanges(resumeId));
		},
		enableBeforeUnload: () => !!resumeId && (runtimes.get(resumeId)?.hasPendingLocalChanges ?? false),
	});

	useEffect(() => {
		if (!resumeId) return;

		return () => {
			cleanupRuntime(resumeId);
			reset();
		};
	}, [resumeId, reset]);
}

onPersonalStorageCleared(() => {
	for (const id of runtimes.keys()) cleanupRuntime(id, "discard");
	useResumeStore.getState().reset();
});
