import type { Resume } from "@/features/resume/builder/draft";
import type { SectionType } from "@reactive-resume/schema/resume/data";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { isEqual } from "es-toolkit";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { QuerySkeleton } from "@/components/query-skeleton";
import { useResumeStore } from "@/features/resume/builder/draft";
import { getResumeErrorMessage } from "@/libs/error-message";
import { orpc } from "@/libs/orpc/client";
import { getSectionTitle } from "@/libs/resume/section";

/** S23: two real copies; neither overwrites the other implicitly. */
export function SaveConflict() {
	const { i18n } = useLingui();
	const local = useResumeStore((state) => state.resume);
	const resolve = useResumeStore((state) => state.resolveConflict);
	const {
		data: saved,
		isPending,
		error: readError,
		refetch,
	} = useQuery(orpc.resume.getById.queryOptions({ input: { id: local?.id ?? "" } }));
	const navigate = useNavigate();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const choose = async (choice: "save-copy" | "open-saved") => {
		setBusy(true);
		setError(undefined);
		try {
			if (!local) return;
			const id = await resolve(choice);
			if (id) await navigate({ to: "/builder/$resumeId", params: { resumeId: id } });
		} catch (cause) {
			setError(getResumeErrorMessage(cause));
		} finally {
			setBusy(false);
		}
	};
	if (!local) return null;
	return (
		<div className="grid gap-4 p-4">
			<Alert variant="error">
				<Icon name="warning-circle" />
				<AlertTitle>
					<Trans context="editor.conflict.remoteChangeHint">This copy was edited on another device</Trans>
				</AlertTitle>
				<AlertDescription>
					<Trans context="editor.conflict.preservedHint">
						Neither set of edits was replaced. Both are kept until you choose.
					</Trans>
				</AlertDescription>
			</Alert>
			<SectionCard>
				<SectionCardHeader>
					<h2 className="type-label">
						<Trans context="editor.conflict.localTitle">Your edits on this device</Trans>
					</h2>
					<span className="type-meta text-ink-3">
						<Trans context="editor.conflict.localStatus">Not saved yet</Trans>
					</span>
				</SectionCardHeader>
				{saved && <ChangedSections value={local} other={saved} />}
				<Button disabled={busy} onClick={() => void choose("save-copy")}>
					<Trans context="editor.conflict.saveAsCopy">Save my edits as a new copy</Trans>
				</Button>
			</SectionCard>
			<SectionCard>
				<SectionCardHeader>
					<h2 className="type-label">
						<Trans context="editor.conflict.savedTitle">Saved copy</Trans>
					</h2>
				</SectionCardHeader>
				{saved && (
					<>
						<time className="type-meta" dateTime={saved.updatedAt.toISOString()}>
							{saved.updatedAt.toLocaleString(i18n.locale)}
						</time>
						<ChangedSections value={saved} other={local} />
					</>
				)}
				<QuerySkeleton loading={isPending} shape="rows" count={2} />
				{readError && (
					<Alert variant="error">
						<AlertDescription>{getResumeErrorMessage(readError)}</AlertDescription>

						<AlertActions>
							<Button variant="secondary" onClick={() => void refetch()}>
								<Trans>Retry</Trans>
							</Button>
						</AlertActions>
					</Alert>
				)}
				<Button variant="secondary" disabled={busy || !saved} onClick={() => void choose("open-saved")}>
					<Trans context="editor.conflict.openSaved">Open saved copy</Trans>
				</Button>
			</SectionCard>
			<p className="type-meta text-ink-3">
				<Trans context="editor.conflict.chooseHint">
					Choose a copy before continuing to the editor or version history.
				</Trans>
			</p>
			<Button variant="ghost" disabled>
				<Trans context="editor.conflict.viewHistory">View version history</Trans>
			</Button>
			{error && (
				<Alert variant="error">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

type ChangedSectionsProps = { value: Resume; other: Resume };
function ChangedSections({ value, other }: ChangedSectionsProps) {
	const sections = Object.entries(value.data.sections).filter(
		([key, section]) => !isEqual(section, other.data.sections[key as keyof typeof other.data.sections]),
	);
	const metadataLabels = {
		template: getSectionTitle("template"),
		layout: getSectionTitle("layout"),
		page: getSectionTitle("page"),
		design: getSectionTitle("design"),
		typography: getSectionTitle("typography"),
		notes: getSectionTitle("notes"),
		styleRules: getSectionTitle("styles"),
		stylesheet: getSectionTitle("styles"),
		check: t`Check`,
	} satisfies Record<keyof Resume["data"]["metadata"], string>;
	const extraLabels = new Set<string>();
	if (!isEqual(value.data.picture, other.data.picture)) extraLabels.add(getSectionTitle("picture"));
	if (!isEqual(value.data.customSections, other.data.customSections)) extraLabels.add(getSectionTitle("custom"));
	for (const key of Object.keys(metadataLabels) as (keyof typeof metadataLabels)[]) {
		if (!isEqual(value.data.metadata[key], other.data.metadata[key])) extraLabels.add(metadataLabels[key]);
	}
	const basics = !isEqual(value.data.basics, other.data.basics);
	const summary = !isEqual(value.data.summary, other.data.summary);
	return (
		<ul className="grid gap-2 type-body text-ink-2">
			{basics && (
				<li className="flex gap-2">
					<Icon name="pencil" />
					<span dir="auto">{value.data.basics.name || t`Basic information`}</span>
				</li>
			)}
			{summary && (
				<li className="flex gap-2">
					<Icon name="pencil" />
					<span dir="auto">{value.data.summary.title || t`Summary`}</span>
				</li>
			)}
			{Array.from(extraLabels, (label) => (
				<li key={label} className="flex gap-2">
					<Icon name="pencil" />
					<span>{label}</span>
				</li>
			))}
			{sections.map(([key, section]) => (
				<li key={key} className="flex gap-2">
					<Icon name="pencil" />
					<span dir="auto">{section.title || getSectionTitle(key as SectionType)}</span>
				</li>
			))}
		</ul>
	);
}
