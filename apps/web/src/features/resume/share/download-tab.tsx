import type { ExportFormat } from "@/features/resume/export/use-resume-export";
import type { IconName } from "@reactive-resume/ui/components/icon";
import type { ReactNode } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useId, useRef, useState } from "react";
import { ActionFeedback } from "@reactive-resume/ui/components/action-feedback";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { toast } from "@reactive-resume/ui/components/toast";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { useCurrentResume, useResumeStore } from "@/features/resume/builder/draft";
import { useOpenIssueCount } from "@/features/resume/editor/check/use-check";
import { useReadiness } from "@/features/resume/editor/check/use-readiness";
import { createExportFile, getDefaultFileName, sanitizeFileName } from "@/features/resume/export/use-resume-export";
import { getReadableErrorMessage } from "@/libs/error-message";

export type DownloadFormat<Id extends string = ExportFormat> = {
	id: Id;
	label: string;
	/** ".pdf", or what's made ("2 files"). */
	extension: string;
	icon: IconName;
	description: string;
	disabled?: boolean;
};

export const getExportFormats = (): DownloadFormat[] => [
	{
		id: "pdf",
		label: "PDF",
		extension: ".pdf",
		icon: "file-pdf",
		description: t`For applications and printing, with selectable and searchable text.`,
	},
	{
		id: "docx",
		label: "Word",
		extension: ".docx",
		icon: "file-text",
		description: t`Not available yet. Arabic and English Word integrity still requires approval.`,
		disabled: true,
	},
];

type FormatRadioGroupProps<Id extends string> = {
	formats: DownloadFormat<Id>[];
	value: Id;
	onChange: (value: Id) => void;
};

/** Format radio cards: icon, name, extension and when to use it. PDF is marked "Best for applying". */
export function FormatRadioGroup<Id extends string>({ formats, value, onChange }: FormatRadioGroupProps<Id>) {
	return (
		<RadioGroup
			aria-label={t`Format`}
			value={value}
			onValueChange={(next) => onChange(next as Id)}
			className="grid gap-1.5"
		>
			{formats.map((option) => (
				<Radio.Root
					key={option.id}
					value={option.id}
					disabled={option.disabled}
					className="group/format flex cursor-pointer items-start gap-3 rounded-[10px] border border-line p-3 text-start transition-colors duration-quick hover:border-line-2 data-checked:border-accent data-checked:bg-accent-soft data-disabled:cursor-not-allowed data-disabled:opacity-45"
				>
					<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2">
						<Icon name={option.icon} size={22} />
					</span>
					<span className="grid min-w-0 flex-1 gap-0.5">
						<span className="flex flex-wrap items-center gap-2">
							<span className="text-sm font-semibold">{option.label}</span>
							<span className="font-mono text-[11px] font-medium text-ink-3 group-data-checked/format:text-ink-2">
								{option.extension}
							</span>
							{option.id === "pdf" && (
								<span className="rounded bg-accent-soft px-1.5 text-[11px] leading-[18px] font-semibold text-accent-text">
									<Trans>Best for applying</Trans>
								</span>
							)}
						</span>
						<span className="text-[13px] leading-[18px] text-ink-2">{option.description}</span>
					</span>
					<span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-2 group-data-checked/format:border-accent">
						<span className="size-2 rounded-full bg-accent opacity-0 group-data-checked/format:opacity-100" />
					</span>
				</Radio.Root>
			))}
		</RadioGroup>
	);
}

type FileNameFieldProps = { value: string; extension: string; hint: ReactNode; onChange: (value: string) => void };

/** The file name recruiters see, with the extension shown after it. Characters file systems reject are dropped. */
export function FileNameField({ value, extension, hint, onChange }: FileNameFieldProps) {
	const id = useId();

	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-xs font-medium text-ink-2">
				<Trans>File name</Trans>
			</label>
			<div className="flex h-[38px] items-center overflow-hidden rounded-lg border border-line-2 bg-raised focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
				<input
					dir="auto"
					id={id}
					value={value}
					spellCheck={false}
					aria-describedby={`${id}-hint`}
					onChange={(event) => onChange(sanitizeFileName(event.target.value))}
					className="h-full min-w-0 flex-1 bg-transparent ps-2.5 font-mono text-[13px] font-medium text-ink outline-none"
				/>
				<span className="px-2.5 font-mono text-[13px] font-medium text-ink-3">{extension}</span>
			</div>
			<span id={`${id}-hint`} className="text-xs text-ink-3">
				{hint}
			</span>
		</div>
	);
}

/** "done" follows a successful download, until the format changes or another download starts. */
export type DownloadState = "idle" | "busy" | "error" | "done";

