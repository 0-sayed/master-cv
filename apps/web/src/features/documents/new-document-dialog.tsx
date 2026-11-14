import type { ImportKind } from "@/features/resume/import/read-file";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { ActionChoice } from "@reactive-resume/ui/components/action-choice";
import { Alert, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { toast } from "@reactive-resume/ui/components/toast";
import { generateRandomName } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";
import { StartCvDialog } from "../resume/import/start";
import { isBaseCvLimit } from "./creation-error";
import { useNewDocumentsStore } from "./new-documents";
import { useDialogStore } from "@/dialogs/store";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { detectImportKind, ImportError, readResumeFile, summarizeImport } from "@/features/resume/import/read-file";
import { AiProviderLoadState } from "@/features/settings/integrations/ai-provider-load-state";
import { useHasUsableAiProvider } from "@/features/settings/integrations/hooks/use-has-usable-ai-provider";
import { getOrpcErrorMessage, getResumeErrorMessage } from "@/libs/error-message";
import { formatRelativeTime } from "@/libs/locale";
import { ENTER_CLASS, POP_CLASS } from "@/libs/motion";
import { client, orpc } from "@/libs/orpc/client";

export type NewDocumentDialogData = {
	/** Open on a step other than the three choices. */
	step?: "copy";
	/** Copy for a job: the resume to start from. */
	sourceResumeId?: string;
	/** Copy for a job: the application it's for. */
	applicationId?: string;
	/** A file dropped on the page, imported straight away. */
	file?: File;
};

type Step =
	| { name: "choose" }
	| { name: "importing"; file: File; stage: number; notes: string[] }
	| { name: "imported"; file: File; resumeId: string; sections: number; entries: number; flagged: number }
	| { name: "failed"; file: File; message: string }
	| { name: "copy" };

type OpenResumeOptions = { importedFrom?: string };

const ACCEPT = ".pdf,.docx,.json,.zip,application/pdf,application/json,application/zip";

const formatSize = (bytes: number) =>
	bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function requireImportKind(kind: ImportKind | null): ImportKind {
	if (!kind) {
		throw new ImportError(
			t`This file type can't be imported. Use a PDF, Word, Master CV or JSON Resume file, or a LinkedIn export (.zip).`,
		);
	}
	return kind;
}

/** Runs an import and reports each stage into the dialog's step; a newer run or a cancel drops the older one's updates. */
function useResumeImport(
	setStep: Dispatch<SetStateAction<Step>>,
	openLetter: (coverLetterId: string) => void,
	applicationId?: string,
) {
	const queryClient = useQueryClient();
	const markNew = useNewDocumentsStore((state) => state.markNew);
	const providerState = useHasUsableAiProvider();
	const { hasUsableProvider } = providerState;
	const run = useRef(0);
	const refreshDocuments = () => queryClient.invalidateQueries({ queryKey: orpc.documents.key() });

	const importFile = async (file: File) => {
		const attempt = ++run.current;
		const current = () => run.current === attempt;
		const advance = (stage: number, note: string) => {
			const index = stage - 1;
			setStep((previous) =>
				previous.name === "importing" && current()
					? { ...previous, stage, notes: Object.assign([...previous.notes], { [index]: note }) }
					: previous,
			);
		};

		setStep({ name: "importing", file, stage: 0, notes: [] });
		try {
			const kind = requireImportKind(await detectImportKind(file));

			if (kind === "cover-letter-json") {
				const letter = await client.coverLetters.import({ document: JSON.parse(await file.text()) });
				if (!current()) return;
				markNew(letter.id);
				void refreshDocuments();
				toast.add({ description: t`Cover letter imported` });
				openLetter(letter.id);
				return;
			}

			let aiAvailable = hasUsableProvider;
			if ((kind === "docx" || kind === "pdf") && providerState.isUnavailable) {
				try {
					const providers = await queryClient.fetchQuery({ ...orpc.aiProviders.list.queryOptions(), staleTime: 0 });
					aiAvailable = providers.some((provider) => provider.enabled && provider.testStatus === "success");
				} catch {
					// PDFs have a browser-only reader; a connection outage must not block that local path.
					if (kind !== "pdf")
						throw new ImportError(t`Couldn't load AI connections. Try again before importing this file.`);
					aiAvailable = false;
				}
			}
			if (!current()) return;
			const resume = await readResumeFile(file, kind, {
				aiAvailable,
				onRead: (note) => advance(1, note),
			});
			if (!current()) return;
			const summary = summarizeImport(resume);
			advance(1, t`file read`);
			advance(2, t`${summary.sections} sections`);

			const resumeId = await client.resume.import({ data: resume });
			if (!current()) return;
			if (applicationId) await client.documents.linkApplication({ type: "resume", id: resumeId, applicationId });
			if (!current()) return;
			markNew(resumeId);
			void refreshDocuments();
			setStep({ name: "imported", file, resumeId, ...summary });
		} catch (error) {
			if (!current()) return;
			const message =
				error instanceof ImportError
					? error.message
					: getOrpcErrorMessage(error, {
							byCode: {
								BAD_REQUEST: t`The file couldn't be read as a resume.`,
								BAD_GATEWAY: t`Couldn't reach the AI provider. Try again in a moment.`,
							},
							fallback: t`Something went wrong while importing. Try again, or start blank.`,
						});
			setStep({ name: "failed", file, message });
		}
	};

	const cancel = () => {
		run.current++;
		setStep({ name: "choose" });
	};

	return { importFile, cancel, refreshDocuments };
}

/**
 * New: import a file, copy a resume for a job, or start blank; no name, slug or tags are asked for first.
 * Importing shows three labelled steps rather than a spinner, so a slow parse still looks like progress.
 */
function LegacyNewDocumentDialog({ data, onStart }: { data?: NewDocumentDialogData | undefined; onStart: () => void }) {
	const navigate = useNavigate();
	const markNew = useNewDocumentsStore((state) => state.markNew);
	const providerState = useHasUsableAiProvider();
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const [step, setStep] = useState<Step>({ name: data?.step ?? "choose" } as Step);
	const inputRef = useRef<HTMLInputElement>(null);

	// Opening a saved import never starts an AI review.
	const openResume = (resumeId: string, { importedFrom }: OpenResumeOptions = {}) => {
		closeDialog();
		void navigate({
			to: "/builder/$resumeId",
			params: { resumeId },
			search: importedFrom ? { imported: importedFrom } : {},
		});
	};
	const openLetter = (coverLetterId: string) => {
		closeDialog();
		void navigate({ to: "/builder/letter/$coverLetterId", params: { coverLetterId } });
	};

	const { importFile, cancel, refreshDocuments } = useResumeImport(setStep, openLetter, data?.applicationId);

	// A file dropped on the page starts importing as soon as the dialog opens.
	const dropped = useRef(data?.file);
	useEffect(() => {
		if (!dropped.current) return;
		const file = dropped.current;
		dropped.current = undefined;
		void importFile(file);
	});

	const { startBlank, trySample, newLetter, creating, baseCvLimit } = useStartDocument(data?.applicationId);

	const chooseFile = () => inputRef.current?.click();

	return (
		<DialogContent size="wide">
			{baseCvLimit && (
				<div role="alert" className="grid gap-3 rounded-xl border border-line bg-bg p-4">
					<p>
						<Trans>
							You have reached the limit for base CVs. Your existing documents remain available to edit and download.
						</Trans>
					</p>
					<Button variant="secondary" onClick={closeDialog}>
						<Trans>Back to documents</Trans>
					</Button>
				</div>
			)}
			<AiProviderLoadState state={providerState} />
			<input
				ref={inputRef}
				type="file"
				accept={ACCEPT}
				className="hidden"
				aria-label={t`Choose a file to import`}
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void importFile(file);
				}}
			/>
			{/* Each step fades up into place as it replaces the last; the dialog's height changes in the same frame. */}
			{step.name === "copy" ? (
				<div key="copy" className={cn(ENTER_CLASS, "grid gap-4")}>
					{data?.applicationId ? (
						<CopyForApplication
							initialSourceId={data.sourceResumeId}
							initialJobId={data.applicationId}
							onBack={onStart}
							onCreated={(id) => {
								markNew(id);
								void refreshDocuments();
								openResume(id);
							}}
						/>
					) : (
						<CopyForJob
							initialSourceId={data?.sourceResumeId}
							onBack={onStart}
							onContinue={(resumeId) => {
								closeDialog();
								void navigate({ to: "/dashboard/resumes/$resumeId/job", params: { resumeId } });
							}}
						/>
					)}
				</div>
			) : step.name !== "choose" ? (
				<ImportStep
					key="progress"
					step={step}
					creating={creating}
					onCancel={cancel}
					onStartBlank={() => void startBlank()}
					onChooseFile={chooseFile}
					onClose={closeDialog}
					onOpen={(resumeId, importedFrom) => openResume(resumeId, { importedFrom })}
				/>
			) : (
				<div key="choose" className={cn(ENTER_CLASS, "grid gap-4")}>
					<DialogHeader>
						<DialogTitle className="type-title-s">
							<Trans>New document</Trans>
						</DialogTitle>
						<DialogDescription className="sr-only">
							<Trans>Import a resume, copy one for a job, or start blank.</Trans>
						</DialogDescription>
					</DialogHeader>

					<ActionChoice
						dropzone
						icon={<Icon name="file-arrow-up" size={24} />}
						title={t`Import a resume`}
						description={t`Drop a PDF, Word or JSON file, or browse.`}
						onClick={chooseFile}
						onDragOver={(event) => event.preventDefault()}
						onDrop={(event) => {
							event.preventDefault();
							const file = event.dataTransfer.files[0];
							if (file) void importFile(file);
						}}
					/>

					<div className="grid gap-3 sm:grid-cols-2">
						<ActionChoice
							icon={<Icon name="copy" size={22} />}
							title={t`Copy for a job`}
							description={t`Copy a saved CV.`}
							onClick={() => setStep({ name: "copy" })}
						/>
						<ActionChoice
							icon={<Icon name="file-plus" size={22} />}
							title={t`Start blank`}
							description={t`Add details in the editor.`}
							disabled={creating}
							onClick={() => void startBlank()}
						/>
					</div>

					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 type-body">
						<button
							type="button"
							className="touch-target flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-ink"
							onClick={() => void newLetter()}
						>
							<Icon name="envelope" size={18} />
							<Trans>Or create a cover letter</Trans>
						</button>
						<button
							type="button"
							className="touch-target min-h-11 text-ink-2 underline underline-offset-2 hover:text-ink"
							disabled={creating}
							onClick={() => void trySample()}
						>
							<Trans>Try a sample CV</Trans>
						</button>
					</div>
				</div>
			)}
		</DialogContent>
	);
}

