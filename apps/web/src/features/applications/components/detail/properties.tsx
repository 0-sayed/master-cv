import type { Application } from "../../types";
import type { IconName } from "@reactive-resume/ui/components/icon";
import type { CSSProperties, ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@reactive-resume/ui/components/dialog";
import { FactChip } from "@reactive-resume/ui/components/fact-chip";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { PropertyList, PropertyRow } from "@reactive-resume/ui/components/property-row";
import { SarSymbol } from "@reactive-resume/ui/components/sar-amount";
import { SectionCard, SectionCardTitle } from "@reactive-resume/ui/components/section-card";
import { salaryPeriodMessage, splitSalary } from "../../salary";
import { getStageColor, getStageLabel } from "../../stages";
import { useInvalidateApplications } from "../../use-application-actions";
import { Contacts } from "./contacts";
import { isImeComposing } from "@/libs/keyboard";
import { formatInterfaceDate } from "@/libs/locale";
import { orpc } from "@/libs/orpc/client";

export function ApplicationProperties({ application }: { application: Application }) {
	const { i18n } = useLingui();
	const invalidate = useInvalidateApplications();
	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onSuccess: () => invalidate(application.id),
	});
	const save = async (fields: {
		salary?: string | null;
		source?: string | null;
		tags?: string[];
		contacts?: Application["contacts"];
	}) => {
		await update.mutateAsync({
			id: application.id,
			expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
			...fields,
		});
	};
	const salary = splitSalary(application.salary ?? "");
	const periodMessage = salary.kind === "sar-range" && salary.period ? salaryPeriodMessage(salary.period) : null;
	return (
		<SectionCard aria-labelledby="application-details">
			<SectionCardTitle as="h2" id="application-details">
				<Trans>Details</Trans>
			</SectionCardTitle>
			<div className="grid gap-4">
				<PropertyList>
					<PropertyRow icon="chart-line-up" label={<Trans>Stage</Trans>}>
						<Badge
							className="stage-badge"
							style={{ "--stage-color": getStageColor(application.status) } as CSSProperties}
						>
							{getStageLabel(application.status)}
						</Badge>
					</PropertyRow>
					<PropertyRow icon="calendar-dots" label={<Trans>Applied</Trans>}>
						{application.status === "saved"
							? "—"
							: formatInterfaceDate(application.appliedAt, i18n.locale, {
									year: "numeric",
									month: "short",
									day: "numeric",
								})}
					</PropertyRow>
					<InlineFact
						icon="credit-card"
						label={t`Salary`}
						value={application.salary}
						pending={update.isPending}
						onSave={(value) => save({ salary: value })}
					>
						{salary.kind === "sar-range" ? (
							<span dir={i18n.locale === "ar-SA" ? "rtl" : "ltr"} className="inline-flex flex-wrap items-center gap-2">
								<span dir="ltr" className="inline-flex items-center gap-1.5 [unicode-bidi:isolate]">
									<bdi dir="ltr">
										{salary.lower}–{salary.upper}
									</bdi>
									<SarSymbol currencyLabel={t`Saudi riyal`} />
								</span>
								{salary.period && <span dir="auto">{periodMessage ? i18n._(periodMessage) : salary.period}</span>}
							</span>
						) : (
							<span dir="auto">{salary.text || t`Add salary`}</span>
						)}
					</InlineFact>
					<InlineFact
						icon="link"
						label={t`Source`}
						value={application.source}
						pending={update.isPending}
						onSave={(value) => save({ source: value })}
					>
						{application.source ? (
							<Badge dir="auto" variant="info" shape="tag">
								{application.source}
							</Badge>
						) : (
							t`Add source`
						)}
					</InlineFact>
					<PropertyRow icon="user-circle" label={<Trans>Contact</Trans>}>
						<Contacts
							contacts={application.contacts}
							disabled={update.isPending}
							onChange={(contacts) => save({ contacts })}
						/>
					</PropertyRow>
					<PropertyRow icon="tag" label={<Trans>Tags</Trans>}>
						<Tags application={application} pending={update.isPending} onSave={(tags) => save({ tags })} />
					</PropertyRow>
				</PropertyList>
				{update.error && (
					<Alert variant="error">
						<Icon name="warning" />
						<AlertTitle>
							<Trans>Could not save properties</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>Your changes are still here. Retry, or reload the latest record after a conflict.</Trans>
						</AlertDescription>
					</Alert>
				)}
			</div>
		</SectionCard>
	);
}

