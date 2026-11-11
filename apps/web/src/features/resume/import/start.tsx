import type { NewDocumentDialogData } from "@/features/documents/new-document-dialog";
import type { ImportReviewIssue } from "@reactive-resume/import/plain-text";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ActionChoice } from "@reactive-resume/ui/components/action-choice";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { RadioGroup, RadioGroupItem } from "@reactive-resume/ui/components/radio-group";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { detectImportKind, readResumeFile } from "./read-file";
import { createReviewState, saveReviewDraft } from "./review-draft";
import { useDialogStore } from "@/dialogs/store";
import { useNewDocumentsStore } from "@/features/documents/new-documents";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { client, orpc } from "@/libs/orpc/client";

type StartCvDialogProps = { data?: NewDocumentDialogData | undefined };
export function StartCvDialog({ data: initial }: StartCvDialogProps) {
	const queryClient = useQueryClient();
	const { session } = useRouteContext({ strict: false });
	const { i18n } = useLingui();
	const [locale, setLocale] = useState(i18n.locale === "ar-SA" ? "ar-SA" : "en-US");
	const [busy, setBusy] = useState<"reading" | "creating" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [failedAction, setFailedAction] = useState<"read" | "create">("read");
	const input = useRef<HTMLInputElement>(null);
	const attempt = useRef<AbortController | null>(null);
	const [generation] = useState(() => useDialogStore.getState().openCount);
	const close = useDialogStore((state) => state.closeDialog);
	const navigate = useNavigate();
	useEffect(() => {
		const { setOnBeforeClose } = useDialogStore.getState();
		setOnBeforeClose(() => busy !== "creating");
		return () => {
			if (useDialogStore.getState().openCount === generation) setOnBeforeClose(null);
		};
	}, [busy, generation]);
	const manual = async () => {
		if (busy) return;
		const controller = new AbortController();
		attempt.current = controller;
		setBusy("creating");
		setError(null);
		try {
			const resumeId = await client.resume.create(
				{
					name: t`Untitled resume`,
					tags: [],
					autoName: true,
					withSampleData: false,
					locale: locale as "ar-SA" | "en-US",
					empty: true,
				},
				{ signal: controller.signal },
			);
			controller.signal.throwIfAborted();
			void queryClient.invalidateQueries({ queryKey: orpc.documents.key() });
			useNewDocumentsStore.getState().markNew(resumeId);
			close();
			void navigate({ to: "/builder/$resumeId", params: { resumeId }, search: { mode: "write" } });
		} catch (error) {
			if (!controller.signal.aborted) {
				setFailedAction("create");
				setError(getOrpcErrorMessage(error, { fallback: t`Couldn't create the document.` }));
			}
		} finally {
			if (!controller.signal.aborted) setBusy(null);
		}
	};
	const read = async (file: File) => {
		attempt.current?.abort();
		const controller = new AbortController();
		attempt.current = controller;
		setBusy("reading");
		setError(null);
		try {
			if (!session?.user.id) throw new Error(t`Sign in to continue`);
			const kind = await detectImportKind(file);
			if (kind !== "pdf") throw new Error(t`Choose a readable PDF. Word import is not available.`);
			let partial = false;
			let pages: { page: number; text: string }[] = [];
			const issues: ImportReviewIssue[] = [];
			const data = await readResumeFile(file, "pdf", {
				aiAvailable: false,
				onUncertain: (issue) => issues.push(issue),
				signal: controller.signal,
				onCoverage: (coverage) => {
					partial = coverage.partial;
					pages = coverage.pages ?? [];
				},
			});
			controller.signal.throwIfAborted();
			data.metadata.page.locale = locale;
			const flowId = crypto.randomUUID();
			await saveReviewDraft({
				version: 1,
				ownerId: session.user.id,
				flowId,
				expiresAt: Date.now() + 24 * 60 * 60 * 1000,
				file,
				initial: data,
				pages,
				partial,
				issues,
				state: createReviewState(data, flowId),
			});
			controller.signal.throwIfAborted();
			close();
			void navigate({ to: "/dashboard/import/$flowId", params: { flowId } });
		} catch (error) {
			if (!controller.signal.aborted) {
				setFailedAction("read");
				setError(getOrpcErrorMessage(error, { fallback: t`The file could not be read.` }));
			}
		} finally {
			if (!controller.signal.aborted) setBusy(null);
		}
	};
	const dropped = useRef(initial?.file);
	useEffect(() => {
		if (dropped.current) {
			const file = dropped.current;
			dropped.current = undefined;
			void read(file);
		}
	});
	useEffect(() => {
		const unsubscribe = useDialogStore.subscribe((state) => {
			if (!state.open || state.openCount !== generation) attempt.current?.abort();
		});
		return () => {
			unsubscribe();
			attempt.current?.abort();
		};
	}, [generation]);
	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>
					<Trans context="onboarding.method.title">How would you like to start?</Trans>
				</DialogTitle>
				<DialogDescription>
					<Trans context="onboarding.method.startHint">
						Start with a blank CV, or review a PDF before creating your CV.
					</Trans>
				</DialogDescription>
			</DialogHeader>
			{error && (
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertTitle>
						<Trans>Something went wrong</Trans>
					</AlertTitle>
					<AlertDescription>
						<p>{error}</p>
						<Button
							variant="secondary"
							disabled={busy !== null}
							onClick={() => {
								if (failedAction === "create") {
									void manual();
									return;
								}
								setError(null);
								input.current?.click();
							}}
						>
							{failedAction === "create" ? <Trans>Try again</Trans> : <Trans>Choose a file</Trans>}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			<fieldset disabled={!!busy} className="grid gap-4">
				<fieldset className="grid gap-2">
					<legend className="type-label">
						<Trans>CV language</Trans>
					</legend>
					<RadioGroup value={locale} onValueChange={setLocale} className="flex flex-wrap gap-4">
						<label htmlFor="cv-language-ar" className="flex items-center gap-2 type-body">
							<RadioGroupItem id="cv-language-ar" value="ar-SA" />
							<Trans>Arabic</Trans>
						</label>
						<label htmlFor="cv-language-en" className="flex items-center gap-2 type-body">
							<RadioGroupItem id="cv-language-en" value="en-US" />
							<Trans>English</Trans>
						</label>
					</RadioGroup>
				</fieldset>
				<ActionChoice
					icon={<Icon name="upload-simple" />}
					title={t({ context: "onboarding.upload.title", message: "Upload an existing CV" })}
					description={
						<>
							<span className="block">
								<Trans context="onboarding.upload.chooseFile">Choose a file</Trans>
							</span>
							<span className="block">
								<Trans>
									Readable PDFs up to 25 MB and 30 pages. Scanned files are not supported. Partial reading requires
									review.
								</Trans>
							</span>
							<span className="block">
								<Trans context="onboarding.upload.privateHint">
									Your CV and career information are saved after review. This device keeps an unfinished review for 24
									hours.
								</Trans>
							</span>
						</>
					}
					onClick={() => input.current?.click()}
					onDragOver={(event) => event.preventDefault()}
					onDrop={(event) => {
						event.preventDefault();
						const file = event.dataTransfer.files[0];
						if (file && !busy) void read(file);
					}}
				/>
				<ActionChoice
					icon={<Icon name="pencil-simple" />}
					title={t({ context: "onboarding.method.write", message: "Write from scratch" })}
					description={t({
						context: "onboarding.method.writeHint",
						message: "We guide you section by section: basic information, experience, education and skills.",
					})}
					onClick={() => void manual()}
				/>
			</fieldset>
			{busy && (
				<p role="status" className="flex items-center gap-2 type-body">
					<Spinner decorative />
					{busy === "reading" ? (
						<Trans context="onboarding.import.reading">Reading the file</Trans>
					) : (
						<Trans>Creating your CV</Trans>
					)}
				</p>
			)}
			<DialogFooter>
				<Button variant="secondary" disabled={busy === "creating"} onClick={close}>
					<Trans>Cancel</Trans>
				</Button>
			</DialogFooter>
			<input
				ref={input}
				className="hidden"
				type="file"
				accept=".pdf,application/pdf"
				disabled={!!busy}
				aria-label={t`Choose a file to import`}
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = "";
					if (file) void read(file);
				}}
			/>
		</DialogContent>
	);
}
