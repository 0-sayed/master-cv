import type { Application } from "@/features/applications/types";
import type { LetterDraft } from "@/features/letters/store";
import type { CoverLetter } from "@reactive-resume/schema/cover-letter/data";
import type { CSSProperties, ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { useId, useRef, useState } from "react";
import { getFont } from "@reactive-resume/fonts";
import { coverLetterTextToHtml, defaultCoverLetterSignOff, greetingName } from "@reactive-resume/resume/cover-letter";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { SwitchRow } from "@reactive-resume/ui/components/switch";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { toast } from "@reactive-resume/ui/components/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { cn } from "@reactive-resume/utils/style";
import { CalendarDateInput } from "@/components/input/calendar-date-input";
import { FontDisplay } from "@/components/typography/font-display";
import { templates } from "@/dialogs/resume/template/data";
import { ApplicationPicker } from "@/features/applications/components/application-picker";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { useLetterWords } from "@/features/letters/compose";
import { countWords, LETTER_LENGTH, letterLength } from "@/features/letters/length";
import { LetterReviewComposer } from "@/features/letters/review";
import { discardLetterDraft, startLetterDraft, useLetterEditorStore } from "@/features/letters/store";
import { useLetterMode } from "@/features/letters/use-letter-mode";
import { RichTextEditor } from "@/features/resume/editor/write/rich-text-editor";
import { ENTER_CLASS } from "@/libs/motion";
import { client, orpc } from "@/libs/orpc/client";

const BODY_ID = "letter-body-editor";

const focusBody = () => window.setTimeout(() => document.getElementById(BODY_ID)?.focus(), 50);

import { showLetterChangeFailure as failed } from "@/features/letters/save-error";
const saveLetterChange = (
	changes: Omit<Parameters<typeof client.coverLetters.update>[0], "id" | "expectedRevision">,
	onSaved?: () => void,
) => {
	const { letter, sessionId } = useLetterEditorStore.getState();
	void updateLetter(changes)
		.then(onSaved)
		.catch((error: unknown) =>
			failed(
				error,
				() => {
					if (useLetterEditorStore.getState().sessionId === sessionId) saveLetterChange(changes, onSaved);
				},
				letter?.id,
			),
		);
};

/** Saves what's typed, then changes the letter on the server (links, the application, the resume). */
const updateLetter = (changes: Omit<Parameters<typeof client.coverLetters.update>[0], "id" | "expectedRevision">) =>
	useLetterEditorStore.getState().change((letter) =>
		client.coverLetters.update({
			id: letter.id,
			expectedRevision: letter.revision,
			sessionId: useLetterEditorStore.getState().sessionId,
			...changes,
		}),
	);

type SectionProps = { id: string; title?: ReactNode; aside?: ReactNode; children: ReactNode };

function Section({ id, title, aside, children }: SectionProps) {
	return (
		<section aria-labelledby={title ? id : undefined} className="grid gap-3 px-4 py-5">
			{title && (
				<div className="flex items-center justify-between gap-3">
					<h2 id={id} className="text-xs font-semibold tracking-[0.04em] text-ink-3 uppercase">
						{title}
					</h2>
					{aside}
				</div>
			)}
			{children}
		</section>
	);
}

/**
 * Write: who the letter is for (the application), to (recipient, company, date) and from (the resume, live or
 * copied), then the body with its length guide and a note on the design. The page beside it updates as you type.
 */
export function LetterWritePanel() {
	const letter = useLetterEditorStore((state) => state.letter);
	const draft = useLetterEditorStore((state) => state.draft);
	const { data: applications } = useQuery(applicationsListQueryOptions());
	if (!letter) return null;

	const application = applications?.find((item) => item.id === letter.sourceApplicationId) ?? null;
	const disabled = letter.isLocked;

	return (
		<div className="divide-y divide-line">
			{letter.isLocked && (
				<p className="flex items-center gap-2 bg-sunken px-4 py-2.5 text-sm text-ink-2">
					<Icon name="lock" size={18} />
					<Trans>This letter is locked. Unlock it from its menu to edit.</Trans>
				</p>
			)}
			<ForSection letter={letter} application={application} applications={applications ?? []} disabled={disabled} />
			<ToSection letter={letter} application={application} disabled={disabled} />
			<FromSection letter={letter} disabled={disabled} />
			<BodySection letter={letter} application={application} disabled={disabled} />
			{/* While a draft shows, the length is the draft's. */}
			<LengthSection content={draft.phase === "streaming" || draft.phase === "ready" ? draft.text : letter.content} />
			<DesignNote letter={letter} />
		</div>
	);
}

type ForSectionProps = {
	letter: CoverLetter;
	application: Application | null;
	applications: Application[];
	disabled: boolean;
};

/** FOR: the application the letter is for. Linking one fills the recipient; without one, drafting uses the resume. */
function ForSection({ letter, application, applications, disabled }: ForSectionProps) {
	const choose = (next: Application | null) => {
		if ((next?.id ?? null) === letter.sourceApplicationId) return;
		saveLetterChange({
			applicationId: next?.id ?? null,
			// The recipient comes from the application: its company, and its first contact when it has one.
			...(next && letter.layout === "structured"
				? { recipientCompany: next.company, recipientName: next.contacts[0]?.name ?? "" }
				: {}),
		});
	};

	return (
		<Section id="letter-for">
			<ApplicationPicker
				aria-label={t`Link job application`}
				className="w-full"
				applications={applications}
				value={application?.id ?? null}
				disabled={disabled}
				placeholder={t`Link an application`}
				noneLabel={t`No application`}
				onValueChange={(id) => choose(applications.find((item) => item.id === id) ?? null)}
			/>
			{!application && (
				<p className="type-metadata text-ink-3">
					<Trans>Without one, you fill in the recipient yourself and drafting uses only your resume.</Trans>
				</p>
			)}
		</Section>
	);
}

type LetterSectionProps = { letter: CoverLetter; application: Application | null; disabled: boolean };

/** TO: name or team, company and date for structured letters; older (freeform) letters keep their recipient block. */
function ToSection({ letter, application, disabled }: LetterSectionProps) {
	const id = useId();
	const edit = useLetterEditorStore((state) => state.edit);

	if (letter.layout === "freeform") {
		return (
			<Section id="letter-to" title={<Trans>Recipient</Trans>}>
				<RichTextEditor
					label={t`Recipient`}
					value={letter.recipient}
					disabled={disabled}
					heightClassName="min-h-[64px] max-h-[200px]"
					onChange={(recipient) => edit({ recipient })}
				/>
				<p className="text-xs text-ink-3">
					<Trans>This letter keeps its recipient as written.</Trans>
				</p>
			</Section>
		);
	}

	return (
		<Section id="letter-to" title={<Trans>Recipient</Trans>}>
			<div className="editor-panel-fields grid grid-cols-2 gap-3">
				<div className="editor-panel-short-field col-span-2 grid gap-1.5">
					<Label htmlFor={`${id}-name`}>
						<Trans>Name or team</Trans>
					</Label>
					<Input
						id={`${id}-name`}
						value={letter.recipientName}
						maxLength={200}
						placeholder={t`Hiring team`}
						disabled={disabled}
						onChange={(event) => edit({ recipientName: event.target.value })}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor={`${id}-company`}>
						<Trans>Company</Trans>
					</Label>
					<Input
						id={`${id}-company`}
						value={letter.recipientCompany}
						maxLength={200}
						disabled={disabled}
						onChange={(event) => edit({ recipientCompany: event.target.value })}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor={`${id}-date`}>
						<Trans>Date</Trans>
					</Label>
					<CalendarDateInput
						id={`${id}-date`}
						label={t`Date`}
						value={letter.letterDate ?? ""}
						disabled={disabled}
						onChange={(value) => edit({ letterDate: value || null })}
					/>
				</div>
			</div>
			<p className="text-xs text-ink-3">
				{application ? (
					<Trans>Filled from the application. The greeting follows the name.</Trans>
				) : (
					<Trans>The greeting follows the name.</Trans>
				)}
			</p>
		</Section>
	);
}

/** FROM: the resume the sender's details come from, and whether they stay live or are copied into the letter. */
function FromSection({ letter, disabled }: { letter: CoverLetter; disabled: boolean }) {
	const id = useId();
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions({ input: {} }));
	const resume = resumes?.find((item) => item.id === letter.sourceResumeId);

	const setResume = (resumeId: string | null) =>
		saveLetterChange({
			resumeId,
			// A letter taking a resume for the first time takes its details and design with it.
			...(resumeId && !letter.sourceResumeId ? { senderLinked: true, designLinked: true } : {}),
		});

	const setLinked = (senderLinked: boolean) =>
		saveLetterChange({ senderLinked }, () =>
			toast.add({
				description: senderLinked ? t`Linked to the resume again` : t`Sender details copied into the letter`,
			}),
		);

	return (
		<Section id="letter-from" title={<Trans>Sender</Trans>}>
			<div className="grid gap-1.5">
				<Label htmlFor={`${id}-resume`}>
					<Trans>Resume</Trans>
				</Label>
				<NativeSelect
					id={`${id}-resume`}
					value={letter.sourceResumeId ?? ""}
					disabled={disabled}
					onChange={(event) => setResume(event.target.value || null)}
				>
					<option value="">{t`No resume`}</option>
					{resumes?.map((item) => (
						<option key={item.id} value={item.id}>
							{item.name}
						</option>
					))}
				</NativeSelect>
			</div>
			{letter.sourceResumeId ? (
				<SwitchRow
					label={t`Use details from “${resume?.name ?? t`the resume`}”`}
					description={
						letter.senderLinked
							? t`Linked. Name, email, phone and city update when the resume does.`
							: t`Off. The letter keeps its own copy of your details.`
					}
					checked={letter.senderLinked}
					disabled={disabled}
					onCheckedChange={setLinked}
				/>
			) : (
				<p className="text-xs text-ink-3">
					<Trans>Your name and contact details come from a resume.</Trans>
				</p>
			)}
		</Section>
	);
}

