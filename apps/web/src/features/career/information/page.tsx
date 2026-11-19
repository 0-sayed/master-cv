import type { Section } from "./model";
import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { useQuery } from "@tanstack/react-query";
import { createRef, useMemo, useRef, useState } from "react";
import z from "zod";
import { masterSectionSchema } from "@reactive-resume/schema/career-master";
import { Button } from "@reactive-resume/ui/components/button";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { Skeleton, useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { SuccessTick } from "@reactive-resume/ui/components/success-tick";
import { cn } from "@reactive-resume/utils/style";
import { useCareerCopy } from "../copy.generated";
import { useSessionDraft } from "../hooks";
import { CareerLoadError } from "../load-state";
import { CareerApprovalPromise } from "./approval-promise";
import { CareerCompleteness } from "./completeness";
import { CareerEntryDialog } from "./entry-dialog";
import { CareerEntryRow, careerEntryLabel } from "./entry-row";
import { careerSections, previewLimits, sectionEntries } from "./presentation";
import { CareerProfileDetails } from "./profile-details";
import { CareerSectionIndex } from "./section-index";
import { CareerUsageDisclosure } from "./usage-disclosure";
import { PageHeader } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { orpc } from "@/libs/orpc/client";

const icons = {
	experience: "briefcase",
	education: "graduation-cap",
	skills: "star",
	languages: "translate",
	certifications: "certificate",
} as const;
const openEntrySchema = z.object({ section: masterSectionSchema, entityId: z.string().min(1).max(64) }).nullable();
// This shape supplies only the inert, hidden loading layout. It never becomes saved account data.
const emptyCareerMaster: CareerMaster = {
	contact: { name: "", email: "", phone: "", location: "" },
	summary: "",
	profileRevision: 0,
	sections: [],
	facts: [],
	links: [],
};
export function CareerInformationPage() {
	const copy = useCareerCopy();
	const query = useQuery(orpc.career.master.read.queryOptions({ input: {} }));
	const openEntry = useSessionDraft<z.infer<typeof openEntrySchema>>("master:open-entry", null, (value) => {
		const parsed = openEntrySchema.safeParse(value);
		return parsed.success ? parsed.data : undefined;
	});
	const dialog = openEntry.value;
	const setDialog = openEntry.setValue;
	const [saved, setSaved] = useState(false);
	const [expanded, setExpanded] = useState<Partial<Record<Section, boolean>>>({});
	const [descriptions, setDescriptions] = useState<Record<string, boolean>>({});
	const addRefs = useMemo(
		() =>
			Object.fromEntries(careerSections.map((section) => [section, createRef<HTMLButtonElement>()])) as Record<
				Section,
				React.RefObject<HTMLButtonElement | null>
			>,
		[],
	);
	const collapseRefs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
	const loading = useSkeletonLoading(query.isPending);
	const data = query.data ?? (loading.pending ? emptyCareerMaster : undefined);
	const groups = data ? careerSections.map((section) => ({ section, entries: sectionEntries(data, section) })) : [];
	if (dialog && !expanded[dialog.section]) {
		const position =
			groups
				.find((group) => group.section === dialog.section)
				?.entries.findIndex((entry) => entry.entityId === dialog.entityId) ?? -1;
		if (position >= previewLimits[dialog.section]) setExpanded({ ...expanded, [dialog.section]: true });
	}
	const entryId = (section: Section, entityId: string) => `career-entry-${section}-${entityId}`;
	const focusEntry = (section: Section, entityId: string, edit = false) =>
		requestAnimationFrame(() => {
			const target = document.getElementById(entryId(section, entityId));
			const control = edit ? target?.querySelector<HTMLElement>("[data-career-edit]") : target;
			(control ?? addRefs[section].current)?.focus();
		});
	const closeEditor = (didSave: boolean) => {
		if (dialog) focusEntry(dialog.section, dialog.entityId, true);
		setDialog(null);
		setSaved(didSave);
	};
	const content = data ? (
		<>
			<CareerCompleteness master={data} />
			{query.isError && <CareerLoadError retrying={query.isFetching} onRetry={() => void query.refetch()} />}
			<div className="flex min-w-0 flex-col gap-6 lg:flex-row">
				<CareerSectionIndex sections={groups.map(({ section, entries }) => ({ section, total: entries.length }))} />
				<div className="min-w-0 flex-1 space-y-6">
					<CareerProfileDetails master={data} />
					{groups.map(({ section, entries }) => {
						const title = copy(
							section === "certifications" ? "editor.certificates.title" : (`editor.${section}.title` as const),
						);
						const add = copy(
							section === "certifications" ? "editor.certificates.add" : (`editor.${section}.add` as const),
						);
						const isExpanded = !!expanded[section];
						const limit = previewLimits[section];
						const visible = isExpanded ? entries : entries.slice(0, limit);
						const pending = entries.filter((entry) => entry.needsReview);
						return (
							<SectionCard key={section} id={`career-section-${section}`} aria-labelledby={`career-heading-${section}`}>
								<SectionCardHeader className="flex-wrap justify-between border-b border-line pb-3">
									<div className="flex min-w-0 items-center gap-2">
										<span
											className={cn(
												"grid size-9 shrink-0 place-items-center rounded-full",
												section === "education" || section === "certifications"
													? "bg-career-gold-soft text-career-gold"
													: section === "skills"
														? "bg-career-teal-soft text-career-teal"
														: "bg-accent-soft text-accent-text",
											)}
										>
											<Icon name={icons[section]} />
										</span>
										<h2
											id={`career-heading-${section}`}
											tabIndex={-1}
											className="scroll-mt-(--app-toolbar-height) type-section lg:scroll-mt-4"
										>
											{title}
										</h2>
										<span className="type-metadata text-ink-2" dir="ltr">
											{entries.length}
										</span>
									</div>
									<Button
										ref={addRefs[section]}
										variant="secondary"
										onClick={() => {
											setSaved(false);
											setDialog({ section, entityId: crypto.randomUUID() });
										}}
									>
										<Icon name="plus" />
										{add}
									</Button>
								</SectionCardHeader>
								{pending.length > 0 && (
									<Button
										variant="secondary"
										size="default"
										className="justify-start"
										onClick={() => {
											const first = pending[0];
											if (!first) return;
											setExpanded((value) => ({ ...value, [section]: true }));
											focusEntry(section, first.entityId);
										}}
									>
										{copy("editor.career.reviewPending", { count: String(pending.length) })}
									</Button>
								)}
								{entries.length === 0 ? (
									<EmptyState
										density="compact"
										title={copy("editor.career.emptyTitle")}
										description={copy("editor.career.sectionEmptyHint")}
									/>
								) : (
									<div
										id={`career-entries-${section}`}
										className={cn("grid", section === "skills" && "lg:grid-cols-2 lg:gap-x-4")}
									>
										{visible.map((entry) => (
											<CareerEntryRow
												key={entry.entityId}
												entry={entry}
												descriptionExpanded={!!descriptions[`${section}:${entry.entityId}`]}
												onDescriptionExpandedChange={(value) =>
													setDescriptions((previous) => ({ ...previous, [`${section}:${entry.entityId}`]: value }))
												}
												onEdit={() => {
													setSaved(false);
													setDialog({ section, entityId: entry.entityId });
												}}
												usage={
													entry.documents.length > 0 ? (
														<CareerUsageDisclosure
															entryLabel={careerEntryLabel(entry, title)}
															documents={entry.documents}
															fallbackFocusRef={addRefs[section]}
														/>
													) : null
												}
											/>
										))}
									</div>
								)}
								{entries.length > limit && (
									<Button
										ref={(element) => {
											collapseRefs.current[section] = element;
										}}
										variant="secondary"
										size="default"
										aria-expanded={isExpanded}
										aria-controls={`career-entries-${section}`}
										onClick={() => {
											setExpanded((value) => ({ ...value, [section]: !isExpanded }));
											if (isExpanded)
												requestAnimationFrame(() => {
													collapseRefs.current[section]?.focus();
													collapseRefs.current[section]?.scrollIntoView({ block: "nearest" });
												});
										}}
									>
										{copy(isExpanded ? "editor.career.showFewer" : "editor.career.showAll", {
											count: String(entries.length),
										})}
										<Icon name="caret-down" className={isExpanded ? "rotate-180" : undefined} />
									</Button>
								)}
							</SectionCard>
						);
					})}
				</div>
			</div>
			{saved && (
				<p role="status" className="flex items-center gap-1.5 type-body text-ink-3">
					<SuccessTick />
					{copy("editor.save.status.saved")}
				</p>
			)}
			{dialog && !loading.pending && (
				<CareerEntryDialog
					key={dialog.entityId}
					{...dialog}
					facts={data.facts.filter(
						(fact) =>
							(fact.proposedStructured ?? fact.structured)?.section === dialog.section &&
							(fact.proposedStructured ?? fact.structured)?.entityId === dialog.entityId,
					)}
					profileRevision={data.profileRevision}
					onClose={() => closeEditor(false)}
					onSaved={() => closeEditor(true)}
				/>
			)}
		</>
	) : null;
	return (
		<div className="contents">
			<PageHeader
				mobileTitleInShell
				title={
					<span className="flex items-center gap-2">
						{copy("editor.navigation.career")}
						<span className="max-sm:hidden">
							<CareerApprovalPromise />
						</span>
					</span>
				}
			/>
			{loading.pending ? (
				<QuerySkeleton
					fallback={
						<Skeleton inert className="grid gap-6 rounded-none bg-transparent max-sm:gap-4 [&_*]:text-transparent">
							{content}
						</Skeleton>
					}
				/>
			) : query.isError && !data ? (
				<CareerLoadError retrying={query.isFetching} onRetry={() => void query.refetch()} />
			) : (
				content
			)}
		</div>
	);
}
