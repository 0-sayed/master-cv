import type { Application } from "../types";
import type { DraftIdentity } from "@/libs/stored-draft";
import { t } from "@lingui/core/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@reactive-resume/ui/components/toast";
import { useInvalidateApplications } from "../use-application-actions";
import { useApplicationReadOnly } from "./application-write-boundary";
import { NoteComposer } from "./detail/note-composer";
import { useCurrentSession } from "@/hooks/use-current-session";
import { personalStorageGeneration, storageKey } from "@/libs/browser-storage";
import { orpc } from "@/libs/orpc/client";
import { readStoredDraft, removeStoredDraft, writeStoredDraft } from "@/libs/stored-draft";

/** The retained workspace uses the same composer and legacy storage contract. */
export function ApplicationNotes({ application }: { application: Application }) {
	const legacy = useApplicationNotes(application);
	const [mode, setMode] = useState<"new" | "legacy">("legacy");
	return <NoteComposer application={application} legacy={legacy} mode={mode} onModeChange={setMode} />;
}

type ApplicationNotesProps = { application: Pick<Application, "id" | "notes" | "updatedAt"> };
type NotesState = {
	status: "acknowledged" | "dirty" | "saving" | "failed" | "conflict";
	identity: DraftIdentity;
	value: string;
};
const parseNotes = (value: unknown) => (typeof value === "string" && value.length <= 5000 ? value : undefined);
const revisionOf = (application: ApplicationNotesProps["application"]) => new Date(application.updatedAt).toISOString();

export function useApplicationNotes(application: ApplicationNotesProps["application"]) {
	const session = useCurrentSession();
	const readOnly = useApplicationReadOnly();
	const readOnlyRef = useRef(readOnly);
	useLayoutEffect(() => {
		readOnlyRef.current = readOnly;
	}, [readOnly]);
	const ownerId = session?.user.id ?? "";
	const key = storageKey("notesDraft", `${ownerId}:${application.id}`);
	const identity = { ownerId, documentId: application.id, baseRevision: revisionOf(application) };
	const [state, setState] = useState<NotesState>(() => {
		const stored = readStoredDraft("local", key, identity, parseNotes);
		return stored
			? {
					status: stored.baseRevision === identity.baseRevision ? "dirty" : "conflict",
					identity: stored,
					value: stored.value,
				}
			: { status: "acknowledged", identity, value: application.notes ?? "" };
	});
	const current = useRef(state);
	const invalidate = useInvalidateApplications();
	const invalidateRef = useRef(invalidate);
	useLayoutEffect(() => {
		current.current = state;
		invalidateRef.current = invalidate;
	}, [state, invalidate]);
	const queryClient = useQueryClient();
	const generation = useRef(personalStorageGeneration());
	const { mutateAsync } = useMutation({ ...orpc.applications.update.mutationOptions(), meta: { noInvalidate: true } });
	const publish = useCallback(
		(next: NotesState, expected?: NotesState) => {
			current.current = next;
			setState(next);
			if (expected) {
				const stored = readStoredDraft("local", key, expected.identity, parseNotes);
				// A departed view's response must not overwrite or erase a newer view's durable draft.
				if (!stored || stored.baseRevision !== expected.identity.baseRevision || stored.value !== expected.value)
					return;
			}
			if (next.status === "acknowledged") removeStoredDraft("local", key);
			else writeStoredDraft("local", key, next.identity, next.value);
		},
		[key],
	);
	useEffect(() => {
		const previous = current.current;
		if (previous.identity.ownerId !== ownerId || previous.identity.documentId !== application.id) {
			publish({
				status: "acknowledged",
				identity: { ownerId, documentId: application.id, baseRevision: revisionOf(application) },
				value: application.notes ?? "",
			});
		} else if (previous.identity.baseRevision !== revisionOf(application) && previous.status !== "saving") {
			if (previous.status === "acknowledged")
				publish(
					{
						status: "acknowledged",
						identity: { ...previous.identity, baseRevision: revisionOf(application) },
						value: application.notes ?? "",
					},
					previous,
				);
			else publish({ ...previous, status: "conflict" }, previous);
		}
	}, [application, ownerId, publish]);
	const save = useCallback(async () => {
		if (readOnlyRef.current || generation.current !== personalStorageGeneration()) return;
		const sent = current.current;
		if (sent.status !== "dirty" && sent.status !== "failed") return;
		publish({ ...sent, status: "saving" }, sent);
		try {
			const response = await mutateAsync({
				id: sent.identity.documentId,
				notes: sent.value.trim() ? sent.value : null,
				expectedNotesRevision: sent.identity.baseRevision,
				expectedUpdatedAt: sent.identity.baseRevision,
			});
			if (generation.current !== personalStorageGeneration()) return;
			const latest = current.current;
			if (latest.identity.ownerId !== sent.identity.ownerId || latest.identity.documentId !== sent.identity.documentId)
				return;
			const nextIdentity = { ...sent.identity, baseRevision: revisionOf(response) };
			publish(
				latest.value === sent.value
					? { status: "acknowledged", identity: nextIdentity, value: response.notes ?? "" }
					: { ...latest, status: "dirty", identity: nextIdentity },
				latest,
			);
			queryClient.setQueryData<Application>(
				orpc.applications.getById.queryKey({ input: { id: application.id } }),
				(cached) => (!cached || revisionOf(cached) <= revisionOf(response) ? response : cached),
			);
			invalidateRef.current(application.id);
		} catch (error) {
			if (generation.current !== personalStorageGeneration()) return;
			if (
				current.current.identity.ownerId !== sent.identity.ownerId ||
				current.current.identity.documentId !== sent.identity.documentId
			)
				return;
			publish(
				{
					...current.current,
					status:
						error && typeof error === "object" && "code" in error && error.code === "CONFLICT" ? "conflict" : "failed",
				},
				current.current,
			);
			toast.add({ type: "error", description: t`Couldn't save the notes.` });
			invalidateRef.current(application.id);
		}
	}, [application.id, mutateAsync, publish, queryClient]);
	useEffect(() => {
		if (state.status !== "dirty") return;
		const timeout = setTimeout(() => {
			void save();
		}, 800);
		return () => clearTimeout(timeout);
	}, [state, save]);
	useEffect(
		() => () => {
			void save();
		},
		[save],
	);
	return {
		value: state.value,
		status: state.status,
		setValue: (value: string) => {
			if (value.length > 5000) return;
			publish({
				...current.current,
				value,
				status:
					current.current.status === "conflict" ? "conflict" : current.current.status === "saving" ? "saving" : "dirty",
			});
		},
		save,
		discardDraft: () => publish({ status: "acknowledged", identity, value: application.notes ?? "" }),
		keepMyChanges: () => publish({ ...current.current, status: "dirty", identity }),
	};
}