type DownloadActionsProps = {
	disabled?: boolean;
	state: DownloadState;
	label: string;
	onDownload: () => void;
	/** Offered when a file other than a PDF fails. */
	onDownloadPdf?: (() => void) | undefined;
};

/**
 * The failure alert (with PDF as the fallback) and the 44px button that shows its progress. After a download, a
 * one-line thank-you asks for a donation: the moment someone has what they came for is the one time it's fair to ask.
 */
export function DownloadActions({ state, label, onDownload, onDownloadPdf, disabled }: DownloadActionsProps) {
	return (
		<>
			{state === "error" && (
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans>Download failed.</Trans>
					</AlertTitle>
					<AlertDescription>
						<p>
							<Trans>The {label} file couldn't be generated. Try again, or download PDF instead.</Trans>
						</p>
					</AlertDescription>
					<AlertActions>
						<Button variant="secondary" disabled={disabled} onClick={onDownload}>
							<Trans>Try again</Trans>
						</Button>
						{onDownloadPdf && (
							<Button variant="secondary" onClick={onDownloadPdf}>
								<Trans>Download PDF instead</Trans>
							</Button>
						)}
					</AlertActions>
				</Alert>
			)}

			{state !== "error" && (
				<Button
					size="toolbar"
					aria-label={label === "PDF" ? t`Download ${label}` : undefined}
					aria-busy={state === "busy"}
					disabled={disabled || state === "busy"}
					onClick={onDownload}
				>
					{label === "PDF" ? (
						<ActionFeedback
							state={state === "busy" ? "pending" : state === "done" ? "ready" : "idle"}
							label={t`Download ${label}`}
							pendingLabel={t`Preparing…`}
							readyLabel={t`PDF ready`}
						/>
					) : state === "busy" ? (
						<>
							<Spinner decorative className="size-4" />
							<Trans>Preparing {label} file…</Trans>
						</>
					) : (
						<>
							<Icon name="download-simple" />
							<Trans>Download {label}</Trans>
						</>
					)}
				</Button>
			)}

			{state === "done" && (
				<p role="status" className="type-body text-ink-2">
					<Trans>Your PDF is ready. The browser download has started; your original CV remains saved here.</Trans>
				</p>
			)}
		</>
	);
}

export function DownloadTab({ onReview }: { onReview: () => void }) {
	const resume = useCurrentResume();
	const conflict = useResumeStore((state) => state.saveStatus === "conflict");
	const formats = getExportFormats();
	const [name, setName] = useState(() => getDefaultFileName(resume));
	const [state, setState] = useState<DownloadState>("idle");
	const issues = useOpenIssueCount();
	const { results } = useReadiness();
	const pdfBlockers =
		(results.pdf.state === "complete" || results.pdf.state === "partial") &&
		results.pdf.issues.some((issue) => issue.severity === "blocker");
	const active = useRef(true);
	const inFlight = useRef(false);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const download = async () => {
		if (inFlight.current || useResumeStore.getState().saveStatus === "conflict") return;
		inFlight.current = true;
		setState("busy");
		try {
			const blob = await createExportFile(resume, "pdf");
			if (!active.current || useResumeStore.getState().saveStatus === "conflict") return;
			downloadWithAnchor(blob, `${sanitizeFileName(name) || getDefaultFileName(resume)}.pdf`);
			setState("done");
		} catch (error) {
			if (active.current) {
				setState("error");
				toast.add({ type: "error", description: getReadableErrorMessage(error, t`Download failed.`) });
			}
		} finally {
			inFlight.current = false;
		}
	};
	return (
		<div className="grid gap-4">
			<FormatRadioGroup formats={formats} value="pdf" onChange={() => {}} />
			<FileNameField
				value={name}
				onChange={setName}
				extension=".pdf"
				hint={<Trans>Choose the file name you want to send.</Trans>}
			/>
			{pdfBlockers && (
				<Alert variant="warn">
					<Icon name="warning" />
					<AlertTitle>
						<Trans>There is an issue that may block reading</Trans>
					</AlertTitle>
					<AlertDescription>
						<p>
							<Trans>PDF download remains available. Review the findings before sending it.</Trans>
						</p>
					</AlertDescription>
					<AlertActions>
						<Button variant="secondary" onClick={onReview}>
							<Trans>View issues</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			{issues > 0 && !pdfBlockers && (
				<Alert variant="warn">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans>Review your CV</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>There is information to review. PDF download remains free and available.</Trans>
					</AlertDescription>
					<AlertActions>
						<Button variant="secondary" onClick={onReview}>
							<Trans>Review now</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			<DownloadActions disabled={conflict} state={state} label="PDF" onDownload={() => void download()} />
		</div>
	);
}
