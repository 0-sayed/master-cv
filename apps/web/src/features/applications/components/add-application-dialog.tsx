import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { toast } from "@reactive-resume/ui/components/toast";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { cn } from "@reactive-resume/utils/style";
import { isHttpLink as isLink } from "../links";
import { useInvalidateApplications } from "../use-application-actions";
import { Combobox } from "@/components/ui/combobox";
import { useDialogStore } from "@/dialogs/store";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { client, orpc } from "@/libs/orpc/client";

type Parsed = RouterOutput["applications"]["ai"]["parsePosting"];
type Stage = "saved" | "applied" | "interview";

const STAGES: readonly Stage[] = ["saved", "applied", "interview"];
const MAX_POSTING_CHARS = 20_000;

type AddApplicationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdded: (id: string) => void;
};

/**
 * Add an application from a pasted link or posting. The posting is read (the page's own job data, or the AI
 * provider when one is set up) into role and company, which stay editable; the posting itself is saved with the
 * application for Check, the assistant and letters. Add, or Add and tailor a resume.
 */
export function AddApplicationDialog({ open, onOpenChange, onAdded }: AddApplicationDialogProps) {
	// A fresh form for every open, kept in place while the dialog animates closed.
	const [instance, setInstance] = useState(0);
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) setInstance((count) => count + 1);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent size="wide" className="flex min-h-0 flex-col overflow-hidden">
				<AddApplicationForm key={instance} onClose={() => onOpenChange(false)} onAdded={onAdded} />
			</DialogContent>
		</Dialog>
	);
}

type AddApplicationFormProps = { onClose: () => void; onAdded: (id: string) => void };

