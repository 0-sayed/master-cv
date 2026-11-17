import type { Application } from "../types";
import type { InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import {
	Dialog,
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
import { Input } from "@reactive-resume/ui/components/input";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { toast } from "@reactive-resume/ui/components/toast";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { cn } from "@reactive-resume/utils/style";
import { daysInStage } from "../next-step";
import { getClosedReasonLabel, getNextStage, getStageColor, getStageLabel, PIPELINE } from "../stages";
import { useApplicationActions, useInvalidateApplications } from "../use-application-actions";
import { ApplicationFormSheet } from "./application-form-sheet";
import { ApplicationNotes } from "./application-notes";
import { Activity } from "./detail/activity";
import { CloseDialog } from "./detail/close-dialog";
import { Contacts } from "./detail/contacts";
import { NextStepCard } from "./detail/next-step-card";
import { SentDocuments } from "./detail/sent-documents";
import { InterviewDialog } from "./interview-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { defaultWorkspaceTab } from "@/features/career/workspace/shell";
import { useConfirm } from "@/hooks/use-confirm";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { isImeComposing } from "@/libs/keyboard";
import { formatInterfaceDate } from "@/libs/locale";
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
						<Trans>This application couldn't be opened.</Trans>
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
			<Detail key={query.data.id} application={query.data} onEditDetails={() => setEditing(true)} onDeleted={back} />
			<ApplicationFormSheet application={query.data} open={editing} onOpenChange={setEditing} />
		</>
	);
}

type DetailProps = {
	application: Application;
	onEditDetails: (application: Application) => void;
	onDeleted: () => void;
};

function Detail({ application, onEditDetails, onDeleted }: DetailProps) {
	const { i18n } = useLingui();
	const confirm = useConfirm();
	const { moveTo, close, remove } = useApplicationActions();
	const [interview, setInterview] = useState<{ open: boolean; entry: InterviewTimelineEntry | null }>({
		open: false,
		entry: null,
	});
	const [closing, setClosing] = useState(false);
	const [postingOpen, setPostingOpen] = useState(false);
	const [applying, setApplying] = useState(false);

	const next = getNextStage(application.status);
	const reached = PIPELINE.indexOf(application.status);
	const since = daysInStage(application);
	const closed = application.status === "closed";

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
							render={
								<Button size="icon-sm" variant="ghost" aria-label={t`Application options`} className="text-ink-3" />
							}
						>
							<Icon name="dots-three" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEditDetails(application)}>
								<Icon name="pencil-simple" size={18} />
								<Trans>Edit details…</Trans>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onClick={onDelete}>
								<Icon name="trash" size={18} />
								<Trans>Delete…</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				}
			/>
			<div className="grid min-w-0 items-start gap-6 lg:grid-cols-2" data-slot="application-detail-columns">
				<div className="grid min-w-0 gap-6">
					<div className="grid gap-2.5">
						<ol aria-label={t`Stages`} className="grid grid-cols-5 gap-1.5">
							{PIPELINE.map((stage, index) => (
								<li key={stage}>
									<button
										type="button"
										aria-current={stage === application.status ? "step" : undefined}
										onClick={() => {
											if (stage === application.status) return;
											if (application.status === "saved" && stage === "applied") setApplying(true);
											else moveTo(application, stage);
										}}
										className="grid w-full gap-1.5 text-start"
									>
										<span
											className="h-1.5 rounded-full transition-colors duration-standard"
											style={{
												background: !closed && index <= reached ? getStageColor(stage) : "var(--line)",
											}}
										/>
										<span
											className={cn("truncate type-label", stage === application.status ? "text-ink" : "text-ink-3")}
										>
											{getStageLabel(stage)}
										</span>
									</button>
								</li>
							))}
						</ol>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="flex items-center gap-1.5 type-body">
								<span
									aria-hidden="true"
									className="size-2 rounded-full"
									style={{ background: getStageColor(application.status) }}
								/>
								<strong className="type-label">{getStageLabel(application.status)}</strong>
								<span className="text-ink-3">
									{closed && application.closedReason ? (
										<>· {getClosedReasonLabel(application.closedReason)}</>
									) : (
										<>
											· <Plural value={since} _0="since today" one="for # day" other="for # days" />
										</>
									)}
								</span>
							</span>
							{next && !closed && (
								<Button
									size="sm"
									variant="secondary"
									onClick={() => (application.status === "saved" ? setApplying(true) : moveTo(application, next))}
								>
									{application.status === "saved" ? (
										<Trans>Mark as applied</Trans>
									) : (
										<Trans>Move to {getStageLabel(next)}</Trans>
									)}
									<Icon name="arrow-right" size={16} />
								</Button>
							)}
						</div>
					</div>

					<NextStepCard
						application={application}
						onScheduleInterview={(entry) => setInterview({ open: true, entry })}
					/>
					<SentDocuments application={application} disabled={remove.isPending} />
					<Facts application={application} locale={i18n.locale} />
				</div>
				<div className="grid min-w-0 gap-6">
					<Tags application={application} />
					<ApplicationNotes application={application} />
					<Activity application={application} onOpenInterview={(entry) => setInterview({ open: true, entry })} />
				</div>
			</div>

			<footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3">
				{!closed ? (
					<>
						<Button variant="secondary" onClick={() => setClosing(true)}>
							<Trans>Close application…</Trans>
						</Button>
						{(application.sourceUrl || application.jobDescription) && (
							<Button variant="ghost" onClick={() => setPostingOpen(true)}>
								<Trans>Posting</Trans>
								<Icon name="arrow-square-out" size={16} />
							</Button>
						)}
						{isFeatureAvailable("interviews") && <OpenWorkspaceButton application={application} />}
					</>
				) : (
					<Button variant="secondary" onClick={() => moveTo(application, "applied")}>
						<Trans>Reopen</Trans>
					</Button>
				)}
			</footer>

			<CloseDialog open={closing} onOpenChange={setClosing} onClose={(reason) => close(application, reason)} />
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

