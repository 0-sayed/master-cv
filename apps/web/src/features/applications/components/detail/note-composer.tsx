import type { Application } from "../../types";
import type { useApplicationNotes } from "../application-notes";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { useInvalidateApplications } from "../../use-application-actions";
import { orpc } from "@/libs/orpc/client";

type NoteComposerProps = {
	application: Application;
	legacy: ReturnType<typeof useApplicationNotes>;
	mode: "new" | "legacy";
	onModeChange: (mode: "new" | "legacy") => void;
};

export function NoteComposer({ application, legacy, mode, onModeChange }: NoteComposerProps) {
	const id = useId();
	const [note, setNote] = useState("");
	const [invalid, setInvalid] = useState(false);
	const [validatedMode, setValidatedMode] = useState(mode);
	if (mode !== validatedMode) {
		setValidatedMode(mode);
		setInvalid(false);
	}
	const invalidate = useInvalidateApplications();
	const add = useMutation({
		...orpc.applications.addNote.mutationOptions(),
		onSuccess: () => invalidate(application.id),
	});
	const isLegacy = mode === "legacy";
	return (
		<form
			className="grid gap-3"
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				if (isLegacy) {
					void legacy.save();
					return;
				}
				if (!note.trim()) {
					setInvalid(true);
					return;
				}
				if (add.isPending) return;
				const sent = note;
				add.mutate(
					{ id: application.id, text: sent.trim() },
					{
						onSuccess: () => {
							setNote((current) => (current === sent ? "" : current));
							setInvalid(false);
						},
					},
				);
			}}
		>
			<label htmlFor={id} className="type-label">
				{isLegacy ? <Trans>Application note</Trans> : <Trans>Add a note</Trans>}
			</label>
			<Textarea
				id={id}
				dir="auto"
				rows={3}
				maxLength={5000}
				aria-invalid={invalid}
				aria-describedby={`${id}-error`}
				value={isLegacy ? legacy.value : note}
				onChange={(event) => {
					setInvalid(false);
					if (isLegacy) legacy.setValue(event.target.value);
					else setNote(event.target.value);
				}}
			/>
			<FieldError id={`${id}-error`}>{invalid ? t`Enter a note.` : undefined}</FieldError>
			<div className="flex flex-wrap gap-2">
				<Button
					type="submit"
					loading={isLegacy ? legacy.status === "saving" : add.isPending}
					disabled={isLegacy && legacy.status === "conflict"}
				>
					{isLegacy ? <Trans>Save application note</Trans> : <Trans>Add note</Trans>}
				</Button>
				{isLegacy && (
					<Button type="button" variant="secondary" onClick={() => onModeChange("new")}>
						<Trans>New note</Trans>
					</Button>
				)}
			</div>
			{isLegacy && (
				<span role="status" className="type-metadata text-ink-2">
					{legacy.status === "saving" ? (
						<Trans>Saving…</Trans>
					) : legacy.status === "acknowledged" ? (
						<Trans>Saved</Trans>
					) : legacy.status === "dirty" ? (
						<Trans>Unsaved changes</Trans>
					) : null}
				</span>
			)}
			{isLegacy && (legacy.status === "failed" || legacy.status === "conflict") && (
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						{legacy.status === "conflict" ? (
							<Trans>The notes changed. Reload before saving your draft.</Trans>
						) : (
							<Trans>Could not save the notes.</Trans>
						)}
					</AlertTitle>
					<AlertDescription>
						<Trans>Your draft remains available.</Trans>
					</AlertDescription>
					<AlertActions>
						{legacy.status === "conflict" ? (
							<>
								<Button type="button" variant="secondary" onClick={legacy.discardDraft}>
									<Trans>Discard draft</Trans>
								</Button>
								<Button type="button" variant="secondary" onClick={legacy.keepMyChanges}>
									<Trans>Keep my changes</Trans>
								</Button>
							</>
						) : (
							<Button type="button" variant="secondary" onClick={() => void legacy.save()}>
								<Trans>Retry save</Trans>
							</Button>
						)}
					</AlertActions>
				</Alert>
			)}
			{!isLegacy && add.error && (
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						<Trans>Could not add the note.</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Your text is still here. Retry Add note.</Trans>
					</AlertDescription>
				</Alert>
			)}
		</form>
	);
}