/**
 * The body, edited here while the page updates. Empty, it offers a draft from the posting and the resume. A draft
 * shows on a green wash until it's kept: it never replaces typed text by itself.
 */
function BodySection({ letter, application, disabled }: LetterSectionProps) {
	const words = useLetterWords(letter.style.metadata.page.locale);
	const edit = useLetterEditorStore((state) => state.edit);
	const draft = useLetterEditorStore((state) => state.draft);
	const [writing, setWriting] = useState(false);
	const structured = letter.layout === "structured";
	const name = greetingName(letter.recipientName);
	const showEditor = writing || countWords(letter.content) > 0;

	return (
		<Section id="letter-body" title={<Trans>Letter</Trans>}>
			<LetterReviewComposer key={letter.id} letter={letter} disabled={disabled} />
			{structured && (
				<LetterFramingField
					letter={letter}
					field="greeting"
					defaultValue={name ? words.greeting(name) : words.teamGreeting}
					disabled={disabled}
				/>
			)}

			{draft.phase !== "idle" ? (
				<DraftBox
					draft={draft}
					letter={letter}
					application={application}
					onKeep={(text) => {
						edit({ content: coverLetterTextToHtml(text) });
						discardLetterDraft();
						setWriting(true);
						toast.add({ description: t`Draft kept. Edit anything you like.` });
						focusBody();
					}}
				/>
			) : showEditor ? (
				<RichTextEditor
					id={BODY_ID}
					label={t`Letter body`}
					value={letter.content}
					disabled={disabled}
					heightClassName="min-h-[240px]"
					onChange={(content) => edit({ content })}
				/>
			) : (
				<EmptyBody
					letter={letter}
					application={application}
					disabled={disabled}
					onWrite={() => {
						setWriting(true);
						focusBody();
					}}
				/>
			)}

			{structured && (
				<>
					<LetterFramingField
						letter={letter}
						field="signOff"
						defaultValue={defaultCoverLetterSignOff(letter, words)}
						disabled={disabled}
					/>
					<p className="text-xs text-ink-3">
						<Trans>
							Clear the greeting or sign-off to omit it. Clearing the sign-off also removes the automatic signature.
						</Trans>
					</p>
				</>
			)}
		</Section>
	);
}