function AddApplicationForm({ onClose, onAdded }: AddApplicationFormProps) {
	const id = useId();
	const { data: webAccess } = useQuery({
		...orpc.webAccess.status.queryOptions(),
		enabled: isFeatureAvailable("jobSearch"),
	});
	const { data: documents } = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const [query, setQuery] = useState("");
	const search = useMutation(orpc.applications.ai.searchPostings.mutationOptions());
	const [input, setInput] = useState("");
	const [role, setRole] = useState("");
	const [company, setCompany] = useState("");
	const [stage, setStage] = useState<Stage>("saved");
	const [stageDate, setStageDate] = useState(() => new Date().toLocaleDateString("en-CA"));
	const [resumeId, setResumeId] = useState("");
	const [coverLetterId, setCoverLetterId] = useState("");
	const [location, setLocation] = useState("");
	const [salary, setSalary] = useState("");
	const [pasteOpen, setPasteOpen] = useState(false);
	const [pastedText, setPastedText] = useState("");
	const [expanded, setExpanded] = useState(false);
	const pasteRef = useRef<HTMLTextAreaElement>(null);
	const [description, setDescription] = useState<string | null>(null);
	const [reading, setReading] = useState<{ text: string; result: Parsed } | null>(null);
	const invalidate = useInvalidateApplications();
	const openDialog = useDialogStore((state) => state.openDialog);

	const controller = useRef<AbortController | null>(null);
	useEffect(() => () => controller.current?.abort(), []);
	const read = useMutation({
		...orpc.applications.ai.parsePosting.mutationOptions(),
		mutationFn: (value) =>
			client.applications.ai.parsePosting(value, controller.current ? { signal: controller.current.signal } : {}),
	});
	const resetRead = () => {
		controller.current?.abort();
		read.reset();
		setReading(null);
		setExpanded(false);
	};
	const create = useMutation(orpc.applications.create.mutationOptions());

	const text = (pasteOpen ? pastedText : input).trim();
	const sourceLink = isLink(input.trim()) ? input.trim() : null;
	const link = !pasteOpen && Boolean(sourceLink);
	const readable = isFeatureAvailable("jobSearch") && !pasteOpen && Boolean(sourceLink);
	const parsed = reading?.text === text ? reading.result : null;
	const clipped = Boolean(parsed?.postingSource.truncated || (!link && text.length > MAX_POSTING_CHARS));
	const readPosting = () => {
		if (!readable || read.isPending) return;
		const draft = { role, company, location, salary };
		const request = new AbortController();
		controller.current = request;
		read.mutate(
			{ input: text },
			{
				onSuccess: (result) => {
					if (request.signal.aborted) return;
					setReading({ text, result });
					setRole((current) => (current === draft.role ? result.role || current : current));
					setCompany((current) => (current === draft.company ? result.company || current : current));
					setLocation((current) => (current === draft.location ? result.location || current : current));
					setSalary((current) => (current === draft.salary ? result.salary || current : current));
					setDescription(result.jobDescription);
				},
				onError: () => {
					if (request.signal.aborted) return;
					setDescription(null);
					setReading(null);
					if (link) setPasteOpen(true);
				},
			},
		);
	};

	useEffect(() => {
		if (pasteOpen && read.error) pasteRef.current?.focus();
	}, [pasteOpen, read.error]);

	const validation = useSubmitValidation({
		[`${id}-role`]: !role.trim() ? t`Enter a job title.` : undefined,
		[`${id}-company`]: !company.trim() ? t`Enter a company name.` : undefined,
		[`${id}-date`]: stage !== "saved" && !stageDate ? t`Choose a valid date.` : undefined,
	});

	const add = async (tailor: boolean) => {
		if (!validation.validate() || create.isPending || read.isPending) return;
		const posting = {
			company: company.trim(),
			role: role.trim(),
			status: stage,
			...(location.trim() ? { location: location.trim() } : {}),
			...(salary.trim() ? { salary: salary.trim() } : {}),
			...(parsed?.requirements.length ? { requirements: parsed.requirements } : {}),
			...(sourceLink ? { sourceUrl: sourceLink } : {}),
			...(stage !== "saved" && stageDate ? { stageEnteredAt: stageDate } : {}),
			...(resumeId ? { resumeId } : {}),
			...(stage !== "saved" && coverLetterId ? { coverLetterId } : {}),
			jobDescription: (description ?? (!link ? text : "")).slice(0, MAX_POSTING_CHARS) || null,
			postingSource:
				parsed?.postingSource ??
				(!link && text
					? {
							method: "paste" as const,
							format: "text" as const,
							truncated: clipped,
							completeness: clipped ? ("incomplete" as const) : ("unknown" as const),
						}
					: null),
		};
		try {
			const applicationId = await create.mutateAsync(posting);
			invalidate();
			toast.add({ description: t`Added ${role.trim()} at ${company.trim()}` });
			onClose();
			if (tailor)
				openDialog("document.new", { step: "copy", applicationId, ...(resumeId ? { sourceResumeId: resumeId } : {}) });
			else onAdded(applicationId);
		} catch (error) {
			toast.add({
				type: "error",
				description: getOrpcErrorMessage(error, { fallback: t`Couldn't add the application.` }),
			});
		}
	};

	return (
		<form
			noValidate
			className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden"
			onSubmit={(event) => {
				event.preventDefault();
				void add(false);
			}}
		>
			<DialogHeader>
				<DialogTitle>
					<Trans>Save a job</Trans>
				</DialogTitle>
				<DialogDescription className="sr-only">
					<Trans>Paste a job link or posting, then check the role and company.</Trans>
				</DialogDescription>
			</DialogHeader>

			<div
				data-slot="job-dialog-body"
				className="grid min-h-0 min-w-0 gap-4 overflow-x-hidden overflow-y-auto overscroll-contain"
			>
				{isFeatureAvailable("jobSearch") && webAccess?.search && (
					<section className="grid gap-2" aria-labelledby={`${id}-search-label`}>
						<Label id={`${id}-search-label`} htmlFor={`${id}-search`}>
							<Trans>Search job postings</Trans>
						</Label>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Input
								id={`${id}-search`}
								value={query}
								maxLength={500}
								placeholder={t`Role, company or location`}
								onChange={(event) => {
									setQuery(event.target.value);
									search.reset();
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing) {
										event.preventDefault();
										if (query.trim().length >= 2 && !search.isPending) search.mutate({ query });
									}
								}}
							/>
							<Button
								type="button"
								variant="secondary"
								disabled={query.trim().length < 2 || search.isPending || create.isPending}
								onClick={() => search.mutate({ query })}
							>
								<Trans>Search</Trans>
							</Button>
						</div>
						{search.isPending && (
							<p className="text-xs text-ink-3" role="status">
								<Trans>Searching job postings…</Trans>
							</p>
						)}
						{search.error && (
							<p className="text-xs text-danger-text" role="alert">
								{getOrpcErrorMessage(search.error, {
									fallback: t`Job search failed. Try again or paste a posting link.`,
								})}
							</p>
						)}
						{search.data?.length === 0 && (
							<p className="text-xs text-ink-3" role="status">
								<Trans>No postings found. Try different keywords.</Trans>
							</p>
						)}
						{search.data && search.data.length > 0 && (
							<ul className="grid gap-2">
								{search.data.map((result) => (
									<li key={result.url} className="rounded-lg border border-line p-3">
										<strong className="text-sm font-medium">{result.title}</strong>
										<p className="line-clamp-2 text-xs text-ink-3">{result.description}</p>
										<div className="mt-2 flex items-center gap-3">
											<a
												href={result.url}
												target="_blank"
												rel="noreferrer"
												className="text-xs text-accent-text hover:underline"
											>
												<Trans>View posting</Trans>
											</a>
											<Button
												type="button"
												size="sm"
												variant="secondary"
												disabled={read.isPending || create.isPending}
												onClick={() => {
													setInput(result.url);
													setPasteOpen(false);
													setDescription(null);
													resetRead();
													setRole("");
													setCompany("");
													setLocation("");
													setSalary("");
													search.reset();
												}}
											>
												<Trans>Use posting</Trans>
											</Button>
										</div>
									</li>
								))}
							</ul>
						)}
					</section>
				)}

				{read.error && <ReadStatus text={text} link={link} pending={false} error={read.error} parsed={null} />}
				<Tabs
					value={pasteOpen ? "paste" : "link"}
					onValueChange={(value) => {
						setPasteOpen(value === "paste");
						setDescription(null);
						resetRead();
					}}
				>
					<TabsList aria-label={t`Job source`}>
						<TabsTrigger value="link">
							<Trans>Link</Trans>
						</TabsTrigger>
						<TabsTrigger value="paste">
							<Trans>Paste text</Trans>
						</TabsTrigger>
					</TabsList>
					<TabsContent value="link" className="min-w-0">
						<div className="grid min-w-0 gap-2">
							<Label htmlFor={`${id}-posting`}>
								<Trans>Job link</Trans>
							</Label>
							<div className="flex min-w-0 flex-col gap-2 sm:flex-row">
								<Input
									id={`${id}-posting`}
									type="url"
									value={input}
									maxLength={2000}
									placeholder="https://…"
									onChange={(event) => {
										setInput(event.target.value);
										setDescription(null);
										resetRead();
									}}
									autoFocus
								/>
								{isFeatureAvailable("jobSearch") && (
									<Button
										type="button"
										variant="secondary"
										disabled={!readable || read.isPending}
										loading={read.isPending}
										onClick={readPosting}
									>
										{read.isPending ? <Trans>Reading…</Trans> : <Trans>Read job</Trans>}
									</Button>
								)}
							</div>
						</div>
					</TabsContent>
					<TabsContent value="paste" className="min-w-0">
						<div className="grid min-w-0 gap-2">
							<Label htmlFor={`${id}-recovery`}>
								<Trans>Job description</Trans>
							</Label>
							<Textarea
								ref={pasteRef}
								id={`${id}-recovery`}
								rows={8}
								className="field-sizing-fixed"
								value={pastedText}
								onChange={(event) => {
									setPastedText(event.target.value);
									setDescription(null);
									resetRead();
								}}
							/>
							{sourceLink && (
								<p className="type-caption text-ink-3">
									<Trans>The original link stays with this job.</Trans>
								</p>
							)}
						</div>
					</TabsContent>
				</Tabs>
				<div className="grid min-w-0 gap-2">
					{(clipped || parsed?.postingSource.completeness === "incomplete") && (
						<p className="text-xs text-warn-text" role="alert">
							<Trans>
								This description is clipped or incomplete. Review it or paste the full description before preparing.
							</Trans>
						</p>
					)}
					{parsed?.enrichmentWarning && (
						<p className="text-xs text-warn-text" role="status">
							<Trans>AI couldn't fill the details. The posting is retained; complete the fields manually.</Trans>
						</p>
					)}
					{parsed?.postingSource.fallbackReason && (
						<p className="text-xs text-warn-text" role="status">
							<Trans>Enhanced reading was unavailable. The built-in reader retrieved this posting.</Trans>
						</p>
					)}
					{parsed && description !== null && (
						<section className="grid min-w-0 gap-2" aria-labelledby={`${id}-description-label`}>
							<h2 id={`${id}-description-label`} className="type-label">
								<Trans>Saved description</Trans>
							</h2>
							<p
								id={`${id}-description`}
								dir="auto"
								className={cn(
									"max-w-prose type-body wrap-anywhere whitespace-pre-wrap text-ink-2",
									!expanded && "line-clamp-6",
								)}
							>
								{description}
							</p>
							<Button
								type="button"
								variant="ghost"
								className="justify-self-start"
								aria-expanded={expanded}
								aria-controls={`${id}-description`}
								onClick={() => setExpanded((value) => !value)}
							>
								{expanded ? <Trans>Show less</Trans> : <Trans>Show all</Trans>}
							</Button>
						</section>
					)}

					{!read.error && <ReadStatus text={text} link={link} pending={read.isPending} error={null} parsed={parsed} />}
				</div>

				<div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-role`}>
							<Trans>Role</Trans>
							<span aria-hidden="true"> *</span>
						</Label>
						<Input
							dir="auto"
							id={`${id}-role`}
							aria-required
							aria-invalid={Boolean(validation.errors[`${id}-role`])}
							aria-describedby={`${id}-role-error`}
							value={role}
							onChange={(event) => setRole(event.target.value)}
						/>
						<FieldError id={`${id}-role-error`}>{validation.errors[`${id}-role`]}</FieldError>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-company`}>
							<Trans>Company</Trans>
							<span aria-hidden="true"> *</span>
						</Label>
						<Input
							dir="auto"
							id={`${id}-company`}
							aria-required
							aria-invalid={Boolean(validation.errors[`${id}-company`])}
							aria-describedby={`${id}-company-error`}
							value={company}
							onChange={(event) => setCompany(event.target.value)}
						/>
						<FieldError id={`${id}-company-error`}>{validation.errors[`${id}-company`]}</FieldError>
					</div>
				</div>

				<div className="grid min-w-0 gap-1.5">
					<Label htmlFor={`${id}-stage`}>
						<Trans>Stage</Trans>
					</Label>
					<Combobox
						id={`${id}-stage`}
						className="w-full"
						value={stage}
						onValueChange={(value) => {
							if (value) setStage(value);
						}}
						options={STAGES.map((value) => ({
							value,
							label: value === "saved" ? t`Saved` : value === "applied" ? t`Already applied` : t`Already interviewing`,
						}))}
					/>
				</div>

				<div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-location`}>
							<Trans>Location</Trans>
						</Label>
						<Input
							dir="auto"
							id={`${id}-location`}
							value={location}
							onChange={(event) => setLocation(event.target.value)}
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-salary`}>
							<Trans>Salary</Trans>
						</Label>
						<Input id={`${id}-salary`} value={salary} onChange={(event) => setSalary(event.target.value)} />
					</div>
				</div>
				{stage !== "saved" && (
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-date`}>
							<Trans>Application date</Trans>
							<span aria-hidden="true"> *</span>
						</Label>
						<Input
							id={`${id}-date`}
							aria-invalid={Boolean(validation.errors[`${id}-date`])}
							aria-describedby={`${id}-date-error`}
							type="date"
							value={stageDate}
							required
							onChange={(event) => setStageDate(event.target.value)}
						/>
						<FieldError id={`${id}-date-error`}>{validation.errors[`${id}-date`]}</FieldError>
					</div>
				)}
				<div className="grid gap-1.5">
					<Label htmlFor={`${id}-resume`}>
						{stage === "saved" ? <Trans>Resume (optional)</Trans> : <Trans>Resume submitted (optional)</Trans>}
					</Label>
					<Combobox
						id={`${id}-resume`}
						className="w-full"
						value={resumeId}
						onValueChange={(value) => setResumeId(value ?? "")}
						options={[
							{ value: "", label: t`None` },
							...(documents
								?.filter((document) => document.type === "resume")
								.map((document) => ({ value: document.id, label: document.name })) ?? []),
						]}
					/>
				</div>
				{stage !== "saved" && (
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-letter`}>
							<Trans>Cover letter submitted (optional)</Trans>
						</Label>
						<Combobox
							id={`${id}-letter`}
							className="w-full"
							value={coverLetterId}
							onValueChange={(value) => setCoverLetterId(value ?? "")}
							options={[
								{ value: "", label: t`None` },
								...(documents
									?.filter((document) => document.type === "letter")
									.map((document) => ({ value: document.id, label: document.name })) ?? []),
							]}
						/>
					</div>
				)}
			</div>
			<div className="grid shrink-0 gap-2 border-t border-line pt-4">
				{create.isPending && (
					<p id={`${id}-save-help`} role="status" className="type-caption text-ink-2">
						<Trans>Saving job…</Trans>
					</p>
				)}
				<DialogFooter>
					<Button type="button" variant="ghost" disabled={create.isPending} onClick={onClose}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						type="button"
						variant="secondary"
						loading={create.isPending}
						disabled={create.isPending}
						onClick={() => void add(false)}
					>
						{stage === "saved" ? <Trans>Save job</Trans> : <Trans>Record application</Trans>}
					</Button>
					<Button
						type="button"
						disabled={create.isPending}
						aria-describedby={create.isPending ? `${id}-save-help` : undefined}
						loading={create.isPending}
						onClick={() => void add(true)}
					>
						<Trans>Save and tailor CV</Trans>
					</Button>
				</DialogFooter>
			</div>
		</form>
	);
}

