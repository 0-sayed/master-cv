import type { Application } from "../types";
import type { DraftIdentity } from "@/libs/stored-draft";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { toast } from "@reactive-resume/ui/components/toast";
import { useInvalidateApplications } from "../use-application-actions";
import { useCurrentSession } from "@/hooks/use-current-session";
import { personalStorageGeneration, storageKey } from "@/libs/browser-storage";
import { orpc } from "@/libs/orpc/client";
import { readStoredDraft, removeStoredDraft, writeStoredDraft } from "@/libs/stored-draft";

type ApplicationNotesProps = { application: Pick<Application, "id" | "notes" | "updatedAt"> };
type NotesState = {
	status: "acknowledged" | "dirty" | "saving" | "failed" | "conflict";
	identity: DraftIdentity;
	value: string;
};
const parseNotes = (value: unknown) => (typeof value === "string" && value.length <= 5000 ? value : undefined);
const revisionOf = (application: ApplicationNotesProps["application"]) => new Date(application.updatedAt).toISOString();

export function ApplicationNotes({ application }: ApplicationNotesProps) {
	const id = useId();
	const session = useCurrentSession();
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
		if (generation.current !== personalStorageGeneration()) return;
		const sent = current.current;
		if (sent.status !== "dirty" && sent.status !== "failed") return;
		publish({ ...sent, status: "saving" }, sent);
		try {
			const response = await mutateAsync({
				id: sent.identity.documentId,
				notes: sent.value.trim() ? sent.value : null,
				expectedNotesRevision: sent.identity.baseRevision,
			});
			if (generation.current !== personalStorageGeneration()) return;
			const latest = current.current;
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
	return (
		<section className="grid gap-2">
			<label htmlFor={id} className="text-xs font-semibold text-ink-3 uppercase">
				<Trans>Notes</Trans>
			</label>
			<Textarea
				id={id}
				rows={3}
				maxLength={5000}
				value={state.value}
				placeholder={t`Anything to remember about this job`}
				onChange={(event) =>
					publish({
						...current.current,
						status:
							current.current.status === "conflict"
								? "conflict"
								: current.current.status === "saving"
									? "saving"
									: "dirty",
						value: event.target.value,
					})
				}
			/>
			{state.status === "failed" && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						void save();
					}}
				>
					<Trans>Retry save</Trans>
				</Button>
			)}
			{state.status === "conflict" && (
				<div role="alert" className="grid gap-2">
					<p className="type-body">
						<Trans>The notes changed. Reload before saving your draft.</Trans>
					</p>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => publish({ status: "acknowledged", identity, value: application.notes ?? "" })}
					>
						<Trans>Discard draft</Trans>
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => publish({ ...current.current, status: "dirty", identity })}
					>
						<Trans>Keep my changes</Trans>
					</Button>
				</div>
			)}
		</section>
	);
}