type LetterFramingFieldProps = {
	letter: CoverLetter;
	field: "greeting" | "signOff";
	defaultValue: string;
	disabled: boolean;
};

function LetterFramingField({ letter, field, defaultValue, disabled }: LetterFramingFieldProps) {
	const id = useId();
	const edit = useLetterEditorStore((state) => state.edit);
	return (
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor={id}>{field === "greeting" ? <Trans>Greeting</Trans> : <Trans>Sign-off</Trans>}</Label>
				{letter[field] !== null && (
					<Button variant="ghost" size="sm" disabled={disabled} onClick={() => edit({ [field]: null })}>
						<Trans>Use default</Trans>
					</Button>
				)}
			</div>
			<Textarea
				id={id}
				value={letter[field] ?? defaultValue}
				maxLength={2_000}
				disabled={disabled}
				onChange={(event) => edit({ [field]: event.target.value })}
			/>
		</div>
	);
}

type EmptyBodyProps = { letter: CoverLetter; application: Application | null; disabled: boolean; onWrite: () => void };

function EmptyBody({ disabled, onWrite }: EmptyBodyProps) {
	return (
		<div className="grid justify-items-start gap-3 rounded-xl border border-dashed border-line-2 p-4">
			<p className="text-sm text-ink-2">
				<Trans>Write your letter, or review a proposal based on your confirmed CV and saved job.</Trans>
			</p>
			<Button variant="secondary" disabled={disabled} onClick={onWrite}>
				<Trans>Write it myself</Trans>
			</Button>
		</div>
	);
}