type ReadStatusProps = {
	text: string;
	link: boolean;
	pending: boolean;
	error: unknown;
	parsed: Parsed | null;
};

/** What reading the posting found, or why the fields need filling in by hand. */
function ReadStatus({ text, link, pending, error, parsed }: ReadStatusProps) {
	const base = "flex min-w-0 items-start gap-2 type-caption wrap-anywhere";

	if (pending) {
		return (
			<p className={cn(base, "text-ink-2")} role="status">
				{link ? <Trans>Reading the link…</Trans> : <Trans>Reading the posting…</Trans>}
			</p>
		);
	}
	if (error) {
		return (
			<Alert variant="warn" role="alert">
				<Icon name="warning-circle" />
				<AlertTitle>
					<Trans>Paste the job description instead</Trans>
				</AlertTitle>
				<AlertDescription>
					{getOrpcErrorMessage(error, {
						byCode: {
							POSTING_SIGN_IN_REQUIRED: t`This site needs you to be signed in. Paste the job description instead.`,
							POSTING_BLOCKED: t`This site blocked the job reader. Paste the job description instead.`,
							POSTING_UNREADABLE: t`That link couldn't be read. Paste the posting text instead.`,
						},
						fallback: t`The posting couldn't be read. Fill in the role and company.`,
					})}
				</AlertDescription>
			</Alert>
		);
	}

	if (!text) {
		return (
			<p className={cn(base, "text-ink-3")}>
				<Trans>We read the page and save the posting for Check, the assistant and your letter.</Trans>
			</p>
		);
	}
	if (parsed && (!parsed.role.trim() || !parsed.company.trim())) {
		return (
			<p className={cn(base, "text-warn-text")} role="status">
				<Icon name="warning-circle" size={16} className="shrink-0" />
				<Trans>Some job details couldn't be read. Fill in the role and company, or paste one job's posting text.</Trans>
			</p>
		);
	}
	if (parsed?.filledBy === "ai") {
		return (
			<p className={cn(base, "text-accent-text")} role="status">
				<Icon name="check-circle" size={16} className="shrink-0" />
				<Plural
					value={parsed.requirements.length}
					one="Found role, company and # requirement. Review the details before saving."
					other="Found role, company and # requirements. Review the details before saving."
				/>
			</p>
		);
	}
	if (parsed?.filledBy === "page") {
		return (
			<p className={cn(base, "text-accent-text")} role="status">
				<Icon name="check-circle" size={16} className="shrink-0" />
				<Trans>Found the role and company on the page. Review the details before saving.</Trans>
			</p>
		);
	}

	return (
		<p className={cn(base, "text-ink-3")}>
			<Trans>Fill in the role and company. The posting is saved with the application.</Trans>
		</p>
	);
}