type ImportStepProps = {
	step: Extract<Step, { name: "importing" | "imported" | "failed" }>;
	creating: boolean;
	onCancel: () => void;
	onStartBlank: () => void;
	onChooseFile: () => void;
	onClose: () => void;
	onOpen: (resumeId: string, importedFrom: string) => void;
};

/** The import's progress, then its outcome: found counts with Open in editor, or the error with a way forward. */
function ImportStep({ step, creating, onCancel, onStartBlank, onChooseFile, onClose, onOpen }: ImportStepProps) {
	return (
		<div className={cn(ENTER_CLASS, "grid gap-4")}>
			<DialogHeader>
				<DialogTitle className="type-title-s">
					{step.name === "failed" ? (
						<Trans>Couldn't import</Trans>
					) : step.name === "imported" ? (
						<Trans>Imported</Trans>
					) : (
						<Trans>Importing</Trans>
					)}
				</DialogTitle>
			</DialogHeader>
			<div className="flex items-center gap-3 rounded-lg border border-line p-3">
				<Icon name={step.file.name.toLowerCase().endsWith(".pdf") ? "file-pdf" : "file-text"} className="text-ink-2" />
				<span className="grid min-w-0 flex-1">
					<span className="truncate type-body font-medium">{step.file.name}</span>
					<span className="type-metadata text-ink-3">{formatSize(step.file.size)}</span>
				</span>
				{step.name === "importing" && (
					<Button variant="ghost" size="sm" onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
				)}
			</div>

			{/* One ImportProgress for importing and imported, so its checks don't replay when the import finishes. */}
			{step.name !== "failed" && (
				<ImportProgress
					stage={step.name === "imported" ? 3 : step.stage}
					notes={
						step.name === "imported"
							? [t`file read`, t`${step.sections} sections`, t`${step.entries} entries`]
							: step.notes
					}
				/>
			)}

			{step.name === "failed" && (
				<>
					<div
						role="alert"
						className={cn(ENTER_CLASS, "flex gap-2.5 rounded-lg bg-danger-soft p-3 type-body text-danger-text")}
					>
						<Icon name="warning-circle" size={20} />
						<span>{step.message}</span>
					</div>
					<div className={cn(ENTER_CLASS, "flex flex-wrap justify-end gap-2")}>
						<Button variant="secondary" onClick={onStartBlank} disabled={creating}>
							<Trans>Start blank</Trans>
						</Button>
						<Button onClick={onChooseFile}>
							<Trans>Choose another file</Trans>
						</Button>
					</div>
				</>
			)}

			{step.name === "imported" && (
				<>
					<p role="status" className={cn(ENTER_CLASS, "flex gap-2 type-body")}>
						<Icon
							name="check-circle"
							size={20}
							className="text-accent-text transition-[opacity,scale] duration-standard ease-enter starting:scale-80 starting:opacity-0"
						/>
						<span>
							<Trans>
								{step.sections} sections and {step.entries} entries found.
							</Trans>{" "}
							{step.flagged > 0 && <Trans>{step.flagged} fields are flagged for a quick look in the editor.</Trans>}
						</span>
					</p>
					<div className={cn(ENTER_CLASS, "flex flex-wrap justify-end gap-2")}>
						<Button variant="secondary" onClick={onClose}>
							<Trans>Stay here</Trans>
						</Button>
						<Button onClick={() => onOpen(step.resumeId, step.file.name)}>
							<Trans>Open in editor</Trans>
						</Button>
					</div>
				</>
			)}
		</div>
	);
}