type DraftBoxProps = {
	draft: Exclude<LetterDraft, { phase: "idle" }>;
	letter: CoverLetter;
	application: Application | null;
	onKeep: (text: string) => void;
};

/** The draft on its green wash, then the dark chip: Keep, Shorter, More personal, Discard. */
function DraftBox({ draft, letter, application, onKeep }: DraftBoxProps) {
	const reducedMotion = useReducedMotion();
	// Retrying repeats the last request.
	const last = useRef<{ variant: "draft" | "shorter" | "personal"; previous?: string }>({ variant: "draft" });
	const run = (variant: "draft" | "shorter" | "personal", previous?: string) => {
		last.current = previous ? { variant, previous } : { variant };
		void startLetterDraft(variant, previous);
	};

	if (draft.phase === "failed") {
		const gateway = draft.error instanceof ORPCError && draft.error.code === "BAD_GATEWAY";
		return (
			<div role="alert" className="grid gap-2.5 rounded-xl bg-danger-soft p-3 text-[13px] text-danger-text">
				<span className="flex gap-2">
					<Icon name="warning-circle" size={18} className="shrink-0" />
					{gateway && draft.provider ? (
						<Trans>Drafting stopped: {draft.provider} didn't respond. Nothing on the page changed.</Trans>
					) : (
						<Trans>Drafting stopped. Nothing on the page changed.</Trans>
					)}
				</span>
				<div className="flex gap-1.5">
					<Button size="sm" variant="secondary" onClick={() => run(last.current.variant, last.current.previous)}>
						<Trans>Try again</Trans>
					</Button>
					<Button size="sm" variant="ghost" onClick={discardLetterDraft}>
						<Trans>Dismiss</Trans>
					</Button>
				</div>
			</div>
		);
	}

	const streaming = draft.phase === "streaming";
	// Reduced motion shows the whole draft at once.
	const text = streaming && reducedMotion ? "" : draft.text;
	const sources =
		letter.sourceResumeId && application
			? t`Draft · uses only your resume and the posting`
			: application
				? t`Draft · uses only the posting`
				: t`Draft · uses only your resume`;

	return (
		<div className="grid gap-2">
			<div
				aria-live="polite"
				aria-busy={streaming}
				className={cn(
					"min-h-[120px] rounded-lg bg-accent-soft px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap outline-[1.5px] transition-[outline-color] duration-standard outline-solid",
					draft.phase === "ready" ? "outline-accent" : "outline-transparent",
				)}
			>
				{text}
				{streaming && (
					<span className="text-ink-3">
						{reducedMotion ? <Trans>Drafting…</Trans> : <span aria-hidden="true">▍</span>}
					</span>
				)}
			</div>
			{streaming && (
				<Button size="sm" variant="ghost" className="w-fit" onClick={discardLetterDraft}>
					<Trans>Stop</Trans>
				</Button>
			)}
			{draft.phase === "ready" && (
				<div
					className={cn(ENTER_CLASS, "flex flex-wrap items-center gap-1 rounded-xl bg-ink p-1 ps-3 text-bg shadow-e3")}
				>
					<span className="me-auto flex items-center gap-1.5 py-1 text-[13px] font-medium">
						<Icon name="sparkle" size={16} />
						{sources}
					</span>
					<Button
						variant="primary"
						size="row"
						type="button"
						onClick={() => onKeep(draft.text)}
						className="justify-self-start"
					>
						<Trans>Keep</Trans>
					</Button>
					{(
						[
							["shorter", t`Shorter`],
							["personal", t`More personal`],
						] as const
					).map(([variant, label]) => (
						<button
							key={variant}
							type="button"
							onClick={() => run(variant, draft.text)}
							className="h-8 rounded-lg px-2.5 type-metadata hover:bg-accent-hover"
						>
							{label}
						</button>
					))}
					<button
						type="button"
						onClick={discardLetterDraft}
						className="h-8 rounded-lg px-2.5 type-metadata hover:bg-accent-hover"
					>
						<Trans>Discard</Trans>
					</button>
				</div>
			)}
		</div>
	);
}

