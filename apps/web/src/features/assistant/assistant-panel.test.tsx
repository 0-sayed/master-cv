// @vitest-environment happy-dom
import type { AssistantDocument } from "./document";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const mocks = vi.hoisted(() => ({
	selected: null as string | null,
	threads: [] as unknown[],
	start: vi.fn(),
	attach: vi.fn(),
	setSelected: vi.fn(),
	setPrompt: vi.fn(),
	invalidate: vi.fn(),
	update: vi.fn(),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-query")>()),
	useQuery: (options: { queryKey: string[] }) =>
		options.queryKey[0] === "threads" ? { data: mocks.threads, isPending: false } : {},
	useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: () => null }));
vi.mock("@/features/resume/editor/store", () => ({
	useEditorStore: Object.assign(
		(select: (state: unknown) => unknown) =>
			select({
				assistantThread: mocks.selected,
				setAssistantThread: mocks.setSelected,
				assistantPrompt: null,
				setAssistantPrompt: mocks.setPrompt,
			}),
		{ getState: () => ({ setAssistantSuggestions: vi.fn() }) },
	),
}));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: () => ({ usableProviders: [{ id: "provider-1", label: "Local" }], hasUsableProvider: true }),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { agent: { threads: { start: mocks.start, update: mocks.update }, attachments: { create: mocks.attach } } },
	orpc: {
		agent: {
			threads: {
				list: { key: () => ["threads"], queryOptions: () => ({ queryKey: ["threads"] }) },
				get: { queryOptions: () => ({ queryKey: ["thread"] }) },
			},
		},
	},
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("./chat", () => ({ fileToBase64: async () => "Zm9v", useConversationConnection: () => undefined }));
vi.mock("./provider-setup", () => ({ ProviderSetup: () => <p>Provider setup</p> }));

import { AssistantPanel } from "./assistant-panel";

const document: AssistantDocument = {
	kind: "resume",
	id: "resume-1",
	name: "Resume",
	locked: false,
	posting: null,
	stateOf: () => "pending",
	accept: () => {},
	locationOf: () => undefined,
};
beforeEach(() => {
	vi.clearAllMocks();
	mocks.selected = null;
	mocks.threads = [];
	mocks.setSelected.mockImplementation((selected: string) => {
		mocks.selected = selected;
	});
	mocks.start.mockResolvedValue({ id: "draft-thread" });
	mocks.attach.mockResolvedValue({ id: "file-1", filename: "posting.txt", mediaType: "text/plain" });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});

it("preserves a missing bound provider until an explicit replacement is acknowledged", async () => {
	mocks.selected = "bound-thread";
	mocks.threads = [
		{
			id: "bound-thread",
			workingResumeId: "resume-1",
			coverLetterId: null,
			aiProviderId: "removed",
			providerLabel: "Bound provider",
		},
	];
	let acknowledge!: () => void;
	mocks.update.mockReturnValue(
		new Promise<void>((resolve) => {
			acknowledge = resolve;
		}),
	);
	render(
		<I18nProvider i18n={i18n}>
			<AssistantPanel document={document} onClose={() => {}} />
		</I18nProvider>,
	);
	expect(mocks.update).not.toHaveBeenCalled();
	expect(screen.queryByRole("textbox")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Model: Bound provider" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Local" }));
	await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ id: "bound-thread", aiProviderId: "provider-1" }));
	expect(screen.getByRole("button", { name: "Model: Bound provider" })).toBeDisabled();
	expect(mocks.invalidate).not.toHaveBeenCalled();
	acknowledge();
	await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["threads"] }));
});
afterEach(cleanup);

it("keeps first-message text and attachments when the draft appears in a background thread-list refetch", async () => {
	const panel = (
		<I18nProvider i18n={i18n}>
			<AssistantPanel document={document} onClose={() => {}} />
		</I18nProvider>
	);
	const { container, rerender } = render(panel);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep my first message" } });
	const input = container.querySelector('input[type="file"]');
	if (!input) throw new Error("First-message attachment picker missing");
	fireEvent.change(input, { target: { files: [new File(["foo"], "posting.txt", { type: "text/plain" })] } });
	await waitFor(() => expect(screen.getByText("posting.txt")).toBeDefined());
	mocks.threads = [
		{ id: "draft-thread", workingResumeId: "resume-1", coverLetterId: null, aiProviderId: "provider-1" },
	];
	rerender(
		<I18nProvider i18n={i18n}>
			<AssistantPanel document={document} onClose={() => {}} />
		</I18nProvider>,
	);
	expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep my first message");
	expect(screen.getByText("posting.txt")).toBeDefined();
	expect(mocks.setSelected).toHaveBeenCalledWith("new");
});