/** Start blank, try a sample, or a new letter: each creates the document at once and opens it. */
function useStartDocument(applicationId?: string) {
	const [baseCvLimit, setBaseCvLimit] = useState(false);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const closeDialog = useDialogStore((state) => state.closeDialog);
	const markNew = useNewDocumentsStore((state) => state.markNew);
	const { mutateAsync: createResume, isPending: creating } = useMutation(orpc.resume.create.mutationOptions());
	const { mutateAsync: createLetter } = useMutation(orpc.coverLetters.create.mutationOptions());

	const created = async (id: string, type: "resume" | "letter") => {
		if (applicationId) await client.documents.linkApplication({ type, id, applicationId });
		markNew(id);
		void queryClient.invalidateQueries({ queryKey: orpc.documents.key() });
		if (applicationId) void queryClient.invalidateQueries({ queryKey: orpc.applications.key() });
		closeDialog();
	};
	const failed = (error: unknown) => {
		if (isBaseCvLimit(error)) {
			setBaseCvLimit(true);
			toast.add({
				type: "error",
				description: t`You have reached the limit for base CVs. Your existing documents remain available to edit and download.`,
			});
			return;
		}
		toast.add({
			type: "error",
			description: getOrpcErrorMessage(error, { fallback: t`Couldn't create the document.` }),
		});
	};

	return {
		baseCvLimit,
		creating,
		startBlank: async () => {
			try {
				const resumeId = await createResume({
					name: t`Untitled resume`,
					tags: [],
					autoName: true,
					withSampleData: false,
				});
				await created(resumeId, "resume");
				void navigate({ to: "/builder/$resumeId", params: { resumeId } });
			} catch (error) {
				failed(error);
			}
		},
		trySample: async () => {
			try {
				const resumeId = await createResume({ name: generateRandomName(), tags: [], withSampleData: true });
				await created(resumeId, "resume");
				toast.add({ description: t`Sample resume added. Delete it anytime.` });
				void navigate({ to: "/builder/$resumeId", params: { resumeId } });
			} catch (error) {
				failed(error);
			}
		},
		newLetter: async () => {
			// A new letter takes its sender details and design from the resume edited most recently.
			const documents = queryClient.getQueryData(orpc.documents.list.queryKey({ input: { trashed: false } }));
			const resume = documents
				?.filter((document) => document.type === "resume")
				.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
			const input = {
				name: t`Untitled letter`,
				recipient: "",
				content: "",
				...(resume ? { resumeId: resume.id } : {}),
			};
			try {
				const letter = await createLetter(input);
				await created(letter.id, "letter");
				void navigate({ to: "/builder/letter/$coverLetterId", params: { coverLetterId: letter.id } });
			} catch (error) {
				failed(error);
			}
		},
	};
}

