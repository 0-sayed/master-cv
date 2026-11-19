import type { Application } from "../types";
import type { InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@reactive-resume/ui/components/collapsible";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogFooter,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Input } from "@reactive-resume/ui/components/input";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { SectionCard, SectionCardTitle } from "@reactive-resume/ui/components/section-card";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { getClosedReasonLabel, getStageLabel, PIPELINE } from "../stages";
import { useApplicationActions, useInvalidateApplications } from "../use-application-actions";
import { ApplicationFormSheet } from "./application-form-sheet";
import { ApplicationWriteBoundary } from "./application-write-boundary";
import { Activity } from "./detail/activity";
import { CloseDialog } from "./detail/close-dialog";
import { NextStepCard } from "./detail/next-step-card";
import { ApplicationProperties } from "./detail/properties";
import { SentDocuments } from "./detail/sent-documents";
import { InterviewDialog } from "./interview-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { RecordLayout } from "@/components/layout/record-layout";
import { QuerySkeleton } from "@/components/query-skeleton";
import { defaultWorkspaceTab } from "@/features/career/workspace/shell";
import { useConfirm } from "@/hooks/use-confirm";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { orpc } from "@/libs/orpc/client";

export function ApplicationDetailPage({ applicationId }: { applicationId: string }) {
	const navigate = useNavigate();
	const [editing, setEditing] = useState(false);
	const query = useQuery(orpc.applications.getById.queryOptions({ input: { id: applicationId } }));
	const back = () => void navigate({ to: "/dashboard/applications" });
	if (query.isPending) return <QuerySkeleton shape="form" />;
	if (!query.data)
		return (
			<>
				<PageHeader title={<Trans>Applications</Trans>} />
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						{query.error && "code" in query.error && query.error.code === "NOT_FOUND" ? (
							<Trans>Application not found</Trans>
						) : (
							<Trans>This application couldn't be opened.</Trans>
						)}
					</AlertTitle>
					<AlertDescription>
						<Trans>Return to applications or try again.</Trans>
					</AlertDescription>
					<AlertActions>
						<BackNavigation render={<Link to="/dashboard/applications" />}>
							<Trans>Back to applications</Trans>
						</BackNavigation>
						<Button variant="secondary" onClick={() => void query.refetch()}>
							<Trans>Retry</Trans>
						</Button>
					</AlertActions>
				</Alert>
			</>
		);
	return (
		<>
			{query.isError && (
				<Alert variant="error">
					<Icon name="warning" />
					<AlertTitle>
						<Trans>This application could not be refreshed.</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Your saved content is still visible. Retry before making changes.</Trans>
					</AlertDescription>
					<AlertActions>
						<Button variant="secondary" onClick={() => void query.refetch()}>
							<Trans>Retry</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			<ApplicationWriteBoundary readOnly={query.isError}>
				<Detail key={query.data.id} application={query.data} onEditDetails={() => setEditing(true)} onDeleted={back} />
				<ApplicationFormSheet application={query.data} open={editing} onOpenChange={setEditing} />
			</ApplicationWriteBoundary>
		</>
	);
}

type DetailProps = {
	application: Application;
	onEditDetails: (application: Application) => void;
	onDeleted: () => void;
};

function Detail({ application, onEditDetails, onDeleted }: DetailProps) {
	const confirm = useConfirm();
	const { moveTo, close, update, remove } = useApplicationActions();
	const [interview, setInterview] = useState<{ open: boolean; entry: InterviewTimelineEntry | null }>({
		open: false,
		entry: null,
	});
	const [closing, setClosing] = useState(false);
	const [postingOpen, setPostingOpen] = useState(false);
	const [applying, setApplying] = useState(false);

	const closed = application.status === "closed";
	if (closed && closing) setClosing(false);

	const onDelete = async () => {
		const confirmed = await confirm(t`Delete this application?`, {
			description: t`“${application.role} · ${application.company}” and its timeline are deleted permanently. This can't be undone.`,
			confirmText: t`Delete`,
		});
		if (!confirmed) return;
		remove.mutate({ id: application.id }, { onSuccess: onDeleted });
	};

	return (
		<>
			<PageHeader
				layout="record"
				titleVariant="functional"
				title={<span dir="auto">{application.role}</span>}
				description={<span dir="auto">{[application.company, application.location].filter(Boolean).join(" · ")}</span>}
				back={
					<BackNavigation render={<Link to="/dashboard/applications" />}>
						<Trans>Back to applications</Trans>
					</BackNavigation>
				}
				actions={
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<IconButton icon="dots-three" label={t`Application options`} className="text-ink-3" />}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEditDetails(application)}>
								<Icon name="pencil-simple" size={18} />
								<Trans>Edit details…</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={update.isPending}
								onClick={() => (closed ? moveTo(application, "applied") : setClosing(true))}
							>
								{closed ? <Trans>Reopen</Trans> : <Trans>Close application…</Trans>}
							</DropdownMenuItem>
							{(application.sourceUrl || application.jobDescription) && (
								<DropdownMenuItem onClick={() => setPostingOpen(true)}>
									<Trans>Posting</Trans>
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onClick={onDelete}>
								<Icon name="trash" size={18} />
								<Trans>Delete…</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				}
			/>
			<div className="flex flex-wrap items-center gap-3">
				{closed ? (
					<>
						<strong className="type-label">
							<Trans>Closed</Trans>
						</strong>
						<span className="type-body text-ink-2">
							{application.closedReason ? (
								getClosedReasonLabel(application.closedReason)
							) : (
								<Trans>Reason not recorded</Trans>
							)}
						</span>
					</>
				) : (
					<>
						<NativeSelect
							fit="content"
							aria-label={t`Application stage`}
							disabled={update.isPending || remove.isPending}
							value={application.status}
							onChange={(event) => {
								const stage = event.target.value as (typeof PIPELINE)[number];
								if (stage === application.status) return;
								if (application.status === "saved" && stage === "applied") setApplying(true);
								else moveTo(application, stage);
							}}
						>
							{PIPELINE.map((stage) => (
								<option key={stage} value={stage}>
									{getStageLabel(stage)}
								</option>
							))}
						</NativeSelect>
						<span className="type-metadata text-ink-2">
							<Trans context="application.status.active">Active</Trans>
						</span>
					</>
				)}
			</div>
			<NextStepCard
				application={application}
				onReopen={() => moveTo(application, "applied")}
				onScheduleInterview={(entry) => setInterview({ open: true, entry })}
			/>
			<nav aria-label={t`On this page`} className="flex flex-wrap gap-4 type-label">
				<a href="#application-activity" onClick={() => document.getElementById("application-activity")?.focus()}>
					<Trans>Jump to Activity</Trans>
				</a>
				<a href="#application-sent" onClick={() => document.getElementById("application-sent")?.focus()}>
					<Trans>Jump to Documents</Trans>
				</a>
			</nav>
			<RecordLayout
				main={
					<>
						<SectionCard aria-labelledby="application-summary">
							<Collapsible>
								<CollapsibleTrigger variant="heading">
									<SectionCardTitle as="h2" id="application-summary">
										<Trans>Job summary</Trans>
									</SectionCardTitle>
									<Icon name="caret-down" />
								</CollapsibleTrigger>
								<CollapsibleContent className="grid gap-3 pt-3">
									{application.jobDescription ? (
										<p dir="auto" className="type-body whitespace-pre-wrap text-ink-2">
											{application.jobDescription}
										</p>
									) : (
										<p className="type-body text-ink-3">
											<Trans>No job description saved.</Trans>
										</p>
									)}
									<Button
										variant="secondary"
										onClick={() =>
											application.jobDescription || application.sourceUrl
												? setPostingOpen(true)
												: onEditDetails(application)
										}
									>
										{application.jobDescription || application.sourceUrl ? (
											<Trans>View full posting</Trans>
										) : (
											<Trans>Edit details…</Trans>
										)}
									</Button>
								</CollapsibleContent>
							</Collapsible>
						</SectionCard>
						<Activity application={application} onOpenInterview={(entry) => setInterview({ open: true, entry })} />
					</>
				}
				properties={<ApplicationProperties application={application} />}
				documents={<SentDocuments application={application} disabled={remove.isPending} />}
				preparation={isFeatureAvailable("interviews") ? <OpenWorkspaceButton application={application} /> : undefined}
			/>

			<CloseDialog
				open={closing}
				onOpenChange={setClosing}
				pending={update.isPending}
				error={update.variables?.status === "closed" ? update.error : null}
				waitForAcknowledgement
				onClose={(reason) => close(application, reason)}
			/>
			<InterviewDialog
				application={application}
				interview={interview.entry}
				open={interview.open}
				onOpenChange={(open) => setInterview((currentValue) => ({ ...currentValue, open }))}
			/>
			<PostingDialog application={application} open={postingOpen} onOpenChange={setPostingOpen} />
			{applying && <MarkAppliedDialog application={application} onClose={() => setApplying(false)} />}
		</>
	);
}

type PostingDialogProps = { application: Application; open: boolean; onOpenChange: (open: boolean) => void };

type MarkAppliedDialogProps = { application: Application; onClose: () => void };

function MarkAppliedDialog({ application, onClose }: MarkAppliedDialogProps) {
	const id = useId();
	const invalidate = useInvalidateApplications();
	const [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
	const validation = useSubmitValidation({ [`${id}-date`]: !date ? t`Choose a date.` : undefined });
	const [resumeId, setResumeId] = useState(application.resumeId ?? "");
	const [coverLetterId, setCoverLetterId] = useState(application.coverLetterId ?? "");
	const [resumeFileSent, setResumeFileSent] = useState(true);
	const [letterFileSent, setLetterFileSent] = useState(true);
	const { data: documents } = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onSuccess: () => {
			invalidate(application.id);
			onClose();
		},
	});
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent>
				<form
					noValidate
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!validation.validate() || update.isPending) return;
						update.mutate({
							expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
							id: application.id,
							status: "applied",
							stageEnteredAt: date,
							resumeId: resumeId || null,
							coverLetterId: coverLetterId || null,
							...(!resumeFileSent ? { resumeFileUrl: null, resumeFileName: null } : {}),
							...(!letterFileSent ? { coverLetterUrl: null, coverLetterName: null } : {}),
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>
							<Trans>Mark as applied</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Confirm submission and choose the documents you actually sent. Their current versions will be saved.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-1.5">
						<label htmlFor={`${id}-date`}>
							<Trans>Application date</Trans>
							<span aria-hidden="true"> *</span>
						</label>
						<Input
							id={`${id}-date`}
							type="date"
							aria-required
							aria-invalid={!!validation.errors[`${id}-date`]}
							aria-describedby={`${id}-date-error`}
							value={date}
							onChange={(event) => setDate(event.target.value)}
						/>
						<FieldError id={`${id}-date-error`}>{validation.errors[`${id}-date`]}</FieldError>
					</div>
					<div className="grid gap-1.5">
						<label htmlFor={`${id}-resume`}>
							<Trans>Resume submitted (optional)</Trans>
						</label>
						<NativeSelect id={`${id}-resume`} value={resumeId} onChange={(event) => setResumeId(event.target.value)}>
							<option value="">{t`None`}</option>
							{documents
								?.filter((document) => document.type === "resume")
								.map((document) => (
									<option key={document.id} value={document.id}>
										{document.name}
									</option>
								))}
						</NativeSelect>
					</div>
					<div className="grid gap-1.5">
						<label htmlFor={`${id}-letter`}>
							<Trans>Cover letter submitted (optional)</Trans>
						</label>
						<NativeSelect
							id={`${id}-letter`}
							value={coverLetterId}
							onChange={(event) => setCoverLetterId(event.target.value)}
						>
							<option value="">{t`None`}</option>
							{documents
								?.filter((document) => document.type === "letter")
								.map((document) => (
									<option key={document.id} value={document.id}>
										{document.name}
									</option>
								))}
						</NativeSelect>
					</div>
					{application.resumeFileUrl && (
						<label className="flex items-center gap-2 type-body">
							<Checkbox checked={resumeFileSent} onCheckedChange={(checked) => setResumeFileSent(checked === true)} />
							<Trans>Submitted attached resume: {application.resumeFileName ?? "PDF"}</Trans>
						</label>
					)}
					{application.coverLetterUrl && (
						<label className="flex items-center gap-2 type-body">
							<Checkbox checked={letterFileSent} onCheckedChange={(checked) => setLetterFileSent(checked === true)} />
							<Trans>Submitted attached cover letter: {application.coverLetterName ?? "PDF"}</Trans>
						</label>
					)}
					{update.error && (
						<p role="alert" className="type-body text-danger-text">
							{getOrpcErrorMessage(update.error, { fallback: t`Couldn't record submission. Try again.` })}
						</p>
					)}
					<DialogFooter>
						<DialogClose render={<Button type="button" variant="secondary" />}>
							<Trans>Cancel</Trans>
						</DialogClose>
						<Button type="submit" disabled={update.isPending} loading={update.isPending}>
							<Trans>Confirm applied</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** The saved posting: its link, what it asks for, and its text. */
function PostingDialog({ application, open, onOpenChange }: PostingDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle dir="auto">
						{application.role} · {application.company}
					</DialogTitle>
					<DialogDescription>
						{application.sourceUrl ? (
							<a
								href={application.sourceUrl}
								target="_blank"
								rel="noreferrer"
								className="text-accent-text hover:underline"
							>
								{application.sourceUrl}
							</a>
						) : (
							<Trans>The posting saved with this application.</Trans>
						)}
					</DialogDescription>
				</DialogHeader>
				{application.postingSource && (
					<p className="type-metadata text-ink-3">
						{application.postingSource.method === "paste" ? (
							<Trans>Pasted description</Trans>
						) : (
							<Trans>
								Retrieved {application.postingSource.retrievedAt} using {application.postingSource.method}. Retrieval
								time does not establish origin freshness.
							</Trans>
						)}
					</p>
				)}
				{(application.postingSource?.truncated || application.postingSource?.completeness === "incomplete") && (
					<p className="type-metadata text-warn-text" role="alert">
						<Trans>This saved description is clipped or incomplete. Review before preparing documents.</Trans>
					</p>
				)}
				{application.requirements.length > 0 && (
					<section aria-labelledby="posting-requirements" className="grid gap-2">
						<h3 id="posting-requirements" className="type-label text-ink-3 uppercase">
							<Trans>What it asks for</Trans>
						</h3>
						<ul className="flex flex-wrap gap-1.5">
							{application.requirements.map((requirement) => (
								<li key={requirement} dir="auto" className="rounded-md bg-sunken px-2 py-1 type-metadata">
									{requirement}
								</li>
							))}
						</ul>
					</section>
				)}
				{application.jobDescription && (
					<p dir="auto" className="type-body whitespace-pre-wrap text-ink-2">
						{application.jobDescription}
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Opens the application's workspace on the tab for its stage. */
function OpenWorkspaceButton({ application }: { application: Application }) {
	const navigate = useNavigate();
	return (
		<Button
			className="ms-auto"
			onClick={() =>
				void navigate({
					to: "/dashboard/applications/$applicationId/{-$tab}",
					params: { applicationId: application.id, tab: defaultWorkspaceTab(application, new Date()) },
				})
			}
		>
			<Icon name="arrow-right" size={18} />
			<Trans>Open workspace</Trans>
		</Button>
	);
}