/** Salary, Source, Applied and Contact. Salary and source edit in place. */
function Facts({ application, locale }: { application: Application; locale: string }) {
	const invalidate = useInvalidateApplications();
	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onSuccess: () => invalidate(application.id),
		onError: () => toast.add({ type: "error", description: t`Couldn't save.` }),
	});
	const applied = formatInterfaceDate(application.appliedAt, locale, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return (
		<dl className="grid grid-cols-2 gap-x-4 gap-y-3">
			<InlineFact
				label={t`Salary`}
				value={application.salary}
				onSave={(salary) =>
					update.mutate({
						expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
						id: application.id,
						salary,
					})
				}
			/>
			<InlineFact
				label={t`Source`}
				value={application.source}
				onSave={(source) =>
					update.mutate({
						expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
						id: application.id,
						source,
					})
				}
			/>
			<div className="grid gap-0.5">
				<dt className="type-label text-ink-3 uppercase">
					<Trans>Applied</Trans>
				</dt>
				<dd className="type-body">{application.status === "saved" ? "—" : applied}</dd>
			</div>
			<div className="grid gap-0.5">
				<dt className="type-label text-ink-3 uppercase">
					<Trans>Contact</Trans>
				</dt>
				<dd className="min-w-0">
					<Contacts
						contacts={application.contacts}
						disabled={update.isPending}
						onChange={(contacts) =>
							update.mutate({
								expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
								id: application.id,
								contacts,
							})
						}
					/>
				</dd>
			</div>
		</dl>
	);
}

type InlineFactProps = { label: string; value: string | null; onSave: (value: string | null) => void };

/** A fact that edits in place: click to type, Enter or leaving saves, Esc cancels. */
function InlineFact({ label, value, onSave }: InlineFactProps) {
	const id = useId();
	const [draft, setDraft] = useState<string | null>(null);

	const commit = () => {
		if (draft === null) return;
		const next = draft.trim() || null;
		if (next !== (value ?? null)) onSave(next);
		setDraft(null);
	};

	return (
		<div className="grid gap-0.5">
			<dt className="type-label text-ink-3 uppercase">
				<label htmlFor={id}>{label}</label>
			</dt>
			<dd>
				{draft === null ? (
					<button
						id={id}
						type="button"
						onClick={() => setDraft(value ?? "")}
						className="w-full truncate rounded-md text-start type-body hover:bg-hover"
					>
						{value || "—"}
					</button>
				) : (
					<Input
						id={id}
						autoFocus
						value={draft}
						size="sm"
						onChange={(event) => setDraft(event.target.value)}
						onBlur={commit}
						onKeyDown={(event) => {
							if (isImeComposing(event)) return;
							if (event.key === "Enter") commit();
							if (event.key === "Escape") {
								event.stopPropagation();
								setDraft(null);
							}
						}}
					/>
				)}
			</dd>
		</div>
	);
}

function Tags({ application }: { application: Application }) {
	const invalidate = useInvalidateApplications();
	const [tag, setTag] = useState("");
	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onSuccess: () => invalidate(application.id),
		onError: () => toast.add({ type: "error", description: t`Couldn't save the tags.` }),
	});
	const save = (tags: string[]) =>
		update.mutate({ expectedUpdatedAt: new Date(application.updatedAt).toISOString(), id: application.id, tags });

	return (
		<section aria-labelledby="application-tags" className="grid gap-2">
			<h3 id="application-tags" className="type-label text-ink-3 uppercase">
				<Trans>Tags</Trans>
			</h3>
			<div className="flex flex-wrap items-center gap-1.5">
				{application.tags.map((value) => (
					<span key={value} className="flex h-7 items-center gap-1 rounded-md bg-sunken ps-2 type-metadata">
						{value}
						<button
							type="button"
							aria-label={t`Remove ${value}`}
							onClick={() => save(application.tags.filter((item) => item !== value))}
							className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink"
						>
							<Icon name="x" size={14} />
						</button>
					</span>
				))}
				<form
					onSubmit={(event) => {
						event.preventDefault();
						const value = tag.trim();
						if (!value || application.tags.includes(value)) return setTag("");
						save([...application.tags, value]);
						setTag("");
					}}
				>
					<Input
						aria-label={t`Add a tag`}
						placeholder={t`Add a tag`}
						value={tag}
						size="sm"
						className="w-28"
						onChange={(event) => setTag(event.target.value)}
					/>
				</form>
			</div>
		</section>
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
						<Button type="button" variant="secondary" onClick={onClose}>
							<Trans>Cancel</Trans>
						</Button>
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