/** Reading the file → Finding sections → Filling in entries, each with a note once done. */
function ImportProgress({ stage, notes }: { stage: number; notes: string[] }) {
	const steps = [t`Reading the file`, t`Finding sections`, t`Filling in entries`];

	return (
		<div className="grid gap-3">
			<ol className="grid gap-2.5" aria-label={t`Import steps`}>
				{steps.map((label, index) => {
					const done = stage > index;
					const current = stage === index;
					return (
						<li
							key={label}
							className={cn("flex items-center gap-2.5 type-body", done || current ? "text-ink" : "text-ink-3")}
						>
							{done ? (
								<Icon name="check-circle" size={18} className={cn(POP_CLASS, "text-accent-text")} />
							) : current ? (
								<Spinner decorative className={cn(POP_CLASS, "size-4.5")} />
							) : (
								<span className="size-4.5 rounded-full border-2 border-line-2" />
							)}
							<span className="font-medium">{label}</span>
							{done && notes[index] && <span className="type-metadata text-ink-3">{notes[index]}</span>}
						</li>
					);
				})}
			</ol>
			<div
				role="progressbar"
				aria-label={t`Import progress`}
				aria-valuemin={0}
				aria-valuemax={3}
				aria-valuenow={stage}
				className="h-1 overflow-hidden rounded-full bg-sunken"
			>
				<div
					className="h-full translate-x-(--fill) bg-accent transition-[translate] duration-standard ease-enter rtl:-translate-x-(--fill)"
					style={{ "--fill": `${(stage / 3) * 100 - 100}%` } as CSSProperties}
				/>
			</div>
		</div>
	);
}

