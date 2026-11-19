import type { CareerEntryView } from "./presentation";
import type { ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { SectionCardRow } from "@reactive-resume/ui/components/section-card";
import { cn } from "@reactive-resume/utils/style";
import { useCareerCopy } from "../copy.generated";
import { formatFactValue, sectionFields } from "./model";

type CareerEntryRowProps = {
	entry: CareerEntryView;
	descriptionExpanded: boolean;
	onDescriptionExpandedChange: (expanded: boolean) => void;
	onEdit: () => void;
	usage: ReactNode;
};
export function careerEntryLabel(entry: CareerEntryView, fallback: string): string {
	const primary =
		entry.section === "experience"
			? "position"
			: entry.section === "education"
				? "degree"
				: sectionFields[entry.section][0];
	const values = entry.facts.map((fact) => fact.structured ?? fact.proposedStructured);
	const heading =
		values.find((value) => value?.field === primary && typeof value.value === "string" && value.value.trim()) ??
		values.find((value) => typeof value?.value === "string" && value.value.trim());
	return typeof heading?.value === "string" ? heading.value : fallback;
}
export function CareerEntryRow({
	entry,
	descriptionExpanded,
	onDescriptionExpandedChange,
	onEdit,
	usage,
}: CareerEntryRowProps): ReactNode {
	const copy = useCareerCopy();
	const { t } = useLingui();
	const titleKey =
		entry.section === "certifications" ? "editor.certificates.title" : (`editor.${entry.section}.title` as const);
	const label = careerEntryLabel(entry, copy(titleKey));
	const fields = entry.facts.flatMap((fact) => {
		const value = fact.structured ?? fact.proposedStructured;
		return value ? [value] : [];
	});
	const colors = [
		"bg-accent-soft text-accent-text",
		"bg-career-gold-soft text-career-gold",
		"bg-career-teal-soft text-career-teal",
	];
	const current =
		entry.section === "experience" &&
		fields.some((field) => field.field === "dates" && typeof field.value === "object" && field.value.present);
	const description = fields.find((value) => value.field === "description")?.value;
	const text = typeof description === "string" ? description.trim() : "";
	const primary =
		entry.section === "experience"
			? "position"
			: entry.section === "education"
				? "degree"
				: sectionFields[entry.section][0];
	const compact = entry.section === "skills" || entry.section === "languages";
	const organization = fields.find(
		(value) =>
			["company", "school", "issuer"].includes(value.field) &&
			formatFactValue(value.value, t`Present`).trim() !== label,
	);
	const metadata = fields.filter(
		(value) =>
			value.field !== "description" &&
			value.field !== primary &&
			value !== organization &&
			formatFactValue(value.value, t`Present`).trim() !== label,
	);
	const orderedMetadata = [
		...metadata.filter((value) => value.field === "dates"),
		...metadata.filter((value) => value.field !== "dates"),
	];

	const descriptionId = useId();
	const descriptionRef = useRef<HTMLParagraphElement>(null);
	const [overflows, setOverflows] = useState(false);
	useLayoutEffect(() => {
		const element = descriptionRef.current;
		if (!element || !text) {
			setOverflows(false);
			return;
		}
		let alive = true;
		const measure = () => {
			if (!alive) return;
			const previous = element.classList.contains("line-clamp-2");
			element.classList.add("line-clamp-2");
			const clamped = element.getBoundingClientRect().height;
			element.classList.remove("line-clamp-2");
			const full = element.getBoundingClientRect().height;
			element.classList.toggle("line-clamp-2", previous);
			setOverflows(full > clamped + 1);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		measure();
		void document.fonts?.ready.then(measure);
		document.fonts?.addEventListener("loadingdone", measure);
		return () => {
			alive = false;
			observer.disconnect();
			document.fonts?.removeEventListener("loadingdone", measure);
		};
	}, [text]);
	return (
		<SectionCardRow
			variant="plain"
			align="start"
			density={compact ? "compact" : "default"}
			aria-label={label}
			id={`career-entry-${entry.section}-${entry.entityId}`}
			tabIndex={-1}
		>
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div
						className={cn(
							"min-w-0 flex-1",
							entry.section === "languages" ? "flex flex-wrap items-baseline gap-x-3 gap-y-1" : "space-y-1",
						)}
					>
						<h3 className="type-body font-semibold wrap-anywhere" dir="auto">
							{label}
							{current && (
								<Badge variant="accent" className="ms-2">
									<Trans>Current</Trans>
								</Badge>
							)}
						</h3>
						{organization && (
							<p className="type-body wrap-anywhere text-ink-2" dir="auto">
								{formatFactValue(organization.value, t`Present`)}
							</p>
						)}
						<div className="flex flex-wrap gap-x-3 gap-y-1">
							{orderedMetadata.map((value) => (
								<span
									key={value.field}
									className={cn(
										"type-metadata wrap-anywhere text-ink-2",
										entry.section === "skills" && "rounded-full px-2 py-0.5",
										entry.section === "skills" &&
											(typeof value.value === "string" && /advanced|expert|متقدم|خبير/i.test(value.value)
												? colors[0]
												: typeof value.value === "string" && /intermediate|متوسط/i.test(value.value)
													? colors[1]
													: colors[2]),
									)}
									dir="auto"
								>
									{formatFactValue(value.value, t`Present`)}
								</span>
							))}
						</div>
					</div>
					{compact && usage}
					<IconButton
						size="icon-lg"
						data-career-edit=""
						label={copy("editor.career.editEntry", { name: label })}
						onClick={onEdit}
						icon="pencil"
					/>
				</div>
				{text && (
					<p
						ref={descriptionRef}
						id={descriptionId}
						dir="auto"
						className={cn(
							"max-w-prose type-body wrap-anywhere whitespace-pre-line text-ink-2",
							!descriptionExpanded && "line-clamp-2",
						)}
					>
						{text}
					</p>
				)}
				{entry.needsReview && (
					<p className="type-metadata text-ink-2">
						<Trans>Draft — review before confirming</Trans>
					</p>
				)}
				{(overflows || (!compact && usage)) && (
					<div className="flex flex-wrap items-center justify-between gap-x-3">
						{overflows && (
							<Button
								variant="secondary"
								size="default"
								aria-expanded={descriptionExpanded}
								aria-controls={descriptionId}
								onClick={() => onDescriptionExpandedChange(!descriptionExpanded)}
							>
								{copy(descriptionExpanded ? "editor.career.seeLess" : "editor.career.seeMore")}
							</Button>
						)}
						<div className="ms-auto">{!compact && usage}</div>
					</div>
				)}
			</div>
		</SectionCardRow>
	);
}