/** Length: the word count against the 180 to 320 band most recruiters read, as a hint rather than a rule. */
function LengthSection({ content }: { content: string }) {
	const words = countWords(content);
	const length = letterLength(words);
	const color = length === "empty" ? "text-ink-3" : length === "comfortable" ? "text-accent-text" : "text-warn-text";
	const fill = length === "empty" ? "bg-line-2" : length === "comfortable" ? "bg-accent" : "bg-warn";
	const percent = (value: number) => `${(value / LETTER_LENGTH.scale) * 100}%`;

	return (
		<Section
			id="letter-length"
			title={<Trans>Length</Trans>}
			aside={
				<span className={cn("font-mono text-xs font-medium", color)}>
					<Plural value={words} one="# word" other="# words" />
				</span>
			}
		>
			<div aria-hidden="true" className="relative h-1.5 overflow-hidden rounded-full bg-sunken">
				<span
					className="absolute inset-y-0 bg-line-2"
					style={{
						insetInlineStart: percent(LETTER_LENGTH.min),
						width: percent(LETTER_LENGTH.max - LETTER_LENGTH.min),
					}}
				/>
				<span
					className={cn(
						"absolute inset-y-0 start-0 w-full translate-x-(--fill) rounded-full transition-[translate] duration-quick ease-enter rtl:-translate-x-(--fill)",
						fill,
					)}
					style={
						{
							"--fill": `${(Math.min(words, LETTER_LENGTH.scale) / LETTER_LENGTH.scale) * 100 - 100}%`,
						} as CSSProperties
					}
				/>
			</div>
			<p className="text-xs text-ink-3">
				{length === "empty" ? (
					<Trans>Most recruiters read 180–320 words. The shaded band shows the range.</Trans>
				) : length === "short" ? (
					<Trans>Short and direct. Fine if the posting asks for brevity.</Trans>
				) : length === "comfortable" ? (
					<Trans>A comfortable length, and it fits on one page.</Trans>
				) : (
					<Trans>Getting long. Try “Shorter”, or cut the least specific paragraph.</Trans>
				)}
			</p>
		</Section>
	);
}

/** DESIGN: what the letter looks like, and where to change it. */
function DesignNote({ letter }: { letter: CoverLetter }) {
	const [, setMode] = useLetterMode();
	const descriptionId = useId();
	const { metadata } = letter.style;
	const template = templates[metadata.template].name;
	const font = metadata.typography.body.fontFamily;
	const fontData = getFont(font);
	const description = (
		<Trans>
			Template: <bdi>{template}</bdi>. Font: <bdi>{font}</bdi>.
		</Trans>
	);

	return (
		<section
			aria-labelledby="letter-design"
			className="editor-panel-design-row flex flex-wrap items-center gap-2 px-4 py-5"
		>
			<h2 id="letter-design" className="type-label text-ink-2">
				<Trans>Design</Trans>
			</h2>
			<Tooltip>
				<TooltipTrigger render={<Badge tabIndex={0} />} aria-describedby={descriptionId}>
					<Badge
						shape="dot"
						data-shape="dot"
						aria-hidden="true"
						style={{ backgroundColor: metadata.design.colors.primary }}
					/>
					<bdi dir="ltr" aria-hidden="true">
						<FontDisplay
							family={font}
							label="Aa"
							type={fontData?.type ?? "standard"}
							url={fontData && "preview" in fontData ? fontData.preview : undefined}
							showFamily={false}
						/>
					</bdi>
					{letter.designLinked ? <Trans>Matches the CV</Trans> : <Trans>Custom design</Trans>}
				</TooltipTrigger>
				<TooltipContent>
					<span>{description}</span>
				</TooltipContent>
			</Tooltip>
			<span id={descriptionId} className="sr-only">
				{description}
			</span>
			<Button variant="secondary" size="sm" className="ms-auto shrink-0" onClick={() => setMode("design")}>
				<Trans>Change</Trans>
			</Button>
		</section>
	);
}
