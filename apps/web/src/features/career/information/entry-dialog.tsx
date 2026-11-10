import type { Section } from "./model";
import type { MasterFact } from "@reactive-resume/schema/career-master";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import {
	TaskOverlay,
	TaskOverlayContent,
	TaskOverlayDescription,
	TaskOverlayFooter,
	TaskOverlayHeader,
	TaskOverlayTitle,
} from "@reactive-resume/ui/components/task-overlay";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { useCareerCopy } from "../copy.generated";
import { useSessionDraft } from "../hooks";
import { draftSchema, entryInputs, formatFactValue, initialDraft, mergeLatestDraft, sectionFields } from "./model";
import { AuthErrorSummary } from "@/features/auth/components/auth-error-summary";
import { client, orpc } from "@/libs/orpc/client";

export function fieldLabel(field: string): string {
	const labels: Record<string, string> = {
		company: t`Company`,
		position: t`Position`,
		location: t`Location`,
		description: t`Description`,
		school: t`School`,
		degree: t`Degree`,
		area: t`Area of study`,
		grade: t`Grade`,
		name: t`Skill`,
		proficiency: t`Proficiency`,
		language: t`Language`,
		fluency: t`Fluency`,
		title: t`Certificate`,
		issuer: t`Issuer`,
		start: t`Start date`,
		end: t`End date`,
		dates: t`Dates`,
	};
	return labels[field] ?? field;
}
type Props = {
	section: Section;
	entityId: string;
	facts: MasterFact[];
	profileRevision: number;
	onClose: () => void;
	onSaved: () => void;
};
export function CareerEntryDialog({ section, entityId, facts, profileRevision, onClose, onSaved }: Props) {
	const copy = useCareerCopy();
	const queryClient = useQueryClient();
	const draft = useSessionDraft(`master:${entityId}`, initialDraft(facts, profileRevision), (value) => {
		const parsed = draftSchema.safeParse(value);
		return parsed.success ? parsed.data : undefined;
	});
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState(false);
	const [latest, setLatest] = useState<MasterFact[] | null>(null);
	const [removing, setRemoving] = useState(false);
	const fields = sectionFields[section];
	const hasDates = section === "experience" || section === "education" || section === "certifications";
	const values = draft.value.values;
	function change(field: string, value: string) {
		const normalized = field === "start" || field === "end" ? normalizeNumericDigits(value) : value;
		draft.setValue((previous) => ({ ...previous, review: false, values: { ...previous.values, [field]: normalized } }));
	}
	function fail(cause: unknown) {
		const isConflict = !!cause && typeof cause === "object" && "code" in cause && cause.code === "CONFLICT";
		setConflict(isConflict);
		setError(copy(isConflict ? "editor.conflict.hint" : "editor.save.error.localCopy"));
	}
	async function review(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setConflict(false);
		setPending(true);
		let current = draft.value;
		if (values.start && values.end && values.start > values.end) {
			setError(t`End date must follow start date.`);
			setPending(false);
			return;
		}
		try {
			const inputs = entryInputs(
				section,
				entityId,
				current.values,
				current.versions.map((version) => version.field),
			);
			for (const fact of inputs) {
				const version = current.versions.find((version) => version.field === fact.field);
				const saved = await client.career.master.savePending({
					fact,
					...(version
						? {
								version: {
									id: version.id,
									expectedRevision: version.expectedRevision,
									expectedDraftRevision: version.expectedDraftRevision,
								},
							}
						: {}),
				});
				current = {
					...current,
					versions: [
						...current.versions.filter((version) => version.field !== fact.field),
						{
							id: saved.id,
							field: fact.field,
							expectedRevision: saved.revision,
							expectedDraftRevision: saved.draftRevision,
						},
					],
				};
				draft.setValue(current);
			}
			draft.setValue({ ...current, review: true });
		} catch (cause) {
			fail(cause);
		} finally {
			setPending(false);
		}
	}
	async function confirm() {
		setPending(true);
		setError(null);
		try {
			await client.career.master.confirm({
				expectedProfileRevision: draft.value.profileRevision,
				facts: draft.value.versions.map(({ id, expectedRevision, expectedDraftRevision }) => ({
					id,
					expectedRevision,
					expectedDraftRevision,
				})),
			});
			draft.clear();
			await queryClient.invalidateQueries({ queryKey: orpc.career.master.read.key() });
			onSaved();
		} catch (cause) {
			fail(cause);
		} finally {
			setPending(false);
		}
	}
	async function loadLatest() {
		setPending(true);
		try {
			const master = await client.career.master.read({});
			const remote = master.facts.filter((fact) => (fact.proposedStructured ?? fact.structured)?.entityId === entityId);
			setLatest(remote);
			setError(null);
			draft.setValue((previous) => mergeLatestDraft(previous, remote, master.profileRevision));
			setConflict(false);
		} catch (cause) {
			fail(cause);
		} finally {
			setPending(false);
		}
	}
	async function remove() {
		setPending(true);
		try {
			await client.career.master.remove({ entityId, expectedProfileRevision: draft.value.profileRevision });
			draft.clear();
			await queryClient.invalidateQueries({ queryKey: orpc.career.master.read.key() });
			onSaved();
		} catch (cause) {
			fail(cause);
		} finally {
			setPending(false);
		}
	}
	return (
		<TaskOverlay
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<TaskOverlayContent closeLabel={t`Close`}>
				<TaskOverlayHeader>
					<TaskOverlayTitle>
						{copy(
							section === "experience" && facts.length
								? "editor.experience.editTitle"
								: section === "certifications"
									? "editor.certificates.add"
									: `editor.${section}.add`,
						)}
					</TaskOverlayTitle>
					<TaskOverlayDescription>
						<span className="sm:hidden">{copy("editor.experience.accuracyHint")}</span>
						<span className="hidden sm:inline">{copy("review.fact.entryHint")}</span>
					</TaskOverlayDescription>
				</TaskOverlayHeader>
				<AuthErrorSummary
					message={error}
					field={error && values.start && values.end && values.start > values.end ? "career-end" : undefined}
				/>
				{conflict && (
					<div className="grid gap-2">
						<h3 className="font-semibold">{copy("editor.conflict.title")}</h3>
						<p>{copy("editor.conflict.preservedHint")}</p>
						<Button variant="secondary" loading={pending} onClick={() => void loadLatest()}>
							{copy("editor.conflict.viewLatest")}
						</Button>
					</div>
				)}
				{latest && (
					<section className="rounded-lg border border-line bg-bg p-3">
						<h3 className="font-semibold">
							<Trans>Latest saved information</Trans>
						</h3>
						{latest
							.filter((fact) => fact.structured)
							.map((fact) => (
								<p key={fact.id} dir="auto" className="type-body break-words">
									{fact.structured && fieldLabel(fact.structured.field)}:{" "}
									{fact.structured && (
										<bdi
											dir={
												typeof fact.structured.value === "string" || fact.structured.value.raw !== undefined
													? "auto"
													: "ltr"
											}
										>
											{formatFactValue(fact.structured.value, t`Present`)}
										</bdi>
									)}
								</p>
							))}
						<p className="mt-2 type-body text-ink-3">{copy("editor.conflict.preservedHint")}</p>
					</section>
				)}
				{removing ? (
					<>
						<p>
							<Trans>Remove this entry from your career information? Your saved CVs will remain unchanged.</Trans>
						</p>
						<TaskOverlayFooter>
							<Button variant="secondary" disabled={pending} onClick={() => setRemoving(false)}>
								<Trans>Cancel</Trans>
							</Button>
							<Button loading={pending} onClick={() => void remove()}>
								<Trans>Remove entry</Trans>
							</Button>
						</TaskOverlayFooter>
					</>
				) : draft.value.review ? (
					<>
						<section className="grid gap-3 rounded-xl border border-line bg-bg p-4">
							<h3 className="font-semibold">
								<Trans>Review your changes</Trans>
							</h3>
							{entryInputs(
								section,
								entityId,
								values,
								draft.value.versions.map((version) => version.field),
							).map((fact) => (
								<div key={fact.field}>
									<span className="type-metadata text-ink-3">{fieldLabel(fact.field)}</span>
									<p dir="auto" className="break-words whitespace-pre-wrap">
										{formatFactValue(fact.value, t`Present`)}
									</p>
								</div>
							))}
						</section>
						<TaskOverlayFooter>
							<Button
								variant="secondary"
								disabled={pending}
								onClick={() => draft.setValue((previous) => ({ ...previous, review: false }))}
							>
								<Trans>Edit</Trans>
							</Button>
							<Button loading={pending} disabled={conflict} onClick={() => void confirm()}>
								<Trans>Confirm changes</Trans>
							</Button>
						</TaskOverlayFooter>
					</>
				) : (
					<form onSubmit={review} className="grid gap-4">
						<fieldset disabled={pending} className="grid gap-4">
							{fields.map((field, index) => (
								<label key={field} className="grid gap-2 font-medium">
									{fieldLabel(field)}
									{field === "description" ? (
										<Textarea
											name={field}
											dir="auto"
											rows={4}
											value={values[field] ?? ""}
											maxLength={10000}
											onChange={(e) => change(field, e.target.value)}
										/>
									) : (
										<Input
											name={field}
											dir="auto"
											required={index === 0}
											maxLength={500}
											value={values[field] ?? ""}
											onChange={(e) => change(field, e.target.value)}
										/>
									)}
								</label>
							))}
							{hasDates && (
								<>
									<div className="grid grid-cols-2 gap-3">
										{["start", "end"].map((field) => (
											<label key={field} className="grid gap-2 type-body">
												{fieldLabel(field)}
												<Input
													id={`career-${field}`}
													name={field}
													dir="ltr"
													placeholder="2024-03"
													pattern="[0-9]{4}(-(?:0[1-9]|1[0-2]))?"
													value={values[field] ?? ""}
													disabled={field === "end" && values.present === "true"}
													onChange={(e) => change(field, e.target.value)}
												/>
											</label>
										))}
									</div>
									<label className="flex min-h-11 items-center gap-2">
										<input
											type="checkbox"
											checked={values.present === "true"}
											onChange={(e) => {
												draft.setValue((previous) => ({
													...previous,
													review: false,
													values: {
														...previous.values,
														present: String(e.target.checked),
														...(e.target.checked ? { end: "" } : {}),
													},
												}));
											}}
										/>
										<Trans>Present</Trans>
									</label>
								</>
							)}
							<TaskOverlayFooter>
								{facts.length > 0 && (
									<Button variant="ghost" disabled={pending} onClick={() => setRemoving(true)}>
										<Trans>Remove entry</Trans>
									</Button>
								)}
								<Button variant="secondary" disabled={pending} onClick={onClose}>
									<Trans>Cancel</Trans>
								</Button>
								<Button type="submit" loading={pending} disabled={conflict}>
									<Trans>Review changes</Trans>
								</Button>
							</TaskOverlayFooter>
						</fieldset>
					</form>
				)}
				<p className="hidden type-metadata text-ink-3 sm:block">{copy("review.fact.approvalHint")}</p>
				<p role="status" className="type-metadata text-ink-3">
					{pending ? copy("editor.save.status.saving") : copy("editor.career.ownershipHint")}
				</p>
			</TaskOverlayContent>
		</TaskOverlay>
	);
}
