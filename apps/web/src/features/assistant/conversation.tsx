import type { ChatAttachment, MessageContext } from "./chat";
import type { AssistantDocument } from "./document";
import type { AgentUIMessage, ProposeEditsOutput } from "@reactive-resume/ai/tools/agent-tool-contracts";
import type { Proposal } from "@reactive-resume/resume/proposals";
import type { OperationView } from "@reactive-resume/schema/ai-operation";
import type { IconName } from "@reactive-resume/ui/components/icon";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { agentWebSources, readPageOutputSchema } from "@reactive-resume/ai/tools/agent-tool-contracts";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Input } from "@reactive-resume/ui/components/input";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { attachmentPart, fileToBase64, transcriptOf, useAssistantChat } from "./chat";
import { useAssistantCopy } from "./copy.generated";
import { AssistantMarkdown } from "./markdown";
import { confirmedCancellation } from "./operation-state";
import { ChangeSet } from "@/features/resume/editor/proposals/proposal-list";
import { useEditorStore } from "@/features/resume/editor/store";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { isImeComposing } from "@/libs/keyboard";
import { ENTER_CLASS, POP_CLASS } from "@/libs/motion";
import { client, orpc } from "@/libs/orpc/client";

type EditStatus = Proposal["status"];
type Part = UIMessage["parts"][number];
type ToolPart = Part & {
	toolCallId?: string;
	state?: string;
	input?: unknown;
	output?: unknown;
	errorText?: string;
};

type ConversationProps = {
	threadId: string;
	initialMessages: UIMessage[];
	/** A reply was still streaming when the conversation opened. */
	activeRun: boolean;
	operationId?: string | null;
	document: AssistantDocument;
	readOnly: boolean;
	providerLabel: string;
	/** A message to send as soon as the conversation opens (the first message, ⌘K Ask). */
	prompt: string | null;
	promptAttachments: ChatAttachment[];
	initialContext: MessageContext;
	onPromptSent: () => void;
	onSwitchModel: () => void;
};

// Bound both polling and stalled requests; unmount cancellation stays separate from timeout recovery.
async function withPollingDeadline<T>(
	signal: AbortSignal,
	timeoutMs: number,
	work: (signal: AbortSignal) => Promise<T>,
) {
	const deadline = new AbortController();
	const bounded = AbortSignal.any([signal, deadline.signal]);
	let rejectAbort!: () => void;
	const aborted = new Promise<never>((_resolve, reject) => {
		rejectAbort = () => reject(bounded.reason);
		bounded.addEventListener("abort", rejectAbort, { once: true });
	});
	const timer = setTimeout(() => deadline.abort(new DOMException("Polling timed out", "TimeoutError")), timeoutMs);
	try {
		bounded.throwIfAborted();
		return await Promise.race([work(bounded), aborted]);
	} finally {
		clearTimeout(timer);
		bounded.removeEventListener("abort", rejectAbort);
	}
}

