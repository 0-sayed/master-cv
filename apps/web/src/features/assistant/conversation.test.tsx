// @vitest-environment happy-dom
import type { AssistantDocument } from "./document";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({
	chat: vi.fn(),
	send: vi.fn(),
	attach: vi.fn(),
	publish: vi.fn(),
	cancel: vi.fn(),
	operationStatus: vi.fn(),
	decision: vi.fn(),
	operationResult: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/features/resume/editor/store", () => ({
	useEditorStore: (select: (state: unknown) => unknown) => select({ setAssistantProposals: mocks.publish }),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: {
		agent: {
			messages: {
				stopOperation: mocks.cancel,
				operationStatus: mocks.operationStatus,
				operationResult: mocks.operationResult,
				setEditStatus: mocks.decision,
			},
			attachments: { create: mocks.attach },
		},
	},
	orpc: { agent: { threads: { list: { key: () => ["threads"] } } } },
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("./chat", () => ({
	useAssistantChat: mocks.chat,
	fileToBase64: async () => "Zm9v",
	attachmentPart: (file: { id: string; filename: string; mediaType: string }) => ({
		type: "file",
		url: `agent-attachment:${file.id}`,
		filename: file.filename,
		mediaType: file.mediaType,
	}),
	transcriptOf: () => "",
}));

import { Composer, Conversation } from "./conversation";

const document: AssistantDocument = {
	kind: "resume",
	id: "resume-1",
	name: "Resume",
	locked: false,
	posting: { id: "application-2", company: "Selected Company", role: "Engineer" },
	stateOf: () => "pending",
	accept: () => {},
	locationOf: () => undefined,
};
beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.chat.mockReturnValue({ messages: [], sendMessage: mocks.send, status: "ready", clearError: vi.fn() });
	mocks.attach.mockResolvedValue({ id: "file-1", filename: "posting.txt", mediaType: "text/plain" });
});
afterEach(cleanup);

it("uploads a file in the initial composer before sending its first message", async () => {
	const ensureThread = vi.fn(async () => "draft-thread");
	const send = vi.fn();
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<Composer
				document={document}
				context={{ document: false, posting: false }}
				onContextChange={() => {}}
				providerLabel="Local"
				streaming={false}
				disabled={false}
				threadId={null}
				ensureThread={ensureThread}
				onSend={send}
				onStop={() => {}}
			/>
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Attach a file" })).toBeDefined();
	const input = container.querySelector('input[type="file"]');
	if (!input) throw new Error("File picker missing");
	fireEvent.change(input, { target: { files: [new File(["foo"], "posting.txt", { type: "text/plain" })] } });
	await waitFor(() => expect(screen.getByText("posting.txt")).toBeDefined());
	expect(mocks.attach).toHaveBeenCalledWith({
		threadId: "draft-thread",
		filename: "posting.txt",
		mediaType: "text/plain",
		data: "Zm9v",
	});
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Review this posting" } });
	fireEvent.click(screen.getByRole("button", { name: "Send" }));
	expect(send).toHaveBeenCalledWith("Review this posting", [
		{ id: "file-1", filename: "posting.txt", mediaType: "text/plain" },
	]);
});

it("preserves first-message context exclusions, selected application and attachment IDs", async () => {
	const context = { document: false, posting: true, applicationId: "application-2" };
	render(
		<I18nProvider i18n={i18n}>
			<Conversation
				document={document}
				threadId="thread-1"
				initialMessages={[]}
				activeRun={false}
				readOnly={false}
				providerLabel="Local"
				initialContext={context}
				prompt="Prepare"
				promptAttachments={[{ id: "file-1", filename: "posting.txt", mediaType: "text/plain" }]}
				onPromptSent={() => {}}
				onSwitchModel={() => {}}
			/>
		</I18nProvider>,
	);
	await waitFor(() =>
		expect(mocks.send).toHaveBeenCalledWith(
			{ text: "Prepare", files: [expect.objectContaining({ url: "agent-attachment:file-1" })] },
			{ body: { attachmentIds: ["file-1"] } },
		),
	);
	expect(mocks.chat.mock.calls[0]?.[0].context).toEqual(context);
});

it("reopens native and custom web results with sources, clipping and failed or unfinished tool status", () => {
	const messages = [
		{
			id: "web-history",
			role: "assistant",
			parts: [
				{ type: "tool-web_search", toolCallId: "old-native", state: "output-available", input: {}, output: {} },
				{ type: "source-url", sourceId: "native", url: "https://company.example/job", title: "Company role" },
				{
					type: "tool-search_web",
					toolCallId: "failed",
					state: "output-error",
					input: {},
					errorText: "Enhanced access quota exhausted",
				},
				{ type: "tool-google_search", toolCallId: "stopped", state: "input-available", input: {} },
				{
					type: "tool-read_page",
					toolCallId: "read",
					state: "output-available",
					input: { url: "https://careers.example/role" },
					output: {
						requestedUrl: "https://careers.example/role",
						content: "Description",
						format: "text",
						method: "builtin",
						retrievedAt: "2026-09-30T12:00:00Z",
						truncated: true,
						completeness: "incomplete",
					},
				},
			],
		},
	];
	mocks.chat.mockReturnValue({ messages, status: "ready", clearError: vi.fn() });
	render(
		<I18nProvider i18n={i18n}>
			<Conversation
				document={document}
				threadId="thread-1"
				initialMessages={[]}
				activeRun={false}
				readOnly={false}
				providerLabel="Local"
				initialContext={{ document: true, posting: true }}
				prompt={null}
				promptAttachments={[]}
				onPromptSent={() => {}}
				onSwitchModel={() => {}}
			/>
		</I18nProvider>,
	);
	expect(screen.getAllByText("Searched the web")).toHaveLength(1);
	expect(screen.getByRole("alert").textContent).toContain("Enhanced access quota exhausted");
	expect(screen.getByText("Web search didn't finish.")).toBeDefined();
	expect(screen.getByText("This page is clipped or incomplete. Check the original before using it.")).toBeDefined();
	expect(screen.getByRole("link", { name: "Company role" }).getAttribute("href")).toBe("https://company.example/job");
	expect(screen.getByRole("link", { name: "https://careers.example/role" }).getAttribute("href")).toBe(
		"https://careers.example/role",
	);
});

