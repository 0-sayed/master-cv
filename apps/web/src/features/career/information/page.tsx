import type { Section } from "./model";
import type { MasterFact } from "@reactive-resume/schema/career-master";
import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";
import { masterSectionSchema } from "@reactive-resume/schema/career-master";
import { Button } from "@reactive-resume/ui/components/button";
import { SectionCollection } from "@reactive-resume/ui/components/collection-grid";
import { FactChip } from "@reactive-resume/ui/components/fact-chip";
import { Icon } from "@reactive-resume/ui/components/icon";
import {
	SectionCard,
	SectionCardEmpty,
	SectionCardHeader,
	SectionCardRow,
} from "@reactive-resume/ui/components/section-card";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { ProfileSectionsSkeleton } from "@reactive-resume/ui/components/skeleton-content";
import { SuccessTick } from "@reactive-resume/ui/components/success-tick";
import { cn } from "@reactive-resume/utils/style";
import { useCareerCopy } from "../copy.generated";
import { useSessionDraft } from "../hooks";
import { CareerLoadError } from "../load-state";
import { CareerEntryDialog, fieldLabel } from "./entry-dialog";
import { sectionFields } from "./model";
import { PageHeader } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { orpc } from "@/libs/orpc/client";

const sections = ["experience", "education", "skills", "languages", "certifications"] as const;
const icons = {
	experience: "briefcase",
	education: "graduation-cap",
	skills: "star",
	languages: "translate",
	certifications: "certificate",
} as const;
const openEntrySchema = z.object({ section: masterSectionSchema, entityId: z.string().min(1).max(64) }).nullable();
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
	const loading = useSkeletonLoading(query.isPending);
	const data = query.data;
	return (
		<div className="contents">
			<PageHeader
				mobileTitleInShell
				title={copy("editor.navigation.career")}
				description={copy("editor.career.subtitle")}
			/>
			{loading.pending ? (
				<QuerySkeleton
					fallback={
						<ProfileSectionsSkeleton
							emptyLabel={copy("editor.career.emptyTitle")}
							noticeLabel={copy("editor.certificates.empty")}
							noticeHint={copy("editor.certificates.hint")}
						/>
					}
				/>
			) : query.isError && !data ? (
				<CareerLoadError retrying={query.isFetching} onRetry={() => void query.refetch()} />
			) : data ? (
				<>
					{query.isError && <CareerLoadError retrying={query.isFetching} onRetry={() => void query.refetch()} />}
					<SectionCollection>{sections.map((section) => group(section))}</SectionCollection>
					{saved && (
						<p role="status" className="flex items-center gap-1.5 type-body text-ink-3">
							<SuccessTick />
							{copy("editor.save.status.saved")}
						</p>
					)}
					{dialog && (
						<CareerEntryDialog
							key={dialog.entityId}
							{...dialog}
							facts={data.facts.filter(
								(fact) => (fact.proposedStructured ?? fact.structured)?.entityId === dialog.entityId,
							)}
							profileRevision={data.profileRevision}
							onClose={() => {
								setDialog(null);
								setSaved(false);
							}}
							onSaved={() => {
								setDialog(null);
								setSaved(true);
							}}
						/>
					)}
				</>
			) : null}
		</div>
	);
	function group(section: Section) {
		if (!data) return null;
		const facts = data.facts.filter((fact) => (fact.proposedStructured ?? fact.structured)?.section === section);
		const order = data.sections.find((item) => item.section === section)?.entityIds ?? [];
		const ids = [
			...new Set([
				...order,
				...facts.flatMap((fact) => {
					const entry = fact.proposedStructured ?? fact.structured;
					return entry ? [entry.entityId] : [];
				}),
			]),
		];
		const titleKey = section === "certifications" ? "editor.certificates.title" : (`editor.${section}.title` as const);
		const addKey = section === "certifications" ? "editor.certificates.add" : (`editor.${section}.add` as const);
		return (
			<SectionCard key={section}>
				<SectionCardHeader>
					<Icon
						name={icons[section]}
						size={18}
						className="box-content rounded-md bg-accent-soft p-2 text-accent-text"
					/>
					<h2 className="type-section">{copy(titleKey)}</h2>
				</SectionCardHeader>
				{ids.length ? (
					<div
						className={
							section === "skills" || section === "languages"
								? "flex flex-wrap items-start gap-x-2 gap-y-4"
								: "grid gap-2"
						}
					>
						{ids.map((id) => (
							<Entry
								key={id}
								section={section}
								facts={facts.filter((fact) => (fact.proposedStructured ?? fact.structured)?.entityId === id)}
								links={data.links.filter((link) =>
									facts.some(
										(fact) => fact.id === link.factId && (fact.proposedStructured ?? fact.structured)?.entityId === id,
									),
								)}
								onEdit={() => setDialog({ section, entityId: id })}
							/>
						))}
					</div>
				) : (
					<SectionCardEmpty>
						<p>{section === "certifications" ? copy("editor.certificates.empty") : copy("editor.career.emptyTitle")}</p>
						{section === "certifications" && <p>{copy("editor.certificates.hint")}</p>}
					</SectionCardEmpty>
				)}
				<Button
					variant="link"
					size="link-compact"
					className="justify-start"
					onClick={() => {
						setSaved(false);
						setDialog({ section, entityId: crypto.randomUUID() });
					}}
				>
					<Icon name="plus" />
					{copy(addKey)}
				</Button>
			</SectionCard>
		);
	}
}
function Entry({
	section,
	facts,
	links,
	onEdit,
}: {
	section: Section;
	facts: MasterFact[];
	links: CareerMaster["links"];
	onEdit: () => void;
}) {
	const copy = useCareerCopy();
	const documents = [...new Map(links.map((link) => [link.resumeId, link])).values()];
	const { t } = useLingui();
	const titleField =
		section === "experience" ? "position" : section === "education" ? "degree" : sectionFields[section][0];
	const heading =
		facts.find((fact) => {
			const value = fact.structured ?? fact.proposedStructured;
			return value?.field === titleField && typeof value.value === "string" && value.value.trim();
		}) ?? facts.find((fact) => (fact.structured ?? fact.proposedStructured)?.field === sectionFields[section][0]);
	const headingValue = (heading?.structured ?? heading?.proposedStructured)?.value;
	const hasDraft = facts.some((fact) => fact.proposedStructured);
	const details = facts.filter((fact) => fact.id !== heading?.id && fact.structured);
	const metadataFields = new Set(["company", "school", "dates"]);
	const metadata = details.filter((fact) => metadataFields.has(fact.structured?.field ?? ""));
	if ((section === "skills" || section === "languages") && !hasDraft && documents.length === 0)
		return (
			<FactChip
				onClick={onEdit}
				aria-label={t`Edit entry`}
				detail={
					section === "languages"
						? details
								.map((fact) => (typeof fact.structured?.value === "string" ? fact.structured.value : ""))
								.filter(Boolean)
								.join(" · ")
						: undefined
				}
			>
				{typeof headingValue === "string" ? headingValue : ""}
			</FactChip>
		);
	return (
		<SectionCardRow
			variant={section === "languages" ? "plain" : "outlined"}
			className={section === "languages" ? "w-full" : undefined}
		>
			<div className={cn("grid min-w-0 flex-1", section === "languages" && "flex flex-wrap items-baseline gap-x-3")}>
				<h3 dir="auto" className={cn("min-w-0 type-label break-words", section === "languages" && "text-start")}>
					{typeof headingValue === "string" ? headingValue : ""}
				</h3>
				{metadata.length > 0 && (
					<p className="type-metadata text-ink-3">
						{metadata.map((fact, index) => (
							<span key={fact.id}>
								{index > 0 && " · "}
								{typeof fact.structured?.value === "string" ? (
									<bdi>{fact.structured.value}</bdi>
								) : (
									<>
										<span className="sr-only">{fieldLabel("dates")}: </span>
										<bdi dir="ltr">
											{fact.structured?.value.start} –{" "}
											{fact.structured?.value.present ? t`Present` : fact.structured?.value.end}
										</bdi>
									</>
								)}
							</span>
						))}
					</p>
				)}
				{details
					.filter((fact) => !metadataFields.has(fact.structured?.field ?? ""))
					.map((fact) => (
						<p
							key={fact.id}
							dir="auto"
							className={cn(
								"min-w-0 type-body break-words whitespace-pre-wrap text-ink-2",
								section === "languages" && "max-w-full text-start",
							)}
						>
							{typeof fact.structured?.value === "string" ? (
								fact.structured.value
							) : (
								<>
									<span className="sr-only">{fieldLabel("dates")}: </span>
									<bdi dir="ltr">
										{fact.structured?.value.start} –{" "}
										{fact.structured?.value.present ? t`Present` : fact.structured?.value.end}
									</bdi>
								</>
							)}
						</p>
					))}
				{facts.some((fact) => fact.proposedStructured) && (
					<p className={cn("type-metadata text-ink-3", section === "languages" && "w-full")}>
						<Trans>Draft — review before confirming</Trans>
					</p>
				)}
				{documents.length > 0 && (
					<div className={cn("flex flex-wrap gap-2 type-metadata text-ink-3", section === "languages" && "w-full")}>
						<span>{copy("editor.field.usedIn", { documentNames: "" })}</span>
						{documents.map((document) => (
							<Link
								key={document.resumeId}
								to="/builder/$resumeId"
								params={{ resumeId: document.resumeId }}
								className="text-accent-text underline"
							>
								<bdi>{document.name}</bdi>
							</Link>
						))}
					</div>
				)}
			</div>
			<Button
				variant="ghost"
				size="icon-compact"
				disclosure={section === "languages" ? "hover" : undefined}
				aria-label={t`Edit entry`}
				onClick={onEdit}
			>
				<Icon name="pencil-simple" />
			</Button>
		</SectionCardRow>
	);
}
