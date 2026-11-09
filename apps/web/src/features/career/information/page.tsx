import type { Section } from "./model";
import type { MasterFact } from "@reactive-resume/schema/career-master";
import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import z from "zod";
import { masterSectionSchema } from "@reactive-resume/schema/career-master";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { useCareerCopy } from "../copy.generated";
import { useSessionDraft } from "../hooks";
import { CareerLoadError, CareerLoading } from "../load-state";
import { CareerEntryDialog, fieldLabel } from "./entry-dialog";
import { sectionFields } from "./model";
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
	const data = query.data;
	return (
		<div className="mx-auto grid max-w-[1280px] gap-4 px-[18px] pt-5 pb-[104px] sm:px-7 lg:gap-6 lg:px-10 lg:pt-8 lg:pb-10">
			<header className="grid gap-1 max-sm:sr-only">
				<h1 className="text-2xl leading-9 font-semibold lg:text-[32px] lg:leading-[48px]">
					{copy("editor.navigation.career")}
				</h1>
				<p className="max-w-[740px] text-sm leading-[23px] text-ink-2">{copy("editor.career.subtitle")}</p>
			</header>
			{query.isPending ? (
				<CareerLoading />
			) : query.isError && !data ? (
				<CareerLoadError onRetry={() => void query.refetch()} />
			) : data ? (
				<>
					{query.isError && <CareerLoadError onRetry={() => void query.refetch()} />}
					<p className="text-xs leading-5 text-ink-3 sm:hidden">{copy("editor.career.ownershipHint")}</p>
					<div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
						<div className="grid gap-4 lg:gap-6">{sections.slice(0, 2).map((section) => group(section))}</div>
						<div className="grid gap-4 lg:gap-6">{sections.slice(2).map((section) => group(section))}</div>
					</div>
					<p role="status" className="text-sm text-ink-3">
						{saved ? copy("editor.save.status.saved") : copy("editor.career.ownershipHint")}
					</p>
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
			<section key={section} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
				<header className="flex items-center gap-3">
					<Icon
						name={icons[section]}
						size={18}
						className="box-content rounded-md bg-accent-soft p-[7px] text-accent-text"
					/>
					<h2 className="text-[19px] leading-7 font-semibold">{copy(titleKey)}</h2>
				</header>
				{ids.length ? (
					<div className={section === "skills" ? "flex flex-wrap gap-1.5" : "grid gap-3"}>
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
					<div className="rounded-lg border border-dashed border-line p-5 text-sm leading-6 text-ink-3">
						{section === "certifications" ? copy("editor.certificates.empty") : copy("editor.career.emptyTitle")}
					</div>
				)}
				<Button
					variant="link"
					className="min-h-12 justify-start px-1 font-semibold"
					onClick={() => {
						setSaved(false);
						setDialog({ section, entityId: crypto.randomUUID() });
					}}
				>
					<Icon name="plus" />
					{copy(addKey)}
				</Button>
			</section>
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
	if (section === "skills" && !hasDraft && documents.length === 0)
		return (
			<button
				type="button"
				onClick={onEdit}
				aria-label={t`Edit entry`}
				className="min-h-11 rounded-full bg-sunken px-3 text-sm font-semibold text-ink-2"
			>
				<bdi>{typeof headingValue === "string" ? headingValue : ""}</bdi>
			</button>
		);
	return (
		<article
			className={cn(
				"group/entry flex items-center gap-2 p-3",
				section === "languages" ? "border-b border-line last:border-0" : "rounded-md border border-line bg-raised",
			)}
		>
			<div className={cn("grid min-w-0 flex-1", section === "languages" && "grid-cols-2 items-center gap-4")}>
				<h3 dir="auto" className="text-sm leading-[22px] font-semibold break-words">
					{typeof headingValue === "string" ? headingValue : ""}
				</h3>
				{metadata.length > 0 && (
					<p className="text-xs leading-5 text-ink-3">
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
						<p key={fact.id} dir="auto" className="text-sm break-words whitespace-pre-wrap text-ink-2">
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
					<p className="text-xs text-ink-3">
						<Trans>Draft — review before confirming</Trans>
					</p>
				)}
				{documents.length > 0 && (
					<div className="flex flex-wrap gap-2 text-xs text-ink-3">
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
				size="icon"
				className={
					section === "languages" ? "opacity-0 group-hover/entry:opacity-100 focus-visible:opacity-100" : undefined
				}
				aria-label={t`Edit entry`}
				onClick={onEdit}
			>
				<Icon name="pencil-simple" />
			</Button>
		</article>
	);
}
