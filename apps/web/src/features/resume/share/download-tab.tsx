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
import { EditorPanelBody, EditorPanelFooter } from "@reactive-resume/ui/components/editor-panel";
import { Icon } from "@reactive-resume/ui/components/icon";
import {
	InputGroup,
	InputGroupInput,
	InputGroupAddon,
	InputGroupText,
} from "@reactive-resume/ui/components/input-group";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { toast } from "@reactive-resume/ui/components/toast";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { useCurrentResume, useResumeStore } from "@/features/resume/builder/draft";
import { useReadiness } from "@/features/resume/editor/check/use-readiness";
import { useExportHistoryScroll } from "@/features/resume/editor/export-history-scroll";
import { useEditorStore } from "@/features/resume/editor/store";
import {
	createExportFile,
	getDefaultFileName,
	sanitizeFileName,
	normalizePdfFileNameStem,
} from "@/features/resume/export/use-resume-export";
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

type FileNameFieldProps = {
	value: string;
	extension: string;
	hint: ReactNode;
	onChange: (value: string) => void;
	onBlur?: () => void;
};

export function FileNameField({ value, extension, hint, onChange, onBlur }: FileNameFieldProps) {
	const id = useId();
	return (
		<div className="grid gap-2">
			<label htmlFor={id} className="type-label">
				<Trans>File name</Trans>
			</label>
			<InputGroup dir="ltr">
				<InputGroupInput
					dir="auto"
					id={id}
					value={value}
					spellCheck={false}
					aria-describedby={`${id}-hint`}
					onChange={(event) => onChange(onBlur ? event.target.value : sanitizeFileName(event.target.value))}
					onBlur={onBlur}
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupText dir="ltr">{extension}</InputGroupText>
				</InputGroupAddon>
			</InputGroup>
			<span id={`${id}-hint`} className="type-caption text-ink-2">
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
 * The failure alert (with PDF as the fallback) and the 44px button that shows its progress.
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
							{onDownloadPdf ? (
								<Trans>The {label} file couldn't be generated. Try again, or download PDF instead.</Trans>
							) : (
								<Trans>The {label} file could not be generated. Try again.</Trans>
							)}
						</p>
					</AlertDescription>
					<AlertActions>
						<Button disabled={disabled} onClick={onDownload}>
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
							pendingLabel={t`Preparing PDF…`}
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
	const [localName, setLocalName] = useState(() => getDefaultFileName(resume));
	const savedName = useEditorStore((state) => state.exportHistorySession?.fileName);
	const name = savedName ?? localName;
	const setName = (value: string) => {
		setLocalName(value);
		useEditorStore.getState().setExportHistoryFileName(value);
	};
	const scroll = useExportHistoryScroll("download");
	const phone = useBreakpoint() === "mobile";
	const [state, setState] = useState<DownloadState>("idle");
	const { results } = useReadiness();
	const current = results.pdf.state === "complete" || results.pdf.state === "partial";
	const blockers = current && results.pdf.issues.some((issue) => issue.severity === "blocker");
	const findings = current && results.pdf.issues.length > 0;
	const advice = blockers
		? t`There is an issue that may block reading`
		: results.pdf.state === "complete"
			? findings
				? t`Review the findings before sending. PDF download is free.`
				: t`Review is complete. PDF download is free.`
			: results.pdf.state === "checking"
				? t`Review is in progress. PDF download is free.`
				: results.pdf.state === "failed"
					? t`Review failed. Open Review to try again. PDF download is free.`
					: results.pdf.state === "partial" || results.pdf.state === "skipped"
						? t`Review is incomplete. PDF download is free.`
						: results.pdf.state === "stale"
							? t`Review is out of date. PDF download is free.`
							: t`Review has not run. PDF download is free.`;
	const stem = normalizePdfFileNameStem(name, getDefaultFileName(resume));
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
		const fileName = `${stem}.pdf`;
		setName(stem);
		inFlight.current = true;
		setState("busy");
		try {
			const blob = await createExportFile(resume, "pdf");
			if (!active.current) return;
			if (useResumeStore.getState().saveStatus === "conflict") {
				setState("idle");
				return;
			}
			downloadWithAnchor(blob, fileName);
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
		<>
			<EditorPanelBody {...scroll}>
				<div className="grid gap-6">
					<div className="flex items-start gap-3">
						<Icon name="file-pdf" />
						<div className="grid gap-2">
							<h3 className="type-section">PDF</h3>
							<p className="type-body text-ink-2">
								<Trans>For applications and printing, with selectable and searchable text.</Trans>
							</p>
						</div>
					</div>
					<p className="type-caption flex items-center gap-2 text-ink-2">
						<Icon name="file-text" />
						<Trans>Word export is not available.</Trans>
					</p>
					<FileNameField
						value={name}
						onChange={setName}
						onBlur={() => setName(stem)}
						extension=".pdf"
						hint={<Trans>Choose the file name you want to send.</Trans>}
					/>
					<p className="type-body text-ink-2">
						<Trans>File preview</Trans>:{" "}
						<bdi dir="ltr" className="break-all">
							{stem}.pdf
						</bdi>
					</p>
				</div>
			</EditorPanelBody>
			<EditorPanelFooter>
				<div className="grid gap-3">
					<p className="flex items-start gap-2 type-body text-ink-2">
						<Icon name={findings ? "warning-circle" : "info"} />
						<span>{advice}</span>
					</p>
					<Button id="export-review-button" variant="secondary" onClick={onReview}>
						<Trans>Review</Trans>
					</Button>
					{conflict && (
						<Alert variant="warn">
							<Icon name="warning" />
							<AlertTitle>
								<Trans>Resolve the save conflict before downloading.</Trans>
							</AlertTitle>
							<AlertActions>
								<Button variant="secondary" onClick={() => useEditorStore.getState().setShareTab(null)}>
									<Trans>Resolve save conflict</Trans>
								</Button>
							</AlertActions>
						</Alert>
					)}
					{phone && (
						<Button
							id="export-preview-download"
							variant="secondary"
							onClick={() => useEditorStore.getState().setExportHistoryPreview(true)}
						>
							<Icon name="eye" />
							<Trans>Preview PDF</Trans>
						</Button>
					)}
					<DownloadActions disabled={conflict} state={state} label="PDF" onDownload={() => void download()} />
				</div>
			</EditorPanelFooter>
		</>
	);
}
