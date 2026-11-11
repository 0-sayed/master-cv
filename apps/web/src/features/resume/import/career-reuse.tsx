import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { reuseConfirmedFacts } from "./reuse-master";
import { useResumeStore, useUpdateResumeData, savePendingChanges } from "@/features/resume/builder/draft";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { client } from "@/libs/orpc/client";

type CareerReuseNoticeProps = { available: boolean };
type ReuseLinks = { resumeId: string; ownerId: string; links: Array<{ factId: string; acceptedRevision: number }> };
/** Explicit copying uses the editor's existing save/recovery path; master facts are read-only here. */
export function CareerReuseNotice({ available }: CareerReuseNoticeProps) {
	const update = useUpdateResumeData();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [empty, setEmpty] = useState(false);
	const [done, setDone] = useState(false);
	const [applied, setApplied] = useState(false);
	const pending = useRef<ReuseLinks | null>(null);
	const lifetime = useRef(new AbortController());
	useEffect(() => {
		const controller = new AbortController();
		lifetime.current = controller;
		return () => controller.abort();
	}, []);
	const fill = async () => {
		if (busy) return;
		const signal = lifetime.current.signal;
		const before = useResumeStore.getState();
		if (!before.resume || !before.ownerId || before.resume.isLocked || (!available && !pending.current)) return;
		setBusy(true);
		setError(null);
		setEmpty(false);
		try {
			if (!pending.current) {
				const master = await client.career.master.read({}, { signal });
				signal.throwIfAborted();
				const latest = useResumeStore.getState();
				if (
					latest.resumeId !== before.resumeId ||
					latest.ownerId !== before.ownerId ||
					latest.resume?.isLocked ||
					latest.editGeneration !== before.editGeneration
				)
					throw new Error(t`Your CV changed while loading. Try again to use your career information.`);
				const facts = master.facts.filter((fact) => fact.confirmation === "confirmed" && fact.structured);
				if (!facts.length) {
					setEmpty(true);
					return;
				}
				const data = reuseConfirmedFacts(before.resume.data, facts);
				update((draft) => {
					Object.assign(draft, data);
				});
				pending.current = {
					resumeId: before.resume.id,
					ownerId: before.ownerId,
					links: facts.map((fact) => ({ factId: fact.id, acceptedRevision: fact.revision })),
				};
				setApplied(true);
			}
			const target = pending.current;
			if (!(await savePendingChanges(target.resumeId)))
				throw new Error(t`Could not save your CV. Retry to finish using your career information.`);
			signal.throwIfAborted();
			const current = useResumeStore.getState();
			if (current.resumeId !== target.resumeId || current.ownerId !== target.ownerId) return;
			await client.career.master.linkResumeFacts({ resumeId: target.resumeId, links: target.links }, { signal });
			signal.throwIfAborted();
			pending.current = null;
			setDone(true);
		} catch (error) {
			if (!signal.aborted)
				setError(getOrpcErrorMessage(error, { fallback: t`Could not load career information. Try again.` }));
		} finally {
			if (!signal.aborted) setBusy(false);
		}
	};
	if (done || (!available && !busy && !error)) return null;
	return (
		<Alert variant={error ? "error" : "info"}>
			<Icon name={error ? "warning-circle" : "info"} />
			{error && (
				<AlertTitle>
					<Trans>Something went wrong</Trans>
				</AlertTitle>
			)}
			<AlertDescription className="grid gap-3">
				<p>
					<Trans>You can fill this CV from your confirmed career information. Changes here stay in this CV.</Trans>
				</p>
				{empty && (
					<p role="status">
						<Trans>No confirmed career information yet.</Trans>
					</p>
				)}
				{error && <p>{error}</p>}
				<Button variant="secondary" loading={busy} onClick={() => void fill()}>
					{applied ? <Trans>Retry</Trans> : <Trans>Use confirmed career information</Trans>}
				</Button>
			</AlertDescription>
		</Alert>
	);
}