function CopySourcePicker({
	loaded,
	resumes,
	sourceId,
	onSelect,
}: {
	loaded: boolean;
	resumes: Array<{ id: string; name: string; updatedAt: Date }>;
	sourceId: string | undefined;
	onSelect: (id: string) => void;
}) {
	const { i18n } = useLingui();
	return (
		<fieldset className="grid gap-1.5">
			<legend className="mb-1.5 type-metadata font-medium text-ink-2">
				<Trans>Start from</Trans>
			</legend>
			{loaded && resumes.length === 0 && (
				<p className="type-body text-ink-2">
					<Trans>
						You don't have a resume to copy yet. Import or create a resume first, then return to copy it for this job.
					</Trans>
				</p>
			)}
			<div className="grid max-h-56 gap-1 overflow-y-auto">
				{resumes.map((resume) => (
					<label
						key={resume.id}
						className={cn(
							"relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-quick",
							resume.id === sourceId ? "border-accent bg-accent-soft" : "border-line hover:bg-hover",
						)}
					>
						<input
							type="radio"
							name="copy-source"
							className="sr-only"
							checked={resume.id === sourceId}
							onChange={() => {
								onSelect(resume.id);
							}}
						/>
						<Icon name="file-text" className="text-ink-2" />
						<span className="grid min-w-0 flex-1">
							<span className="truncate type-body font-medium">{resume.name}</span>
							<span className="type-metadata text-ink-3">{formatRelativeTime(resume.updatedAt, i18n.locale)}</span>
						</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}
type CopyForJobProps = {
	initialSourceId?: string | undefined;
	onBack: () => void;
	onContinue: (resumeId: string) => void;
};
/** Select a source; exact advert comparison and intentional creation belong to the job workflow. */
function CopyForJob({ initialSourceId, onBack, onContinue }: CopyForJobProps) {
	const { data: documents } = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const resumes = (documents ?? []).filter((document) => document.type === "resume");
	const [sourceId, setSourceId] = useState(initialSourceId);
	const source = resumes.find((resume) => resume.id === sourceId) ?? resumes[0];
	return (
		<>
			<DialogHeader>
				<DialogTitle className="type-title-s">
					<Trans>Copy a resume for a job</Trans>
				</DialogTitle>
			</DialogHeader>

			<CopySourcePicker loaded={Boolean(documents)} resumes={resumes} sourceId={source?.id} onSelect={setSourceId} />

			<div className="flex flex-wrap justify-end gap-2">
				<Button variant="secondary" onClick={onBack}>
					{documents && resumes.length === 0 ? <Trans>Import or create a resume</Trans> : <Trans>Back</Trans>}
				</Button>
				<Button
					disabled={!source}
					onClick={() => {
						if (source) onContinue(source.id);
					}}
				>
					<Trans>Continue</Trans>
				</Button>
			</div>
		</>
	);
}

type CopyForApplicationProps = {
	initialSourceId?: string | undefined;
	initialJobId?: string | undefined;
	onBack: () => void;
	/** The new resume, and whether it was made for a job. */
	onCreated: (resumeId: string, forJob: boolean) => void;
};

/** Pick a resume and a job; the copy is named from both and linked to the application. */
function CopyForApplication({ initialSourceId, initialJobId, onBack, onCreated }: CopyForApplicationProps) {
	const [copyError, setCopyError] = useState<string | null>(null);
	const nameId = useId();
	const { data: documents } = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const { data: applications } = useQuery(applicationsListQueryOptions());
	const resumes = (documents ?? []).filter((document) => document.type === "resume");
	const jobs = (applications ?? []).filter((application) => application.status !== "closed");
	const [sourceId, setSourceId] = useState(initialSourceId);
	const [jobId, setJobId] = useState<string | null>(initialJobId ?? null);
	const [name, setName] = useState<string | null>(null);
	const { mutateAsync: copyForJob, isPending } = useMutation(orpc.documents.copyForJob.mutationOptions());

	const source = resumes.find((resume) => resume.id === sourceId) ?? resumes[0];
	const job = jobs.find((application) => application.id === jobId);
	const base = (source?.name ?? "").split(" — ")[0] ?? "";
	const suggested = job ? `${base} — ${job.company}` : t`${base} (copy)`;
	const finalName = (name ?? suggested).trim();

	const create = async () => {
		if (!source) return;
		const input = {
			resumeId: source.id,
			...(job ? { applicationId: job.id } : {}),
			...(finalName ? { name: finalName } : {}),
		};
		const message = job ? t`Created and linked to ${job.company}` : t`Created “${finalName}”`;
		try {
			setCopyError(null);
			const resumeId = await copyForJob(input);
			toast.add({ description: message });
			onCreated(resumeId, Boolean(job));
		} catch (error) {
			setCopyError(getResumeErrorMessage(error));
		}
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle className="type-title-s">
					<Trans>Copy a resume for a job</Trans>
				</DialogTitle>
			</DialogHeader>

			<CopySourcePicker
				loaded={Boolean(documents)}
				resumes={resumes}
				sourceId={source?.id}
				onSelect={(id) => {
					setSourceId(id);
					setName(null);
				}}
			/>

			<fieldset className="grid gap-1.5">
				<legend className="mb-1.5 type-metadata font-medium text-ink-2">
					<Trans>For which job?</Trans>
				</legend>
				<div className="flex flex-wrap gap-1.5">
					{[
						...jobs.map((application) => ({ id: application.id, label: application.company })),
						{ id: null, label: t`No job yet` },
					].map((option) => (
						<button
							key={option.id ?? "none"}
							type="button"
							aria-pressed={jobId === option.id}
							onClick={() => {
								setJobId(option.id);
								setName(null);
							}}
							className={cn(
								"flex h-8 items-center gap-1.5 rounded-full border px-3 type-body transition-[background-color,border-color,color,scale] duration-quick ease-enter active:scale-[0.97]",
								jobId === option.id
									? "border-accent bg-accent-soft text-accent-text"
									: "border-line-2 text-ink-2 hover:bg-hover",
							)}
						>
							{option.id && <Icon name="briefcase" size={16} />}
							{option.label}
						</button>
					))}
				</div>
				{job && (
					<span className="type-metadata text-ink-3">
						<Trans>The copy is linked to the application, so Check and the assistant use its posting.</Trans>
					</span>
				)}
			</fieldset>

			<div className="grid gap-1.5">
				<label htmlFor={nameId} className="type-metadata font-medium text-ink-2">
					<Trans>Name</Trans>
				</label>
				<Input
					id={nameId}
					value={name ?? suggested}
					maxLength={100}
					onChange={(event) => setName(event.target.value)}
				/>
				<span className="type-metadata text-ink-3">
					<Trans>Suggested from the source and the job. Change it anytime.</Trans>
				</span>
			</div>

			{copyError && (
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertDescription>{copyError}</AlertDescription>
				</Alert>
			)}
			<div className="flex flex-wrap justify-end gap-2">
				<Button variant="ghost" onClick={onBack}>
					{documents && resumes.length === 0 ? <Trans>Import or create a resume</Trans> : <Trans>Back</Trans>}
				</Button>
				<Button disabled={!source || !finalName || isPending} onClick={() => void create()}>
					<Trans>Create and open</Trans>
				</Button>
			</div>
		</>
	);
}

export function NewDocumentDialog({ data }: { data?: NewDocumentDialogData | undefined }) {
	const [start, setStart] = useState(false);
	return data?.step === "copy" && !start ? (
		<LegacyNewDocumentDialog
			onStart={() => setStart(true)}
			data={{
				step: "copy",
				...(data.sourceResumeId ? { sourceResumeId: data.sourceResumeId } : {}),
				...(data.applicationId ? { applicationId: data.applicationId } : {}),
			}}
		/>
	) : (
		<StartCvDialog data={data} />
	);
}