/** One conversation: the thread (role="log"), change sets and questions in it, and the composer. */
export function Conversation(props: ConversationProps) {
	const copy = useAssistantCopy();
	const { threadId, document, readOnly } = props;
	const queryClient = useQueryClient();
	const setAssistantProposals = useEditorStore((state) => state.setAssistantProposals);
	const [context, setContext] = useState<MessageContext>(props.initialContext);
	const [statuses, setStatuses] = useState<ReadonlyMap<string, EditStatus>>(new Map());
	const [stopped, setStopped] = useState(false);
	const [stopState, setStopState] = useState<"idle" | "requested" | "failed">("idle");
	const stopAttempt = useRef<AbortController | null>(null);
	const pendingDecisions = useRef(new Set<string>());
	const [pendingDecisionCount, setPendingDecisionCount] = useState(0);
	const [decisionFailure, setDecisionFailure] = useState<{ retry: () => void } | null>(null);
	const [operation, setOperation] = useState<OperationView | null>(null);
	const [resumeFailed, setResumeFailed] = useState(false);
	const [resumeAttempt, setResumeAttempt] = useState(0);
	useEffect(() => () => stopAttempt.current?.abort(), []);
	const scroller = useRef<HTMLDivElement>(null);
	// Messages already in the thread when it opens are history; only new ones rise in.
	const [initialIds] = useState(() => new Set(props.initialMessages.map((message) => message.id)));

	const refresh = () =>
		void queryClient.invalidateQueries({
			queryKey: orpc.agent.threads.list.key(),
		});
	const { messages, setMessages, sendMessage, status, error, clearError, regenerate, stop, addToolOutput } =
		useAssistantChat({
			threadId,
			initialMessages: props.initialMessages,
			resume: props.activeRun && !props.operationId,
			context,
			onFinish: refresh,
		});
	const streaming =
		status === "submitted" ||
		status === "streaming" ||
		Boolean(operation && ["queued", "running", "cancel_requested"].includes(operation.state));
	useEffect(() => {
		if (!props.operationId) return;
		const controller = new AbortController();
		const recover = async () => {
			try {
				await withPollingDeadline(controller.signal, 120_000, async (signal) => {
					let outcome;
					do {
						outcome = await client.agent.messages.operationStatus({ threadId }, { signal });
						signal.throwIfAborted();
						setOperation(outcome.operation);
						setResumeFailed(false);
						if (!["queued", "running", "cancel_requested"].includes(outcome.operation.state)) break;
						await new Promise<void>((resolve) => setTimeout(resolve, 1000));
					} while (!signal.aborted);
					signal.throwIfAborted();
					if (outcome.operation.resultId) {
						const result = await client.agent.messages.operationResult({ threadId }, { signal });
						signal.throwIfAborted();
						const recovered: AgentUIMessage = {
							id: outcome.operation.id,
							role: "assistant",
							parts: [{ type: "text", text: typeof result.text === "string" ? result.text : JSON.stringify(result) }],
						};
						setMessages((current) =>
							current.some((message) => message.id === recovered.id) ? current : [...current, recovered],
						);
					}
					setStopped(confirmedCancellation(outcome.operation));
				});
			} catch {
				if (!controller.signal.aborted) setResumeFailed(true);
			}
		};
		void recover();
		return () => controller.abort();
	}, [props.operationId, threadId, resumeAttempt, setMessages]);

	const send = (text: string, attachments: ChatAttachment[] = []) => {
		if (streaming || readOnly) return;
		clearError();
		setStopped(false);
		const files = attachments.map(attachmentPart);
		sendMessage(files.length > 0 ? { text, files } : { text }, {
			body: { attachmentIds: attachments.map((attachment) => attachment.id) },
		});
	};

	// The first message (or ⌘K's question) goes out once the conversation is open.
	const { prompt, promptAttachments, onPromptSent } = props;
	const sentPrompt = useRef(false);
	useEffect(() => {
		if (!prompt || sentPrompt.current) return;
		sentPrompt.current = true;
		onPromptSent();
		const files = promptAttachments.map(attachmentPart);
		sendMessage(files.length > 0 ? { text: prompt, files } : { text: prompt }, {
			body: {
				attachmentIds: promptAttachments.map((attachment) => attachment.id),
			},
		});
	}, [prompt, promptAttachments, onPromptSent, sendMessage]);

	// A failed continuation (after an answer) is sent again as it was; regenerating would drop the answer.
	const retry = () => {
		clearError();
		if (lastAssistantMessageIsCompleteWithToolCalls({ messages })) void sendMessage();
		else void regenerate();
	};

	const stopReply = async () => {
		if (stopState === "requested") return;
		const controller = new AbortController();
		stopAttempt.current?.abort();
		stopAttempt.current = controller;
		setStopState("requested");
		try {
			await withPollingDeadline(controller.signal, 30_000, async (signal) => {
				if (!props.operationId && !operation) {
					await client.agent.messages.stop({ threadId }, { signal });
					signal.throwIfAborted();
					setStopped(true);
				} else {
					let outcome = await client.agent.messages.stopOperation({ threadId }, { signal });
					while (["queued", "running", "cancel_requested"].includes(outcome.state)) {
						await new Promise<void>((resolve) => setTimeout(resolve, 1000));
						signal.throwIfAborted();
						outcome = (await client.agent.messages.operationStatus({ threadId }, { signal })).operation;
					}
					signal.throwIfAborted();
					setOperation(outcome);
					setStopped(confirmedCancellation(outcome));
				}
				setStopState("idle");
				await stop();
				refresh();
			});
		} catch {
			if (!controller.signal.aborted) setStopState("failed");
		}
	};

	// Every proposed edit in the conversation, with what the user did with it: marked on the page while pending.
	const proposals = useMemo(
		() =>
			messages.flatMap((message) =>
				message.parts.flatMap((part) => (isProposeEdits(part) ? toProposals(part, statuses, document) : [])),
			),
		[messages, statuses, document],
	);
	// oxlint-disable-next-line react/set-state-in-effect -- publishes to the editor store, which the page canvas reads
	useEffect(() => setAssistantProposals(proposals), [proposals, setAssistantProposals]);
	useEffect(() => () => setAssistantProposals([]), [setAssistantProposals]);

	const record = (message: UIMessage, part: ToolPart, changed: readonly Proposal[], next: EditStatus) => {
		if (!part.toolCallId) return;
		const key = `${message.id}:${part.toolCallId}:${changed.map((proposal) => proposal.id).join(",")}:${next}`;
		if (pendingDecisions.current.has(key)) return;
		pendingDecisions.current.add(key);
		setPendingDecisionCount((count) => count + 1);
		setDecisionFailure(null);
		void client.agent.messages
			.setEditStatus({
				threadId,
				messageId: message.id,
				toolCallId: part.toolCallId,
				edits: changed.map((proposal) => ({ id: proposal.id, status: next, expectedStatus: proposal.status })),
			})
			.then(() => {
				setStatuses((current) => new Map([...current, ...changed.map((proposal) => [proposal.id, next] as const)]));
				refresh();
			})
			.catch(() => setDecisionFailure({ retry: () => record(message, part, changed, next) }))
			.finally(() => {
				pendingDecisions.current.delete(key);
				setPendingDecisionCount((count) => count - 1);
			});
	};

	const recordUndone = useEffectEvent(record);

	// Undoing an accepted edit makes it pending again.
	useEffect(() => {
		for (const message of messages) {
			for (const part of message.parts) {
				if (!isProposeEdits(part)) continue;
				const undone = toProposals(part, statuses, document).filter(
					(proposal) => proposal.status === "accepted" && document.stateOf(proposal) === "pending",
				);
				// oxlint-disable-next-line react/set-state-in-effect -- an undo happens in the resume store; the new status is also saved to the thread
				if (undone.length > 0) recordUndone(message, part, undone, "pending");
			}
		}
	}, [messages, statuses, document]);

	// Follows the reply while it streams, unless the user scrolled up to read.
	useEffect(() => {
		const element = scroller.current;
		if (!element || !streaming) return;
		if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) element.scrollTop = element.scrollHeight;
	});
	useEffect(() => {
		scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
	}, []);

	const last = messages.at(-1);
	const proposedInLast = last?.role === "assistant" && last.parts.some(isProposeEdits);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div
				ref={scroller}
				role="log"
				aria-live="polite"
				aria-label={t`Conversation`}
				className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
			>
				{messages.map((message, index) => (
					<MessageView
						key={message.id}
						message={message}
						streaming={streaming && index === messages.length - 1}
						enter={!initialIds.has(message.id)}
						readOnly={readOnly || pendingDecisionCount > 0}
						statuses={statuses}
						document={document}
						onAnswer={(toolCallId, answer) =>
							addToolOutput({
								tool: "ask_user_question",
								toolCallId,
								output: answer,
							})
						}
						onRecord={record}
					/>
				))}

				{status === "submitted" && (
					<p className={cn("flex items-center gap-2 text-sm text-ink-3", ENTER_CLASS)}>
						<Spinner decorative className="size-3.5" />
						<Trans>Thinking…</Trans>
					</p>
				)}

				{stopState === "requested" && (
					<Alert variant="info">
						<Icon name="stop-circle" />
						<AlertTitle>
							<Trans>Stop requested</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>Waiting for the server to confirm cancellation.</Trans>
						</AlertDescription>
					</Alert>
				)}
				{resumeFailed && (
					<Alert variant="warn">
						<Icon name="warning-circle" />
						<AlertTitle>{copy("review.assistant.error.unavailableTitle")}</AlertTitle>
						<AlertDescription>
							<Button variant="secondary" onClick={() => setResumeAttempt((attempt) => attempt + 1)}>
								<Trans>Retry</Trans>
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{stopState === "failed" && (
					<Alert variant="error">
						<Icon name="warning-circle" />
						<AlertTitle>
							<Trans>Couldn't stop the assistant. Work may still be active.</Trans>
						</AlertTitle>
						<AlertDescription>
							<Button variant="secondary" onClick={() => void stopReply()}>
								<Trans>Retry stop</Trans>
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{decisionFailure && (
					<Alert variant="error">
						<Icon name="warning-circle" />
						<AlertTitle>
							<Trans>Your decision wasn't saved</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>The previous confirmed decision is kept.</Trans>
							<Button variant="secondary" onClick={decisionFailure.retry}>
								<Trans>Retry saving decision</Trans>
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{pendingDecisionCount > 0 && (
					<p role="status" className="type-meta text-ink-2">
						<Trans>Saving decision…</Trans>
					</p>
				)}
				{stopped && !streaming && !proposedInLast && (
					<p className="flex items-center gap-2 text-sm text-ink-2 transition-opacity duration-standard ease-enter starting:opacity-0">
						<Icon name="stop-circle" size={18} className="text-ink-3" />
						<Trans>Stopped. No edits were proposed.</Trans>
						<button
							type="button"
							className="font-medium underline underline-offset-2"
							onClick={() => send(t`Continue`)}
						>
							<Trans>Continue</Trans>
						</button>
					</p>
				)}

				{error && !streaming && (
					<div
						role="alert"
						className="grid gap-2 rounded-xl bg-danger-soft p-3 text-[13px] text-danger-text transition-opacity duration-standard ease-enter starting:opacity-0"
					>
						<span className="flex gap-2">
							<Icon name="warning-circle" size={18} className="shrink-0" />
							<Trans>
								{props.providerLabel} returned “
								{getOrpcErrorMessage(error, {
									fallback: t`an error`,
									allowServerMessage: true,
								})}
								”. Your message is kept.
							</Trans>
						</span>
						<span className="flex gap-1.5">
							<Button size="sm" variant="secondary" onClick={retry}>
								<Trans>Retry</Trans>
							</Button>
							<Button size="sm" variant="ghost" onClick={props.onSwitchModel}>
								<Trans>Switch model</Trans>
							</Button>
						</span>
					</div>
				)}

				{!streaming && messages.length > 0 && (
					<div className="flex justify-end transition-opacity duration-standard ease-enter starting:opacity-0">
						<Button size="sm" variant="ghost" className="text-ink-3" onClick={() => void copyTranscript(messages)}>
							<Icon name="copy" size={16} />
							<Trans>Copy transcript</Trans>
						</Button>
					</div>
				)}
			</div>

			<Composer
				document={document}
				context={context}
				onContextChange={setContext}
				providerLabel={props.providerLabel}
				streaming={streaming}
				disabled={readOnly}
				threadId={threadId}
				onSend={send}
				onStop={() => void stopReply()}
			/>
		</div>
	);
}

const isProposeEdits = (part: Part): part is ToolPart =>
	part.type === "tool-propose_edits" && (part as ToolPart).state === "output-available";

function toProposals(
	part: ToolPart,
	statuses: ReadonlyMap<string, EditStatus>,
	document: AssistantDocument,
): Proposal[] {
	const output = part.output as ProposeEditsOutput | undefined;
	return (output?.edits ?? []).map((edit) => {
		const target = {
			sectionId: edit.target.sectionId,
			field: edit.target.field,
			...(edit.target.itemId === undefined ? {} : { itemId: edit.target.itemId }),
			...(edit.target.roleId === undefined ? {} : { roleId: edit.target.roleId }),
		};
		return {
			...edit,
			target,
			location: document.locationOf({ ...edit, target }) ?? edit.location,
			status: statuses.get(edit.id) ?? edit.status,
			source: "assistant",
		};
	});
}

type MessageViewProps = {
	message: UIMessage;
	streaming: boolean;
	enter: boolean;
	readOnly: boolean;
	statuses: ReadonlyMap<string, EditStatus>;
	document: AssistantDocument;
	onAnswer: (toolCallId: string, answer: string) => void;
	onRecord: (message: UIMessage, part: ToolPart, proposals: readonly Proposal[], status: EditStatus) => void;
};

function MessageView({
	message,
	streaming,
	enter,
	readOnly,
	statuses,
	document,
	onAnswer,
	onRecord,
}: MessageViewProps) {
	if (message.role === "user") {
		const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
		const files = message.parts.filter((part) => part.type === "file");
		return (
			<div className={cn("ms-8 grid justify-items-end gap-1", enter && ENTER_CLASS)}>
				{text && <p className="rounded-[12px_12px_4px_12px] bg-sunken px-3 py-2 text-sm whitespace-pre-wrap">{text}</p>}
				{files.map((file) => (
					<span key={file.url} className="flex items-center gap-1 rounded-md bg-sunken px-2 py-1 text-xs text-ink-2">
						<Icon name="paperclip" size={14} />
						{(file as { filename?: string }).filename ?? t`Attachment`}
					</span>
				))}
			</div>
		);
	}

	const sources = agentWebSources(message);
	const lastTextIndex = message.parts.findLastIndex((part) => part.type === "text");

	return (
		<div className={cn("grid gap-3 text-sm", enter && ENTER_CLASS)}>
			{message.parts.map((part, index) => {
				const key = `${message.id}-${index}`;
				if (part.type === "text")
					return (
						<div key={key}>
							<AssistantMarkdown text={part.text} />
							{streaming && index === lastTextIndex && (
								<span aria-hidden="true" className="ms-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-ink" />
							)}
						</div>
					);
				return (
					<ToolPartView
						key={key}
						part={part as ToolPart}
						streaming={streaming}
						message={message}
						readOnly={readOnly}
						statuses={statuses}
						document={document}
						onAnswer={onAnswer}
						onRecord={onRecord}
					/>
				);
			})}
			{sources.length > 0 && (
				<div className="grid gap-1 text-xs">
					<span className="font-medium text-ink-3">
						<Trans>Sources</Trans>
					</span>
					{sources.map((source) => (
						<a
							key={source.url}
							href={source.url}
							target="_blank"
							rel="noreferrer"
							className="truncate text-accent-text underline underline-offset-2"
						>
							{source.title?.trim() || source.url}
						</a>
					))}
				</div>
			)}
		</div>
	);
}

type ToolPartViewProps = Omit<MessageViewProps, "enter"> & { part: ToolPart };

function ToolPartView({
	part,
	streaming,
	message,
	readOnly,
	statuses,
	document,
	onAnswer,
	onRecord,
}: ToolPartViewProps) {
	const working = part.state === "input-streaming" || part.state === "input-available";

	switch (part.type) {
		case "tool-read_resume":
		case "tool-read_letter":
			return (
				<Status working={working}>
					{part.type === "tool-read_letter" ? <Trans>Read the letter</Trans> : <Trans>Read the resume</Trans>}
				</Status>
			);
		case "tool-read_attachment":
			return (
				<Status working={working}>
					<Trans>Read the attachment</Trans>
				</Status>
			);
		case "tool-web_search":
		case "tool-google_search":
		case "tool-search_web":
		case "tool-read_page": {
			const reading = part.type === "tool-read_page";
			if (working && !streaming)
				return (
					<p className="text-xs text-ink-3">
						{reading ? <Trans>Page reading didn't finish.</Trans> : <Trans>Web search didn't finish.</Trans>}
					</p>
				);
			if (part.state === "output-error")
				return (
					<p role="alert" className="text-xs text-danger-text">
						{reading ? (
							<Trans>Couldn't read this page: {part.errorText}</Trans>
						) : (
							<Trans>Web search failed: {part.errorText}</Trans>
						)}
					</p>
				);
			const page = reading ? readPageOutputSchema.safeParse(part.output) : null;
			return (
				<div className="grid gap-1">
					<Status working={working}>
						{reading ? (
							working ? (
								<Trans>Reading page…</Trans>
							) : (
								<Trans>Read the page</Trans>
							)
						) : working ? (
							<Trans>Searching the web…</Trans>
						) : (
							<Trans>Searched the web</Trans>
						)}
					</Status>
					{page?.success && (page.data.truncated || page.data.completeness === "incomplete") && (
						<p className="text-xs text-ink-3">
							<Trans>This page is clipped or incomplete. Check the original before using it.</Trans>
						</p>
					)}
					{page?.success && page.data.fallbackReason && (
						<p className="text-xs text-ink-3">
							<Trans>Enhanced reading unavailable; used the built-in reader.</Trans>
						</p>
					)}
				</div>
			);
		}
		case "tool-apply_resume_patch":
			// Conversations from before the assistant only proposed edits.
			return (
				<Status working={false}>
					<Trans>Changed the resume directly (an earlier conversation)</Trans>
				</Status>
			);
		case "tool-ask_user_question":
			return <QuestionCard part={part} readOnly={readOnly} onAnswer={onAnswer} />;
		case "tool-propose_edits": {
			if (part.state === "output-error")
				return (
					<p className="text-xs text-danger-text">
						<Trans>Couldn't propose these edits: {part.errorText}</Trans>
					</p>
				);
			if (part.state !== "output-available")
				return (
					<Status working>
						<Trans>Preparing edits…</Trans>
					</Status>
				);
			const output = part.output as ProposeEditsOutput;
			const proposals = toProposals(part, statuses, document);
			const states = proposals.map(document.stateOf);
			const pending = states.filter((state) => state === "pending").length;
			const accepted = states.filter((state) => state === "accepted").length;
			return (
				<div className="grid gap-1.5">
					{proposals.length > 0 && (
						<ChangeSet
							proposals={proposals}
							states={states}
							locked={readOnly}
							title={
								pending > 0 ? (
									<Plural value={proposals.length} one="# proposed edit" other="# proposed edits" />
								) : (
									<Trans>
										{accepted} of {proposals.length} applied
									</Trans>
								)
							}
							onAccept={(chosen) => {
								document.accept(chosen);
								onRecord(message, part, chosen, "accepted");
							}}
							onReject={(chosen) => onRecord(message, part, chosen, "rejected")}
						/>
					)}
					{output.skipped.length > 0 && (
						<p className="text-xs text-ink-3">
							<Plural
								value={output.skipped.length}
								one="# edit couldn't be placed: its text changed. Ask again to redo it."
								other="# edits couldn't be placed: their text changed. Ask again to redo them."
							/>
						</p>
					)}
				</div>
			);
		}
		default:
			return null;
	}
}

function Status({ working, children }: { working: boolean; children: ReactNode }) {
	return (
		<p className="flex items-center gap-1.5 text-xs text-ink-3">
			{/* A fixed 14px slot, so the label doesn't shift when the spinner turns into a check. */}
			<span className="grid size-3.5 shrink-0 place-items-center">
				{working ? <Spinner decorative className="size-3" /> : <Icon name="check" size={14} className={POP_CLASS} />}
			</span>
			{children}
		</p>
	);
}

type QuestionCardProps = {
	part: ToolPart;
	readOnly: boolean;
	onAnswer: (toolCallId: string, answer: string) => void;
};

/** The assistant asks before writing anything the document doesn't say: an info-soft card with its choices. */
function QuestionCard({ part, readOnly, onAnswer }: QuestionCardProps) {
	const id = useId();
	const [other, setOther] = useState("");
	const input = (part.input ?? {}) as { question?: unknown; choices?: unknown };
	const question = typeof input.question === "string" ? input.question : "";
	const choices = Array.isArray(input.choices)
		? input.choices.filter((choice): choice is string => typeof choice === "string")
		: [];
	const answer = part.state === "output-available" && typeof part.output === "string" ? part.output : null;
	const toolCallId = part.toolCallId;
	if (!question) return null;

	return (
		<div className="grid gap-2.5 rounded-xl bg-info-soft p-3 text-info-text">
			<p className="text-sm font-medium">{question}</p>
			{answer !== null ? (
				<p className="text-[13px] opacity-80">
					<Trans>You answered: {answer}</Trans>
				</p>
			) : readOnly || !toolCallId ? null : (
				<>
					{choices.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{choices.map((choice) => (
								<Button key={choice} size="sm" variant="secondary" onClick={() => onAnswer(toolCallId, choice)}>
									{choice}
								</Button>
							))}
						</div>
					)}
					<form
						className="flex gap-1.5"
						onSubmit={(event) => {
							event.preventDefault();
							if (other.trim()) onAnswer(toolCallId, other.trim());
						}}
					>
						<label htmlFor={id} className="sr-only">
							<Trans>Answer in your own words</Trans>
						</label>
						<Input
							size="sm"
							dir="auto"
							id={id}
							value={other}
							onChange={(event) => setOther(event.target.value)}
							placeholder={t`Or in your own words…`}
							className="min-w-0 flex-1"
						/>
						<Button type="submit" size="sm" disabled={!other.trim()}>
							<Trans>Send</Trans>
						</Button>
					</form>
				</>
			)}
		</div>
	);
}

type ComposerProps = {
	document: AssistantDocument;
	context: MessageContext;
	onContextChange: (context: MessageContext) => void;
	providerLabel: string;
	streaming: boolean;
	disabled: boolean;
	/** Attachments need a conversation to belong to. */
	threadId: string | null;
	/** Creates a draft conversation lazily for the first attachment. */
	ensureThread?: () => Promise<string>;
	onSend: (text: string, attachments?: ChatAttachment[]) => void;
	onStop: () => void;
};

/**
 * Context chips (removing one leaves it out of what's sent), a two-row text box, Send (Stop while a reply streams)
 * and the line saying what's sent where.
 */
export function Composer(props: ComposerProps) {
	const { document, context, onContextChange, streaming, disabled } = props;
	const id = useId();
	const [text, setText] = useState("");
	const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
	const [uploading, setUploading] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const hasText = text.trim().length > 0;

	const submit = () => {
		if (!hasText || streaming || disabled || uploading) return;
		props.onSend(text.trim(), attachments);
		setText("");
		setAttachments([]);
	};

	const upload = async (files: FileList | null) => {
		if (!files?.length) return;
		setUploading(true);
		try {
			const threadId = props.threadId ?? (await props.ensureThread?.());
			if (!threadId) return;
			const uploaded = await Promise.all(
				Array.from(files).map(async (file) => {
					const attachment = await client.agent.attachments.create({
						threadId,
						filename: file.name,
						mediaType: file.type || "application/octet-stream",
						data: await fileToBase64(file),
					});
					return {
						id: attachment.id,
						filename: attachment.filename,
						mediaType: attachment.mediaType,
					};
				}),
			);
			setAttachments((current) => [...current, ...uploaded]);
		} catch (error) {
			toast.add({
				type: "error",
				description: getOrpcErrorMessage(error, {
					fallback: t`Couldn't attach the file.`,
				}),
			});
		} finally {
			setUploading(false);
			if (fileInput.current) fileInput.current.value = "";
		}
	};

	const chips = [
		{
			key: "document" as const,
			icon: document.kind === "letter" ? ("envelope-simple" as const) : ("file-text" as const),
			label: document.name,
		},
		...(document.posting
			? [
					{
						key: "posting" as const,
						icon: "briefcase" as const,
						label: t`${document.posting.company} posting`,
					},
				]
			: []),
	].filter((chip) => context[chip.key]);

	const provider = props.providerLabel;
	const sharesPosting = context.posting && document.posting;
	const disclosure = context.document
		? document.kind === "letter"
			? sharesPosting
				? t`Sends this letter and the posting to ${provider} with your key, only when you press send.`
				: t`Sends this letter to ${provider} with your key, only when you press send.`
			: sharesPosting
				? t`Sends this resume and the posting to ${provider} with your key, only when you press send.`
				: t`Sends this resume to ${provider} with your key, only when you press send.`
		: sharesPosting
			? t`Sends your message and the posting to ${provider} with your key, only when you press send.`
			: t`Sends your message to ${provider} with your key, only when you press send.`;

	return (
		<div className="grid gap-2 border-t border-line bg-surface px-3 pt-2.5 pb-3">
			<p className="type-meta text-ink-2">
				<Trans>This task uses 1 assistant operation when its result is saved.</Trans>
			</p>
			{(chips.length > 0 || attachments.length > 0) && (
				<div className="flex flex-wrap gap-1.5">
					{chips.map((chip) => (
						<RemovableChip
							key={chip.key}
							icon={chip.icon}
							label={chip.label}
							maxWidth="max-w-[160px]"
							removeLabel={t`Don't send ${chip.label}`}
							onRemove={() => onContextChange({ ...context, [chip.key]: false })}
						/>
					))}
					{attachments.map((attachment) => (
						<RemovableChip
							key={attachment.id}
							icon="paperclip"
							label={attachment.filename}
							maxWidth="max-w-[140px]"
							removeLabel={t`Remove ${attachment.filename}`}
							onRemove={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
						/>
					))}
				</div>
			)}

			<div className="flex items-end gap-1.5 rounded-xl border border-line-2 bg-raised p-1.5 transition-[border-color,box-shadow] focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
				<label htmlFor={id} className="sr-only">
					<Trans>Message the assistant</Trans>
				</label>
				<textarea
					dir="auto"
					id={id}
					rows={2}
					value={text}
					disabled={disabled}
					placeholder={t`Ask, or describe a change…`}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey && !isImeComposing(event)) {
							event.preventDefault();
							submit();
						}
						if (event.key === "Escape" && streaming) {
							event.preventDefault();
							props.onStop();
						}
					}}
					className="field-sizing-content max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-ink-3"
				/>
				{(props.threadId || props.ensureThread) && (
					<>
						<IconButton
							icon="paperclip"
							label={t`Attach a file`}
							size="icon-sm"
							disabled={disabled || uploading}
							className="text-ink-2"
							onClick={() => fileInput.current?.click()}
						/>
						<input
							dir="auto"
							ref={fileInput}
							type="file"
							multiple
							className="hidden"
							onChange={(event) => void upload(event.target.files)}
						/>
					</>
				)}
				<button
					type="button"
					aria-label={streaming ? t`Stop` : t`Send`}
					disabled={!streaming && (!hasText || disabled || uploading)}
					onClick={streaming ? props.onStop : submit}
					className={cn(
						"grid size-[34px] shrink-0 place-items-center rounded-lg transition-[background-color,color,scale] duration-quick ease-enter enabled:active:scale-[0.97]",
						streaming ? "bg-ink text-bg" : hasText ? "bg-accent text-on-accent" : "bg-sunken text-ink-3",
					)}
				>
					<Icon name={streaming ? "stop" : "arrow-up"} size={20} />
				</button>
			</div>

			<p className="text-xs leading-4 text-ink-3">
				{disclosure}{" "}
				{!context.document || !context.posting ? (
					<Trans>
						Each send starts fresh with this message and selected files. Previous conversation history stays here.
					</Trans>
				) : (
					<Trans>Previous messages, including document details, are also sent.</Trans>
				)}
			</p>
		</div>
	);
}

type RemovableChipProps = {
	icon: IconName;
	label: string;
	/** The label's max-width class (Tailwind needs the whole class name in the source). */
	maxWidth: string;
	removeLabel: string;
	onRemove: () => void;
};

function RemovableChip({ icon, label, maxWidth, removeLabel, onRemove }: RemovableChipProps) {
	return (
		<span className="flex h-[26px] items-center gap-1 rounded-md bg-sunken ps-2 text-xs text-ink-2">
			<Icon name={icon} size={15} />
			<span className={cn(maxWidth, "truncate")}>{label}</span>
			<button
				type="button"
				aria-label={removeLabel}
				onClick={onRemove}
				className="grid size-5 place-items-center rounded text-ink-3 transition-colors hover:bg-hover hover:text-ink"
			>
				<Icon name="x" size={14} />
			</button>
		</span>
	);
}

async function copyTranscript(messages: readonly UIMessage[]) {
	try {
		await navigator.clipboard.writeText(
			transcriptOf(messages, {
				user: t`You`,
				assistant: t`Assistant`,
				sources: t`Sources`,
			}),
		);
		toast.add({ description: t`Transcript copied` });
	} catch {
		toast.add({ description: t`Couldn't copy the transcript.` });
	}
}
