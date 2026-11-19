import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { client, orpc } from "@/libs/orpc/client";

export function CareerProfileDetails({ master }: { master: CareerMaster }) {
	const formId = useId();
	const [editing, setEditing] = useState(false);
	const [contact, setContact] = useState(master.contact ?? { name: "", email: "", phone: "", location: "" });
	const [summary, setSummary] = useState(master.summary ?? "");
	const [revision, setRevision] = useState(master.profileRevision);
	const cache = useQueryClient();
	const save = useMutation({
		mutationFn: () => client.career.master.saveDetails({ contact, summary, expectedProfileRevision: revision }),
		onSuccess: async () => {
			await cache.invalidateQueries({ queryKey: orpc.career.master.read.key() });
			setEditing(false);
		},
	});
	const fields = { name: t`Name`, email: t`Email address`, phone: t`Phone`, location: t`Location` };
	const beginEdit = () => {
		if (save.isPending) return;
		save.reset();
		setRevision(master.profileRevision);
		setContact(master.contact ?? { name: "", email: "", phone: "", location: "" });
		setSummary(master.summary ?? "");
		setEditing(true);
	};
	return (
		<SectionCard>
			<SectionCardHeader className="justify-between">
				<h2 id="career-heading-contact" className="scroll-mt-(--app-toolbar-height) type-section">
					<Trans>Contact details</Trans>
				</h2>
				<Button
					variant="secondary"
					disabled={save.isPending}
					onClick={() => {
						if (editing) setEditing(false);
						else beginEdit();
					}}
				>
					<Icon name="pencil" />
					<Trans>Edit</Trans>
				</Button>
			</SectionCardHeader>
			{editing ? (
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (save.isPending) return;
						save.mutate();
					}}
				>
					<fieldset disabled={save.isPending} className="grid gap-4">
						{(Object.keys(fields) as (keyof typeof fields)[]).map((field) => (
							<label htmlFor={`${formId}-${field}`} className="grid gap-1 type-label" key={field}>
								{fields[field]}
								<Input
									id={`${formId}-${field}`}
									dir="auto"
									type={field === "email" ? "email" : field === "phone" ? "tel" : "text"}
									maxLength={field === "location" ? 300 : field === "email" ? 254 : field === "phone" ? 100 : 200}
									value={contact[field]}
									onChange={(event) => setContact({ ...contact, [field]: event.target.value })}
								/>
							</label>
						))}
						<label htmlFor={`${formId}-summary`} className="grid gap-1 type-label">
							<span id="career-heading-summary">
								<Trans>Summary</Trans>
							</span>
							<Textarea
								id={`${formId}-summary`}
								dir="auto"
								maxLength={4000}
								value={summary}
								onChange={(event) => setSummary(event.target.value)}
							/>
						</label>
						{save.isError && (
							<p role="alert" className="type-body text-danger-text">
								<Trans>Could not save. Reload the record and try again.</Trans>
							</p>
						)}
						<div className="flex justify-end gap-2">
							<Button variant="secondary" onClick={() => setEditing(false)}>
								<Trans>Cancel</Trans>
							</Button>
							<Button type="submit" loading={save.isPending}>
								<Trans>Save</Trans>
							</Button>
						</div>
					</fieldset>
				</form>
			) : (
				<div className="space-y-3">
					<p dir="auto" className="type-body whitespace-pre-line">
						{Object.values(master.contact ?? {})
							.filter(Boolean)
							.join(" · ") || t`Add contact details`}
					</p>
					<h3 id="career-heading-summary" className="scroll-mt-(--app-toolbar-height) type-label">
						<Trans>Summary</Trans>
					</h3>
					<p dir="auto" className="type-body whitespace-pre-line text-ink-2">
						{master.summary || (
							<Button variant="secondary" onClick={beginEdit}>
								<Trans>Add a summary</Trans>
							</Button>
						)}
					</p>
				</div>
			)}
		</SectionCard>
	);
}