it("keeps work active when Stop fails and only confirms cancellation after server acknowledgment", async () => {
	let resolve!: (value: { state: string }) => void;
	let reject!: (cause: Error) => void;
	const promise = new Promise<{ state: string }>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	const response = { promise, resolve, reject };
	const localStop = vi.fn();
	mocks.cancel.mockReturnValueOnce(response.promise).mockResolvedValueOnce({ state: "cancelled" });
	mocks.chat.mockReturnValue({
		messages: [],
		sendMessage: mocks.send,
		status: "streaming",
		clearError: vi.fn(),
		stop: localStop,
	});
	render(
		<I18nProvider i18n={i18n}>
			<Conversation
				document={document}
				threadId="thread-1"
				initialMessages={[]}
				activeRun={true}
				readOnly={false}
				providerLabel="Local"
				initialContext={{ document: true, posting: true }}
				prompt={null}
				promptAttachments={[]}
				onPromptSent={() => {}}
				onSwitchModel={() => {}}
			/>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
	expect(localStop).not.toHaveBeenCalled();
	response.reject(new Error("Offline"));
	await waitFor(() => expect(screen.getByText("Couldn't stop the assistant. Work may still be active.")).toBeDefined());
	expect(localStop).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Retry stop" }));
	await waitFor(() => expect(localStop).toHaveBeenCalledTimes(1));
});

it("recovers a persisted bounded result without attempting a Redis stream", async () => {
	const setMessages = vi.fn();
	mocks.chat.mockReturnValue({ messages: [], status: "ready", setMessages, clearError: vi.fn(), stop: vi.fn() });
	mocks.operationStatus.mockResolvedValue({
		capability: "completed",
		operation: { id: "operation", state: "waiting_review", resultId: "operation", failureCode: null },
	});
	mocks.operationResult.mockResolvedValue({ text: "Recovered private result" });
	render(
		<I18nProvider i18n={i18n}>
			<Conversation
				document={document}
				threadId="thread-1"
				operationId="operation"
				initialMessages={[]}
				activeRun={true}
				readOnly={false}
				providerLabel="Local"
				initialContext={{ document: true, posting: false }}
				prompt={null}
				promptAttachments={[]}
				onPromptSent={() => {}}
				onSwitchModel={() => {}}
			/>
		</I18nProvider>,
	);
	await waitFor(() => expect(mocks.operationResult).toHaveBeenCalledWith({ threadId: "thread-1" }, expect.anything()));
	expect(mocks.chat.mock.calls.at(-1)?.[0].resume).toBe(false);
	expect(setMessages).toHaveBeenCalled();
	const update = setMessages.mock.calls.at(-1)?.[0];
	expect(update([])).toEqual([
		{ id: "operation", role: "assistant", parts: [{ type: "text", text: "Recovered private result" }] },
	]);
});

it("keeps a failed decision unconfirmed across rerenders and confirms only after a successful retry", async () => {
	let reject!: (error: Error) => void;
	mocks.decision
		.mockReturnValueOnce(
			new Promise((_resolve, fail) => {
				reject = fail;
			}),
		)
		.mockResolvedValueOnce({});
	const messages = [
		{
			id: "message",
			role: "assistant",
			parts: [
				{
					type: "tool-propose_edits",
					toolCallId: "tool",
					state: "output-available",
					output: {
						edits: [
							{
								id: "edit",
								target: { sectionId: "summary", field: "content" },
								location: "Summary",
								before: "Old",
								after: "New",
								why: "Clearer",
								status: "pending",
							},
						],
						skipped: [],
					},
				},
			],
		},
	];
	mocks.chat.mockReturnValue({ messages, status: "ready", sendMessage: mocks.send, clearError: vi.fn() });
	const view = (
		<I18nProvider i18n={i18n}>
			<Conversation
				document={{ ...document, stateOf: (proposal) => proposal.status }}
				threadId="thread-1"
				initialMessages={[]}
				activeRun={false}
				readOnly={false}
				providerLabel="Local"
				initialContext={{ document: true, posting: false }}
				prompt={null}
				promptAttachments={[]}
				onPromptSent={() => {}}
				onSwitchModel={() => {}}
			/>
		</I18nProvider>
	);
	const { rerender } = render(view);
	fireEvent.click(screen.getByRole("button", { name: /^Reject$/ }));
	expect(screen.getByText("Saving decision…")).toBeDefined();
	expect(screen.queryByText("Rejected", { exact: true })).toBeNull();
	reject(new Error("Offline"));
	await waitFor(() => expect(screen.getByText("Your decision wasn't saved")).toBeDefined());
	rerender(view);
	expect(screen.queryByText("Rejected", { exact: true })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Retry saving decision" }));
	await waitFor(() => expect(screen.getByText("Rejected", { exact: true })).toBeDefined());
	expect(mocks.decision).toHaveBeenLastCalledWith({
		threadId: "thread-1",
		messageId: "message",
		toolCallId: "tool",
		edits: [{ id: "edit", status: "rejected", expectedStatus: "pending" }],
	});
});
