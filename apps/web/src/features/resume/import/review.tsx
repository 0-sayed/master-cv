import type { ImportReviewIssue } from "@reactive-resume/import/plain-text";
import type { MasterFact } from "@reactive-resume/schema/career-master";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import { produce } from "immer";
import { useMemo, useState, useRef, useEffect, useCallback, useId } from "react";
import { buildCareerFactCandidates } from "@reactive-resume/import/career-facts";
import { formatResumeDates } from "@reactive-resume/schema/resume/dates";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardHeader, SectionCardRow } from "@reactive-resume/ui/components/section-card";
import { Tabs, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { cn } from "@reactive-resume/utils/style";
import { EntryFields } from "../editor/write/entries";
import { TextField, WebsiteField } from "../editor/write/fields";
import {
	addBuiltinSection,
	getEntries,
	resolveSection,
	BUILTIN_SECTION_TYPES,
	describeEntry,
	getPrimaryField,
} from "../editor/write/model";
import { RichTextEditor } from "../editor/write/rich-text-editor";
import { ImportAssistance } from "./ai-assistance-panel";
import { fieldLabel } from "./field-label";
import { reuseConfirmedFacts } from "./reuse-master";
import { createReviewState, type ReviewState } from "./review-draft";
import { SourcePreview } from "./source-preview";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { client } from "@/libs/orpc/client";
import { getSectionTitle } from "@/libs/resume/section";

/** Repeated text cannot establish which page supplied a fact. */
function uniqueSourcePage(text: string, pages?: { page: number; text: string }[]): number | undefined {
	const matches = pages?.filter((page) => page.text.includes(text));
	return matches?.length === 1 ? matches[0]?.page : undefined;
}

export function ImportReview({
	initial,
	flowId,
	sourceName,
	pages,
	partial,
	issues,
	signal,
	onBack,
	onSaved,
	file,
	state,
	onCheckpoint,
}: {
	initial: ResumeData;
	flowId: string;
	sourceName?: string | undefined;
	pages?: { page: number; text: string }[] | undefined;
	partial?: boolean | undefined;
	issues?: ImportReviewIssue[] | undefined;
	signal?: AbortSignal | undefined;
	onBack: () => void;
	onSaved: (id: string) => void;
	file?: File | undefined;
	state?: ReviewState | undefined;
	onCheckpoint?: ((state: ReviewState) => Promise<void>) | undefined;
}) {
	const panelId = useId();
	const [aiReview, setAiReview] = useState(state?.aiReview);
	const [data, setData] = useState(state?.data ?? initial);
	const [reused, setReused] = useState<MasterFact[]>(state?.reused ?? []);
	const [confirmed, setConfirmed] = useState<Record<string, string>>(state?.confirmed ?? {});
	const [reviewed, setReviewed] = useState<Record<string, string>>(state?.reviewed ?? {});
	const [active, setActive] = useState(state?.active ?? "basics");
	const [view, setView] = useState("information");
	const [sourcePage, setSourcePage] = useState(1);
	const [editing, setEditing] = useState<string | null>(null);
	const revision = useRef(state?.revision);
	const confirmationFlow = useRef(state?.confirmationFlow ?? flowId);
	const submission = useRef(state?.submission);
	const [submitted, setSubmitted] = useState(!!state?.submission);
	const [needsReconciliation, setNeedsReconciliation] = useState(state?.needsReconciliation ?? false);
	const [changedMasterFacts, setChangedMasterFacts] = useState<string[]>(state?.changedMasterFacts ?? []);
	const lifetime = useRef(new AbortController());
	useEffect(() => {
		const controller = new AbortController();
		lifetime.current = controller;
		return () => controller.abort();
	}, []);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [undoData, setUndoData] = useState<ResumeData | null>(null);
	const snapshot = useCallback(
		(): ReviewState => ({
			...createReviewState(data, flowId),
			confirmed,
			reviewed,
			active,
			reused,
			confirmationFlow: confirmationFlow.current,
			needsReconciliation,
			changedMasterFacts,
			...(aiReview ? { aiReview } : {}),
			...(revision.current !== undefined ? { revision: revision.current } : {}),
			...(submission.current ? { submission: submission.current } : {}),
		}),
		[data, flowId, confirmed, reviewed, active, reused, needsReconciliation, changedMasterFacts, aiReview],
	);
	useEffect(() => {
		if (onCheckpoint)
			void onCheckpoint(snapshot()).catch(() => setError(t`Could not keep this review on this device. Try again.`));
	}, [onCheckpoint, snapshot]);
	const candidates = useMemo(
		() => buildCareerFactCandidates(data, { kind: "manual", id: flowId, quote: "" }),
		[data, flowId],
	);
	const write = (change: (draft: ResumeData) => void) => {
		setUndoData(data);
		const next = produce(data, change);
		const changed = new Set(
			candidates
				.filter((fact) => {
					const section = resolveSection(data, fact.section);
					return (
						section &&
						JSON.stringify(getEntries(data, section).find((entry) => entry.id === fact.entityId)) !==
							JSON.stringify(getEntries(next, section).find((entry) => entry.id === fact.entityId))
					);
				})
				.map((fact) => `${fact.section}:${fact.entityId}`),
		);
		setConfirmed((current) =>
			Object.fromEntries(Object.entries(current).filter(([key]) => !changed.has(key.slice(0, key.lastIndexOf(":"))))),
		);
		setReviewed((current) =>
			Object.fromEntries(
				Object.entries(current).filter(
					([key]) =>
						!changed.has(key) &&
						!(key === "basics" && JSON.stringify(data.basics) !== JSON.stringify(next.basics)) &&
						!(key === "summary" && data.summary.content !== next.summary.content),
				),
			),
		);
		submission.current = undefined;
		setSubmitted(false);
		setData(next);
	};
	const keyOf = (fact: (typeof candidates)[number]) => `${fact.section}:${fact.entityId}:${fact.field}`;
	const withSource = (fact: (typeof candidates)[number]) => {
		const value = typeof fact.value === "string" ? fact.value.trim() : fact.value.raw;
		const page = value ? uniqueSourcePage(value, pages) : undefined;
		return {
			...fact,
			source: {
				...fact.source,
				quote: page ? `PDF page ${page}: ${value}`.slice(0, 4000) : (value?.slice(0, 4000) ?? ""),
			},
		};
	};
	const confirm = async () => {
		if (busy || needsReconciliation || (partial && reviewedCount < total)) return;
		const controller = lifetime.current;
		const currentSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
		setBusy(true);
		setError(null);
		try {
			if (revision.current === undefined)
				revision.current = (await client.career.master.read({}, { signal: currentSignal })).profileRevision;
			currentSignal.throwIfAborted();
			if (!submission.current)
				submission.current = {
					flowId: confirmationFlow.current,
					name: (data.basics.name.trim() || t`CV`).slice(0, 100),
					data,
					expectedProfileRevision: revision.current,
					acceptedFacts: candidates
						.filter((f) => confirmed[keyOf(f)] === JSON.stringify(f.value))
						.map((fact) => ({
							fact: withSource(fact),
							decision: (() => {
								const saved = reused.find(
									(saved) =>
										saved.structured?.section === fact.section &&
										saved.structured.entityId === fact.entityId &&
										saved.structured.field === fact.field &&
										JSON.stringify(saved.structured.value) === JSON.stringify(fact.value),
								);
								return saved
									? {
											kind: "existing" as const,
											id: saved.id,
											expectedRevision: saved.revision,
											expectedDraftRevision: saved.draftRevision,
										}
									: { kind: "new" as const };
							})(),
						})),
				};
			setSubmitted(true);
			await onCheckpoint?.(snapshot());
			currentSignal.throwIfAborted();
			const result = await client.resume.confirmImport(submission.current, { signal: currentSignal });
			currentSignal.throwIfAborted();
			onSaved(result.resumeId);
		} catch (error) {
			if (currentSignal.aborted) return;
			if (error instanceof ORPCError && error.code === "IMPORT_REVIEW_CONFLICT") {
				submission.current = undefined;
				setSubmitted(false);
				setNeedsReconciliation(true);
			}
			setError(getOrpcErrorMessage(error, { fallback: t`Could not save. Your review is still here. Try again.` }));
		} finally {
			if (!currentSignal.aborted) setBusy(false);
		}
	};
	const reuse = async () => {
		const currentSignal = signal ? AbortSignal.any([signal, lifetime.current.signal]) : lifetime.current.signal;
		setBusy(true);
		setError(null);
		try {
			const master = await client.career.master.read({}, { signal: currentSignal });
			currentSignal.throwIfAborted();
			revision.current = master.profileRevision;
			setData((current) => reuseConfirmedFacts(current, master.facts));
			setReused(master.facts.filter((f) => f.confirmation === "confirmed"));
			const accepted: Record<string, string> = {};
			for (const saved of master.facts)
				if (saved.confirmation === "confirmed" && saved.structured)
					accepted[keyOf(saved.structured)] = JSON.stringify(saved.structured.value);
			setConfirmed((current) => ({ ...current, ...accepted }));
		} catch (error) {
			if (currentSignal.aborted) return;
			setError(
				getOrpcErrorMessage(error, { fallback: t`Could not load career information. Your review is still here.` }),
			);
		} finally {
			if (!currentSignal.aborted) setBusy(false);
		}
	};
	const reconcile = async () => {
		const currentSignal = signal ? AbortSignal.any([signal, lifetime.current.signal]) : lifetime.current.signal;
		setBusy(true);
		setError(null);
		try {
			const master = await client.career.master.read({}, { signal: currentSignal });
			currentSignal.throwIfAborted();
			const unchanged = master.facts.filter(
				(saved) =>
					saved.confirmation === "confirmed" &&
					saved.structured &&
					reused.some(
						(previous) =>
							previous.id === saved.id && JSON.stringify(previous.structured) === JSON.stringify(saved.structured),
					),
			);
			setConfirmed((current) => {
				const next = { ...current };
				for (const previous of reused)
					if (previous.structured && !unchanged.some((saved) => saved.id === previous.id))
						delete next[keyOf(previous.structured)];
				return next;
			});
			setChangedMasterFacts(
				reused.filter((old) => !unchanged.some((saved) => saved.id === old.id)).map((old) => old.id),
			);
			// Keep prior values as the CV-only boundary; only unchanged facts receive fresh link revisions.
			setReused((previous) => previous.map((old) => unchanged.find((saved) => saved.id === old.id) ?? old));
			revision.current = master.profileRevision;
			confirmationFlow.current = crypto.randomUUID();
			setNeedsReconciliation(false);
		} catch (error) {
			if (!currentSignal.aborted)
				setError(
					getOrpcErrorMessage(error, { fallback: t`Could not load career information. Your review is still here.` }),
				);
		} finally {
			if (!currentSignal.aborted) setBusy(false);
		}
	};
	const sections = [...BUILTIN_SECTION_TYPES, ...data.customSections.map((section) => section.id)]
		.map((id) => resolveSection(data, id))
		.filter((section) => section !== null)
		.filter((section) => getEntries(data, section).length > 0);
	const groups = ["basics", ...(data.summary.content ? ["summary"] : []), ...sections.map((section) => section.id)];
	const selected = groups.includes(active) ? active : "basics";
	const fingerprint = (id: string) => {
		const section = resolveSection(data, id);
		return JSON.stringify(
			id === "basics" ? data.basics : id === "summary" ? data.summary : section ? getEntries(data, section) : [],
		);
	};
	const entryKey = (section: string, id: string) => `${section}:${id}`;
	const isReviewed = (id: string) => {
		if (id === "basics" || id === "summary") return reviewed[id] === fingerprint(id);
		const section = resolveSection(data, id);
		return (
			!!section &&
			getEntries(data, section).every((entry) => reviewed[entryKey(id, entry.id)] === JSON.stringify(entry))
		);
	};
	const uncertain = (field: string, value: unknown) =>
		issues?.some(
			(issue) =>
				issue.field === field &&
				(!value || issue.source.includes(String(value)) || String(value).includes(issue.source)),
		) ?? false;
	const missing = (value: unknown) => typeof value !== "string" || !value.trim();
	const entryUncertain = (section: string, entry: Record<string, unknown>) => {
		const resolved = resolveSection(data, section);
		const required = resolved && getPrimaryField(resolved.type);
		return (
			(!!required && missing(entry[required])) ||
			Object.entries(entry).some(([field, value]) => uncertain(field, value)) ||
			(resolved?.type === "experience" && missing(entry.position))
		);
	};
	const accept = (ids: string[], safeOnly = false) => {
		const next = { ...reviewed };
		const accepted = { ...confirmed };
		for (const id of ids) {
			if (safeOnly && partial) continue;
			if (id === "basics" || id === "summary") {
				if (
					safeOnly &&
					id === "basics" &&
					(missing(data.basics.name) || Object.entries(data.basics).some(([field, value]) => uncertain(field, value)))
				)
					continue;
				next[id] = fingerprint(id);
				continue;
			}
			const section = sections.find((section) => section.id === id);
			if (!section) continue;
			for (const entry of getEntries(data, section)) {
				if (safeOnly && entryUncertain(id, entry as unknown as Record<string, unknown>)) continue;
				next[entryKey(id, entry.id)] = JSON.stringify(entry);
				for (const fact of candidates.filter((fact) => fact.section === id && fact.entityId === entry.id)) {
					const saved = reused.find((saved) => saved.structured && keyOf(saved.structured) === keyOf(fact));
					if (
						saved &&
						(changedMasterFacts.includes(saved.id) ||
							JSON.stringify(saved.structured?.value) !== JSON.stringify(fact.value))
					)
						continue;
					accepted[keyOf(fact)] = JSON.stringify(fact.value);
				}
			}
		}
		setReviewed(next);
		setConfirmed(accepted);
	};
	const acceptEntry = (section: string, entry: { id: string }) => {
		setReviewed((current) => ({ ...current, [entryKey(section, entry.id)]: JSON.stringify(entry) }));
		setConfirmed((current) => {
			const next = { ...current };
			for (const fact of candidates.filter((fact) => fact.section === section && fact.entityId === entry.id)) {
				const saved = reused.find((saved) => saved.structured && keyOf(saved.structured) === keyOf(fact));
				if (
					saved &&
					(changedMasterFacts.includes(saved.id) ||
						JSON.stringify(saved.structured?.value) !== JSON.stringify(fact.value))
				)
					continue;
				next[keyOf(fact)] = JSON.stringify(fact.value);
			}
			return next;
		});
	};
	const reviewedCount = groups.filter(isReviewed).length;
	const total = groups.length;
	const sectionTitle = (id: string) =>
		id === "basics"
			? t`Basic information`
			: data.customSections.find((section) => section.id === id)?.title ||
				getSectionTitle(resolveSection(data, id)?.type ?? "summary");
	const sourceFor = (section: string, id: string, field: string) => {
		const original =
			section === "basics"
				? initial.basics
				: section === "summary"
					? initial.summary
					: getEntries(
							initial,
							resolveSection(initial, section) ?? { id: section, kind: "builtin", type: "experience" },
						).find((entry) => entry.id === id);
		const value = original && (original as unknown as Record<string, unknown>)[field];
		const text =
			typeof value === "string"
				? value.replace(/<[^>]*>/g, " ").trim()
				: value && typeof value === "object" && "raw" in value && typeof value.raw === "string"
					? value.raw
					: "";
		return text ? uniqueSourcePage(text, pages) : undefined;
	};
	const sourceTag = (page: number | undefined) =>
		page ? (
			<Button
				variant="metadata-link"
				size="link-touch"
				onClick={() => {
					setSourcePage(page);
					setView("source");
				}}
			>
				<Trans>PDF page {page}</Trans>
			</Button>
		) : null;
	return (
		<div className="grid min-w-0 gap-4">
			{pages && (
				<fieldset disabled={busy || submitted} className="min-w-0">
					<ImportAssistance
						state={{
							...createReviewState(data, flowId),
							data,
							confirmed,
							reviewed,
							active,
							reused,
							aiReview,
							needsReconciliation,
							changedMasterFacts,
						}}
						flowId={flowId}
						pages={pages}
						partial={partial ?? false}
						onChange={(next) => {
							if (busy || submitted) return;
							setData(next.data);
							setConfirmed(next.confirmed);
							setReviewed(next.reviewed);
							setAiReview(next.aiReview);
							confirmationFlow.current = next.confirmationFlow;
							submission.current = next.submission;
							setSubmitted(Boolean(next.submission));
						}}
					/>
				</fieldset>
			)}
			<header className="grid gap-2">
				<h1 className="type-title-s">
					<Trans context="review.import.title">Review imported information</Trans>
				</h1>
				<p className="type-body text-ink-2">
					<Trans context="review.import.subtitle">
						Review each section beside the original PDF. Highlighted information needs checking.
					</Trans>
				</p>
				{sourceName && (
					<p className="type-meta wrap-anywhere text-ink-3" dir="auto">
						{sourceName}
					</p>
				)}
				<p role="status" aria-label={t`Review progress`} className="type-label">
					<Trans>
						{reviewedCount} of {total} sections reviewed
					</Trans>
				</p>
			</header>
			{partial && (
				<Alert variant="warn">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans context="review.import.title">Review imported information</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>
							Only part of this file could be read. Review every section and add missing information before saving.
						</Trans>
					</AlertDescription>
					<AlertActions>
						<Button
							variant="secondary"
							onClick={() => {
								setView("information");
								setActive("basics");
							}}
						>
							<Trans>Review now</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			{!!issues?.length && (
				<Alert variant="warn">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans context="review.import.title">Review imported information</Trans>
					</AlertTitle>
					<AlertDescription>
						<ul>
							{issues.map((issue, index) => (
								<li key={index}>
									{fieldLabel(issue.field)}: <span dir="auto">{issue.source}</span>
								</li>
							))}
						</ul>
					</AlertDescription>
					<AlertActions>
						<Button
							variant="secondary"
							onClick={() => {
								setView("information");
								setActive("basics");
							}}
						>
							<Trans>Review now</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			<fieldset disabled={busy || submitted} className="grid min-w-0 gap-4">
				<nav aria-label={t`Review sections`} className="flex flex-wrap gap-2">
					{groups.map((id) => (
						<Button
							key={id}
							variant={id === selected ? "primary" : "secondary"}
							aria-current={id === selected ? "step" : undefined}
							onClick={() => {
								setActive(id);
								setView("information");
							}}
						>
							{isReviewed(id) && <Icon name="check-circle" />}
							{sectionTitle(id)}
						</Button>
					))}
				</nav>
				<div className="flex flex-wrap items-center gap-3">
					<Button variant="secondary" disabled={partial} onClick={() => accept(groups, true)}>
						<Trans>Confirm all remaining</Trans>
					</Button>
					<p className="type-meta text-ink-3">
						<Trans>Highlighted information needs a separate review.</Trans>
					</p>
				</div>
				<Tabs value={view} onValueChange={(value) => setView(String(value))} className="lg:hidden">
					<TabsList>
						<TabsTrigger id={`${panelId}-information-tab`} aria-controls={`${panelId}-information`} value="information">
							<Trans>Extracted information</Trans>
						</TabsTrigger>
						<TabsTrigger
							id={`${panelId}-source-tab`}
							aria-controls={`${panelId}-source`}
							value="source"
							disabled={!file}
						>
							<Trans>Original PDF</Trans>
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className={cn("grid min-w-0 items-start gap-4", file && "lg:grid-cols-2")}>
					<div
						role="tabpanel"
						id={`${panelId}-information`}
						aria-labelledby={`${panelId}-information-tab`}
						className={cn("grid min-w-0 gap-4", view === "source" && "hidden lg:grid")}
					>
						<SectionCard>
							<SectionCardHeader>
								<h2 className="min-w-0 flex-1 type-section">{sectionTitle(selected)}</h2>
								<Button variant={isReviewed(selected) ? "ghost" : "secondary"} onClick={() => accept([selected])}>
									{isReviewed(selected) ? (
										<Trans context="review.fact.status.confirmed">Confirmed</Trans>
									) : (
										<Trans>Confirm section</Trans>
									)}
								</Button>
							</SectionCardHeader>
							{selected === "basics" ? (
								<div className="grid gap-3 sm:grid-cols-2">
									{(
										[
											["name", t`Full name`],
											["headline", t`Headline`],
											["email", t`Email`],
											["phone", t`Phone`],
											["location", t`Location`],
										] as const
									).map(([field, label]) => {
										const flagged =
											uncertain(field, data.basics[field]) || (field === "name" && missing(data.basics[field]));
										return (
											<div key={field} data-uncertain={flagged || undefined} className="grid gap-1">
												<TextField
													dir={field === "phone" || field === "email" ? "ltr" : "auto"}
													label={label}
													type={field === "phone" ? "tel" : field === "email" ? "email" : "text"}
													value={data.basics[field]}
													hint={
														flagged ? (
															<span className="text-warn-text">
																<Trans>Check this information</Trans>
															</span>
														) : (
															sourceTag(sourceFor("basics", "", field))
														)
													}
													onChange={(value) =>
														write((draft) => {
															draft.basics[field] = value;
														})
													}
												/>
											</div>
										);
									})}
									<WebsiteField
										value={data.basics.website}
										onChange={(value) =>
											write((draft) => {
												draft.basics.website = value;
											})
										}
										allowInlineLink={false}
									/>
								</div>
							) : selected === "summary" ? (
								<RichTextEditor
									label={t`Summary`}
									value={data.summary.content}
									onChange={(value) =>
										write((draft) => {
											draft.summary.content = value;
										})
									}
								/>
							) : (
								sections
									.filter((section) => section.id === selected)
									.map((section) => (
										<div key={section.id} className="grid gap-4">
											{getEntries(data, section).map((entry) => {
												const id = entryKey(section.id, entry.id);
												const title = describeEntry(section.type, entry).title || t`Untitled entry`;
												const required = getPrimaryField(section.type);
												const values = Object.entries(entry).filter(
													([field, value]) =>
														!["id", "hidden", "icon", "iconColor", "level"].includes(field) &&
														(field !== "period" || !("dates" in entry && displayValue("dates", entry.dates, data))) &&
														(typeof value === "string" ? !!value.trim() : typeof value === "object" && value !== null),
												);
												if (required && !values.some(([field]) => field === required)) values.unshift([required, ""]);
												if (section.type === "experience" && !values.some(([field]) => field === "position"))
													values.unshift(["position", ""]);
												return (
													<SectionCardRow key={entry.id} aria-label={title} className="grid gap-3">
														<SectionCardHeader>
															<h3 className="min-w-0 flex-1 type-label wrap-anywhere" dir="auto">
																{title}
															</h3>
															<div className="flex flex-wrap gap-2">
																<Button variant="ghost" onClick={() => setEditing(editing === id ? null : id)}>
																	<Icon name="pencil-simple" />
																	<Trans>Edit</Trans>
																</Button>
																<Button
																	variant="ghost"
																	onClick={() =>
																		write((draft) => {
																			const entries = getEntries(draft, section);
																			entries.splice(
																				entries.findIndex((item) => item.id === entry.id),
																				1,
																			);
																		})
																	}
																>
																	<Icon name="trash" />
																	<Trans>Remove</Trans>
																</Button>
															</div>
														</SectionCardHeader>
														{editing === id ? (
															<div className="grid gap-3 sm:grid-cols-2">
																<EntryFields
																	type={section.type}
																	entry={entry}
																	page={{ locale: data.metadata.page.locale }}
																	write={(_field, mutate) =>
																		write((draft) => {
																			const item = getEntries(draft, section).find((item) => item.id === entry.id);
																			if (item) mutate(item as unknown as Record<string, unknown>);
																		})
																	}
																/>
															</div>
														) : (
															<dl className="grid gap-3">
																{values.map(([field, value]) => {
																	const display = displayValue(field, value, data);
																	if (!display && field !== required && field !== "position") return null;
																	const flagged =
																		uncertain(field, value) ||
																		((field === required || (section.type === "experience" && field === "position")) &&
																			missing(value));
																	return (
																		<div
																			key={field}
																			data-uncertain={flagged || undefined}
																			className={cn(
																				"grid gap-1",
																				flagged && "rounded-md bg-warn-soft p-3 text-warn-text",
																			)}
																		>
																			<dt className="type-meta">{fieldLabel(field)}</dt>
																			<dd className="type-body wrap-anywhere" dir="auto">
																				{display || <Trans>Missing information</Trans>}
																			</dd>
																			{flagged && (
																				<p className="type-meta">
																					<Trans>Check this information</Trans>
																				</p>
																			)}
																			{sourceTag(sourceFor(section.id, entry.id, field))}
																		</div>
																	);
																})}
															</dl>
														)}
														<Button
															variant={reviewed[id] === JSON.stringify(entry) ? "ghost" : "secondary"}
															onClick={() => acceptEntry(section.id, entry)}
														>
															{reviewed[id] === JSON.stringify(entry) ? (
																<Trans context="review.fact.status.confirmed">Confirmed</Trans>
															) : (
																<Trans>Confirm entry</Trans>
															)}
														</Button>
													</SectionCardRow>
												);
											})}
										</div>
									))
							)}
						</SectionCard>
						<div className="flex flex-wrap gap-2">
							{(["experience", "education", "skills", "languages", "certifications"] as const).map((type) => (
								<Button
									key={type}
									variant="secondary"
									onClick={() => {
										let id: string | null = null;
										write((draft) => {
											id = addBuiltinSection(draft, type);
										});
										setActive(type);
										setEditing(`${type}:${id}`);
									}}
								>
									<Icon name="plus" />
									{getSectionTitle(type)}
								</Button>
							))}
						</div>
						{undoData && (
							<Button
								variant="ghost"
								onClick={() => {
									setData(undoData);
									setUndoData(null);
								}}
							>
								<Icon name="arrow-counter-clockwise" />
								<Trans>Undo</Trans>
							</Button>
						)}
						<Button variant="secondary" disabled={reused.length > 0} onClick={() => void reuse()}>
							<Trans>Use confirmed career information</Trans>
						</Button>
					</div>
					{file && (
						<div
							role="tabpanel"
							id={`${panelId}-source`}
							aria-labelledby={`${panelId}-source-tab`}
							className={cn("min-w-0 lg:sticky lg:top-4", view !== "source" && "hidden lg:block")}
						>
							<SourcePreview file={file} page={sourcePage} onPage={setSourcePage} />
						</div>
					)}
				</div>
			</fieldset>
			<p className="type-meta text-ink-3">
				<Trans>
					Confirm an entry or section to add its supported facts to your career information. Unreviewed information
					stays in this CV only.
				</Trans>
			</p>
			{reused.length > 0 && (
				<p className="type-meta text-ink-3">
					<Trans>Changes to reused facts stay in this CV. Update your career information separately.</Trans>
				</p>
			)}
			{error && (
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans>Something went wrong</Trans>
					</AlertTitle>
					<AlertDescription>
						<p>{error}</p>
					</AlertDescription>
					<AlertActions>
						<Button
							variant="secondary"
							disabled={busy}
							onClick={() => (needsReconciliation ? void reconcile() : void confirm())}
						>
							{needsReconciliation ? <Trans>Refresh career information for review</Trans> : <Trans>Try again</Trans>}
						</Button>
					</AlertActions>
				</Alert>
			)}

			<footer className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
				<Button variant="secondary" disabled={busy} onClick={onBack}>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					loading={busy}
					disabled={needsReconciliation || (partial && reviewedCount < total)}
					onClick={() => void confirm()}
				>
					<Trans context="review.import.saveAndContinue">Create CV and open editor</Trans>
				</Button>
			</footer>
		</div>
	);
}

function displayValue(field: string, value: unknown, data: ResumeData): string {
	if (typeof value === "string") return value.replace(/<[^>]*>/g, " ");
	if (field === "dates" && value && typeof value === "object")
		return formatResumeDates(value as Parameters<typeof formatResumeDates>[0], {
			locale: data.metadata.page.locale,
			format: data.metadata.page.dateFormat,
		});
	if (Array.isArray(value))
		return value
			.map((item) =>
				typeof item === "string"
					? item
					: Object.values(item)
							.filter((value) => typeof value === "string")
							.join(" · "),
			)
			.join(" · ");
	if (value && typeof value === "object" && "url" in value) return String(value.url);
	return "";
}
