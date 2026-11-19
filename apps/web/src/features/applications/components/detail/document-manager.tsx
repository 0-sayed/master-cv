import type { Application } from "../../types";
import type { FileAttachment } from "../file-attachment-field";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { useInvalidateApplications } from "../../use-application-actions";
import { FileAttachmentField } from "../file-attachment-field";
import { ResumeVersionSelect } from "../resume-version-select";
import { useDialogStore } from "@/dialogs/store";
import { orpc } from "@/libs/orpc/client";

type DocumentManagerProps = {
	application: Application;
	disabled: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};
export function DocumentManager({ application, disabled, open, onOpenChange }: DocumentManagerProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{open && (
					<ManagerForm key={application.id} application={application} disabled={disabled} onOpenChange={onOpenChange} />
				)}
			</DialogContent>
		</Dialog>
	);
}

function ManagerForm({ application, disabled, onOpenChange }: Omit<DocumentManagerProps, "open">) {
	const id = useId();
	const navigate = useNavigate();
	const openDialog = useDialogStore((state) => state.openDialog);
	const invalidate = useInvalidateApplications();
	const [revision, setRevision] = useState(() => new Date(application.updatedAt).toISOString());
	const [resumeId, setResumeId] = useState(application.resumeId ?? "");
	const [letterId, setLetterId] = useState(application.coverLetterId ?? "");
	const [versionId, setVersionId] = useState(application.selectedResumeVersionId);
	const [resumeFile, setResumeFile] = useState<FileAttachment | File | null>(() =>
		application.resumeFileUrl
			? { url: application.resumeFileUrl, name: application.resumeFileName || t`Resume file` }
			: null,
	);
	const [letterFile, setLetterFile] = useState<FileAttachment | File | null>(() =>
		application.coverLetterUrl
			? { url: application.coverLetterUrl, name: application.coverLetterName || t`Cover letter file` }
			: null,
	);
	const [resumeFileChanged, setResumeFileChanged] = useState(false);
	const [letterFileChanged, setLetterFileChanged] = useState(false);
	const documents = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onError: () => invalidate(application.id),
	});
	const create = useMutation(orpc.coverLetters.create.mutationOptions());
	const submitting = useRef(false);
	const pending = disabled || update.isPending || create.isPending;
	const resumeLocked = Boolean(application.sentResumeVersionId || application.sentResumeRecordedAt);
	const letterLocked = Boolean(application.sentCoverLetterVersionId);
	const save = async () => {
		if (pending || submitting.current) return;
		submitting.current = true;
		try {
			await update.mutateAsync({
				id: application.id,
				expectedUpdatedAt: revision,
				...(!resumeLocked ? { resumeId: resumeId || null, selectedResumeVersionId: versionId } : {}),
				...(!letterLocked ? { coverLetterId: letterId || null } : {}),
				...(resumeFileChanged
					? resumeFile instanceof File
						? { resumeFile }
						: { resumeFileUrl: null, resumeFileName: null }
					: {}),
				...(letterFileChanged
					? letterFile instanceof File
						? { coverLetterFile: letterFile }
						: { coverLetterUrl: null, coverLetterName: null }
					: {}),
			});
			invalidate(application.id);
			onOpenChange(false);
		} catch {
			/* The alert retains all selections for recovery. */
		} finally {
			submitting.current = false;
		}
	};
	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<DialogHeader>
				<DialogTitle>
					<Trans>Manage documents</Trans>
				</DialogTitle>
				<DialogDescription>
					<Trans>Choose documents and attachments for this application. Recorded sent versions stay locked.</Trans>
				</DialogDescription>
			</DialogHeader>
			<label htmlFor={`${id}-resume`} className="type-label">
				<Trans>CV</Trans>
			</label>
			<NativeSelect
				id={`${id}-resume`}
				value={resumeId}
				disabled={pending || resumeLocked || documents.isPending || documents.isError}
				onChange={(event) => {
					setResumeId(event.target.value);
					setVersionId(null);
				}}
			>
				<option value="">{t`None`}</option>
				{resumeId && !documents.data?.some((doc) => doc.id === resumeId) && (
					<option value={resumeId}>{t`Linked resume`}</option>
				)}
				{documents.data
					?.filter((doc) => doc.type === "resume")
					.map((doc) => (
						<option key={doc.id} value={doc.id} dir="auto">
							{doc.name}
						</option>
					))}
			</NativeSelect>
			<ResumeVersionSelect
				resumeId={resumeId || null}
				value={versionId}
				disabled={pending || resumeLocked}
				onChange={setVersionId}
			/>
			{!resumeLocked && (
				<Button
					type="button"
					variant="secondary"
					disabled={pending}
					onClick={() => {
						onOpenChange(false);
						openDialog("document.new", { step: "copy", applicationId: application.id });
					}}
				>
					<Trans>Prepare a resume</Trans>
				</Button>
			)}
			<FileAttachmentField
				value={resumeFile}
				attachLabel={t`Attach a resume file (PDF)`}
				disabled={pending}
				onChange={(value) => {
					setResumeFile(value);
					setResumeFileChanged(true);
				}}
			/>
			<label htmlFor={`${id}-letter`} className="type-label">
				<Trans>Cover letter</Trans>
			</label>
			<NativeSelect
				id={`${id}-letter`}
				value={letterId}
				disabled={pending || letterLocked || documents.isPending || documents.isError}
				onChange={(event) => setLetterId(event.target.value)}
			>
				<option value="">{t`None`}</option>
				{letterId && !documents.data?.some((doc) => doc.id === letterId) && (
					<option value={letterId}>{t`Linked letter`}</option>
				)}
				{documents.data
					?.filter((doc) => doc.type === "letter")
					.map((doc) => (
						<option key={doc.id} value={doc.id} dir="auto">
							{doc.name}
						</option>
					))}
			</NativeSelect>
			{!letterLocked && (
				<Button
					type="button"
					variant="secondary"
					disabled={pending}
					loading={create.isPending}
					onClick={async () => {
						if (pending || submitting.current) return;
						submitting.current = true;
						try {
							const created = await create.mutateAsync({
								name: t`Cover letter — ${application.company}`.slice(0, 100),
								applicationId: application.id,
								documentLocale: "ar-SA",
								...(application.resumeId ? { resumeId: application.resumeId } : {}),
							});
							invalidate(application.id);
							onOpenChange(false);
							void navigate({ to: "/builder/letter/$coverLetterId", params: { coverLetterId: created.id } });
						} catch {
							/* Show the creation error below. */
						} finally {
							submitting.current = false;
						}
					}}
				>
					<Trans>Write a letter</Trans>
				</Button>
			)}
			<FileAttachmentField
				value={letterFile}
				attachLabel={t`Attach a cover letter file (PDF)`}
				disabled={pending}
				onChange={(value) => {
					setLetterFile(value);
					setLetterFileChanged(true);
				}}
			/>
			{documents.isError && (
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						<Trans>Documents could not load.</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Your selections remain unchanged.</Trans>
					</AlertDescription>
					<AlertActions>
						<Button type="button" variant="secondary" onClick={() => void documents.refetch()}>
							<Trans>Retry</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			{(update.error || create.error) && (
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						<Trans>Could not save documents.</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>
							Your selections are still here. Retry Save. If the record changed, review its latest revision first.
						</Trans>
					</AlertDescription>
					{new Date(application.updatedAt).toISOString() !== revision && (
						<AlertActions>
							<Button
								type="button"
								variant="secondary"
								onClick={() => setRevision(new Date(application.updatedAt).toISOString())}
							>
								<Trans>Use latest revision</Trans>
							</Button>
						</AlertActions>
					)}
				</Alert>
			)}
			<DialogFooter>
				<Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
					<Trans>Cancel</Trans>
				</Button>
				<Button type="submit" loading={update.isPending} disabled={pending || documents.isPending || documents.isError}>
					<Trans>Save</Trans>
				</Button>
			</DialogFooter>
		</form>
	);
}