function InlineFact({
	icon,
	label,
	value,
	pending,
	onSave,
	children,
}: {
	icon: IconName;
	label: string;
	value: string | null;
	pending: boolean;
	onSave: (value: string | null) => Promise<void>;
	children: ReactNode;
}) {
	const id = useId();
	const [draft, setDraft] = useState<string | null>(null);
	const commit = async () => {
		if (draft === null || pending) return;
		try {
			const next = draft.trim() || null;
			if (next !== value) await onSave(next);
			setDraft(null);
		} catch {
			/* The mutation notice retains this draft for retry. */
		}
	};
	return (
		<PropertyRow icon={icon} label={<label htmlFor={id}>{label}</label>}>
			{draft === null ? (
				<Button
					id={id}
					aria-label={label}
					variant="secondary"
					size="row"
					className="w-full justify-between text-start"
					onClick={() => setDraft(value ?? "")}
				>
					{children}
					<Icon name="pencil-simple" />
				</Button>
			) : (
				<div className="grid gap-2">
					<Input
						id={id}
						dir="auto"
						autoFocus
						value={draft}
						disabled={pending}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={(event) => {
							if (isImeComposing(event)) return;
							if (event.key === "Enter") {
								event.preventDefault();
								void commit();
							}
							if (event.key === "Escape") {
								event.stopPropagation();
								setDraft(null);
							}
						}}
					/>
					<div className="flex gap-2">
						<Button size="sm" loading={pending} onClick={() => void commit()}>
							<Trans>Save</Trans>
						</Button>
						<Button size="sm" variant="secondary" disabled={pending} onClick={() => setDraft(null)}>
							<Trans>Cancel</Trans>
						</Button>
					</div>
				</div>
			)}
		</PropertyRow>
	);
}

function Tags({
	application,
	pending,
	onSave,
}: {
	application: Application;
	pending: boolean;
	onSave: (tags: string[]) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [tags, setTags] = useState(application.tags);
	const [tag, setTag] = useState("");
	const [failed, setFailed] = useState(false);
	return (
		<section className="grid gap-2">
			<div className="flex flex-wrap gap-2">
				{application.tags.length ? (
					application.tags.map((value) => (
						<Badge key={value} dir="auto" shape="tag">
							{value}
						</Badge>
					))
				) : (
					<span className="type-metadata text-ink-3">
						<Trans>No tags</Trans>
					</span>
				)}
			</div>
			<Button
				size="sm"
				variant="secondary"
				className="w-fit"
				onClick={() => {
					setTags(application.tags);
					setFailed(false);
					setOpen(true);
				}}
			>
				<Icon name="pencil-simple" />
				<Trans>Edit tags</Trans>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>Edit tags</Trans>
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="flex flex-wrap gap-2">
							{tags.map((value) => (
								<FactChip
									key={value}
									icon={<Icon name="x" />}
									aria-label={t`Remove ${value}`}
									onClick={() => setTags(tags.filter((item) => item !== value))}
								>
									<span dir="auto">{value}</span>
								</FactChip>
							))}
						</div>
						<Input
							aria-label={t`Add a tag`}
							dir="auto"
							value={tag}
							onChange={(event) => setTag(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !isImeComposing(event)) {
									event.preventDefault();
									const value = tag.trim();
									if (value && !tags.includes(value)) setTags([...tags, value]);
									setTag("");
								}
							}}
						/>
						<Button
							variant="secondary"
							onClick={() => {
								const value = tag.trim();
								if (value && !tags.includes(value)) setTags([...tags, value]);
								setTag("");
							}}
						>
							<Trans>Add</Trans>
						</Button>
						{failed && (
							<p role="alert">
								<Trans>Could not save tags. Retry Save.</Trans>
							</p>
						)}
					</div>
					<DialogFooter>
						<Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							loading={pending}
							onClick={async () => {
								if (pending) return;
								try {
									await onSave(tags);
									setOpen(false);
								} catch {
									setFailed(true);
								}
							}}
						>
							<Trans>Save</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</section>
	);
}
