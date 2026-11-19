import type { ReviewView } from "@reactive-resume/schema/resume/ai-review";
// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { hashReviewTarget } from "@reactive-resume/resume/review-evidence";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
type TestDraft = {
	resume: { id: string; data: ResumeData; isLocked: boolean };
	acknowledgedUpdatedAt: Date;
	editGeneration: number;
	recoveryDraft: null;
	saveStatus: string;
};
const mocks = vi.hoisted(() => ({
	view: null as ReviewView | null,
	read: vi.fn(),
	decide: vi.fn(),
	answer: vi.fn(),
	dismiss: vi.fn(),
	flush: vi.fn(),
	select: vi.fn(),
	feedback: vi.fn(),
	current: null as TestDraft | null,
	state: "ready",
	latest: vi.fn(),
	remaining: 5,
	notices: vi.fn(),
	grant: vi.fn(),
	preflight: vi.fn(),
	start: vi.fn(),
}));
vi.mock("@/features/resume/builder/draft", () => ({
	useResumeStore: Object.assign((select: (state: TestDraft | null) => unknown) => select(mocks.current), {
		getState: () => mocks.current,
	}),
	savePendingChanges: mocks.flush,
	useIsResumeLocked: () => mocks.current?.resume.isLocked ?? false,
}));
vi.mock("../store", () => ({
	useEditorStore: Object.assign(() => null, {
		getState: () => ({ select: mocks.select, setReviewFeedback: mocks.feedback }),
	}),
}));
vi.mock("./review-client", () => ({ submitReviewDecision: mocks.decide }));
vi.mock("@/libs/orpc/client", () => ({
	client: {
		ai: {
			review: { answer: mocks.answer, dismissQuestion: mocks.dismiss },
			processing: { notices: mocks.notices, grant: mocks.grant },
			operations: { preflight: mocks.preflight, start: mocks.start },
		},
	},
	orpc: {
		ai: {
			review: {
				latest: {
					queryOptions: ({ input }: { input: { resumeId: string } }) => ({
						queryKey: ["latest", input.resumeId],
						queryFn: mocks.latest,
					}),
				},
				get: {
					queryOptions: ({ input }: { input: { operationId: string } }) => ({
						queryKey: ["review", input.operationId],
						queryFn: mocks.read,
					}),
				},
			},
			availability: {
				queryOptions: () => ({ queryKey: ["availability"], queryFn: async () => ({ state: mocks.state }) }),
			},
			usage: {
				get: {
					queryOptions: () => ({
						queryKey: ["usage"],
						queryFn: async () => ({ operations: { remaining: mocks.remaining, reserved: 0 } }),
					}),
				},
			},
		},
	},
}));
import { ReviewLaunch } from "./review-operation";
import { ReviewResultPanel, useResumeReviewSummary } from "./review-panel";
function mount(children = <ReviewResultPanel operationId="op" />) {
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider
				client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
			>
				{children}
			</QueryClientProvider>
		</I18nProvider>,
	);
}
beforeEach(() => {
	vi.resetAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.state = "ready";
	mocks.remaining = 5;
	mocks.latest.mockResolvedValue("op");
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Built services.</p>";
	const source = { kind: "resume", id: "cv", revision: "2026-11-12T00:00:00.000Z" } as const;
	const target = { sectionId: "summary", field: "content" };
	mocks.current = {
		resume: { id: "cv", data, isLocked: false },
		acknowledgedUpdatedAt: new Date(source.revision),
		editGeneration: 1,
		recoveryDraft: null,
		saveStatus: "saved",
	};
	mocks.view = {
		result: {
			schemaVersion: 2,
			kind: "wording",
			sourceRevision: source,
			evidence: [
				{
					id: "e",
					source,
					target,
					quote: "Built services.",
					factId: null,
					factRevision: null,
					confirmation: "confirmed",
				},
			],
			proposals: [
				{
					schemaVersion: 2,
					id: "p",
					target,
					location: "Summary",
					before: data.summary.content,
					after: "<p>Developed services.</p>",
					why: "Clearer wording",
					status: "pending",
					source: "improve",
					base: source,
					claims: splitReviewClaims("Developed services.", ["e"]),
					targetHash: hashReviewTarget(data.summary.content),
					evidenceIds: ["e"],
				},
			],
			questions: [{ id: "q", target, prompt: "What was the result?", evidenceIds: ["e"] }],
			notes: [],
		},
		statuses: { p: "pending" },
		answers: [],
		answeredQuestionIds: [],
		dismissedQuestionIds: [],
		undoable: [],
	};
	mocks.read.mockImplementation(async () => structuredClone(mocks.view));
	mocks.flush.mockResolvedValue(true);
	mocks.decide.mockRejectedValue(new Error("offline"));
});
it.each([
	["not_enabled", "The assistant is not enabled yet"],
	["unavailable", "AI is not available in this environment."],
])("keeps platform %s recovery without personal-provider setup", async (state, message) => {
	mocks.state = state;
	const prepare = vi.fn();
	mount(
		<ReviewLaunch kind="review.wording" prepare={prepare} onStarted={vi.fn()}>
			Review wording
		</ReviewLaunch>,
	);
	expect(await screen.findByText(message)).toBeDefined();
	expect(Boolean(screen.queryByRole("button", { name: /^Retry$/ }))).toBe(state === "unavailable");
	expect(screen.queryByRole("button", { name: "Review wording" })).toBeNull();
	expect(prepare).not.toHaveBeenCalled();
	expect(mocks.grant).not.toHaveBeenCalled();
	expect(mocks.start).not.toHaveBeenCalled();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
it("shows original, proposed wording, reason and evidence with source focus", async () => {
	const { container } = mount();
	await screen.findByText("Clearer wording");
	expect(container.querySelector(".review-wording ins")).toHaveAttribute("dir", "auto");
	expect(container.querySelector(".review-wording ins")).toHaveTextContent("Developed services.");
	fireEvent.click(screen.getByText("Evidence"));
	expect(screen.getByRole("blockquote")).toHaveTextContent("Built services.");
	fireEvent.click(screen.getByRole("button", { name: "Show source" }));
	expect(mocks.select).toHaveBeenCalledWith({ kind: "section", sectionId: "summary" });
});
it("keeps edited text on Cancel and leaves pending status after a failed server decision", async () => {
	mount();
	fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "My own wording" } });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit" }));
	expect(screen.getByRole("textbox")).toHaveValue("My own wording");
	fireEvent.click(screen.getByRole("button", { name: "Save my wording" }));
	await waitFor(() =>
		expect(mocks.decide).toHaveBeenCalledWith(
			expect.objectContaining({ decision: "accept_edited", editedText: "My own wording" }),
		),
	);
	expect(screen.queryByText("Applied")).not.toBeInTheDocument();
	expect(screen.getByRole("textbox")).toHaveValue("My own wording");
});
it("shows durable Undo after reload and sends the accepting event ID", async () => {
	if (!mocks.view) throw new Error("Missing fixture view");
	mocks.view.statuses.p = "accepted";
	if (mocks.view.result.kind !== "wording") throw new Error("fixture");
	mocks.view.undoable = [
		{ decisionId: "accepted-event", proposalIds: ["p"], changes: mocks.view.result.proposals, userSupplied: true },
	];
	mount();
	fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
	await waitFor(() =>
		expect(mocks.decide).toHaveBeenCalledWith(
			expect.objectContaining({ decision: "undo", undoDecisionId: "accepted-event" }),
		),
	);
});
it("keeps untouched sibling suggestions actionable after an acknowledged edited acceptance", async () => {
	if (!mocks.view || mocks.view.result.kind !== "wording" || !mocks.current) throw new Error("Missing fixture");
	const first = mocks.view.result.proposals[0];
	if (!first) throw new Error("Missing proposal");
	const original = "<p>Built services.</p><p>Built tools.</p>";
	first.targetHash = hashReviewTarget(original);
	mocks.view.result.proposals.push({
		...first,
		id: "p2",
		before: "<p>Built tools.</p>",
		after: "<p>Developed tools.</p>",
		claims: splitReviewClaims("Developed tools.", ["e"]),
	});
	mocks.view.statuses = { p: "accepted", p2: "pending" };
	mocks.view.undoable = [
		{
			decisionId: "accepted",
			proposalIds: ["p"],
			changes: [
				{ ...first, after: "<p>My supplied wording.</p>", claims: splitReviewClaims("My supplied wording.", ["e"]) },
			],
			userSupplied: true,
		},
	];
	mocks.current.resume.data.summary.content = "<p>My supplied wording.</p><p>Built tools.</p>";
	mount();
	expect(await screen.findByRole("button", { name: /^Accept$/u })).toBeEnabled();
	expect(screen.queryByText("Out of date: the text has changed since.")).not.toBeInTheDocument();
});
it("preserves Add information text on Cancel without saving an answer", async () => {
	mount();
	fireEvent.click(await screen.findByRole("button", { name: "Add information" }));
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "A measured result" } });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(mocks.answer).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Add information" }));
	expect(screen.getByRole("textbox")).toHaveValue("A measured result");
});
it("refuses stale proposals and exposes status-read failure recovery", async () => {
	if (!mocks.current) throw new Error("Missing draft");
	mocks.current.resume.data.summary.content = "<p>Manual correction</p>";
	mount();
	await screen.findByText("Out of date: the text has changed since.");
	expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
	await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ decision: "reject" })));
	cleanup();
	mocks.read.mockRejectedValue(new Error("offline"));
	mount();
	expect(await screen.findByText("Could not reload this review. Your draft is kept.")).toBeVisible();
	expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
});
it("declining processing consent makes no preparation or staging request", async () => {
	const prepare = vi.fn();
	const started = vi.fn();
	mount(
		<ReviewLaunch kind="review.extraction" prepare={prepare} onStarted={started}>
			Review selection
		</ReviewLaunch>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Review selection" }));
	await screen.findByRole("dialog");
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(prepare).not.toHaveBeenCalled();
	expect(started).not.toHaveBeenCalled();
});
it("requires cancellation after a request issue and prepares a new selection for the next launch", async () => {
	let selection = "first";
	const prepare = vi.fn(async () => ({
		sources: [{ kind: "import" as const, id: selection, revision: "v1" }],
		parameters: { sourceId: selection },
	}));
	mocks.notices.mockResolvedValue([
		{
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			purposes: ["review.extraction"],
			noticeVersion: "1",
		},
	]);
	mocks.grant.mockResolvedValue({});
	mocks.preflight.mockResolvedValue({ available: true });
	mocks.start.mockRejectedValue(new Error("offline"));
	mount(
		<ReviewLaunch kind="review.extraction" prepare={prepare} onStarted={vi.fn()}>
			Review selection
		</ReviewLaunch>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Review selection" }));
	fireEvent.click(screen.getByRole("button", { name: "Start review" }));
	await screen.findByText(
		"This request needs changes before it can start. Cancel and review the selected text. Your draft is kept.",
	);
	const first = mocks.start.mock.calls[0]?.[0];
	expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Start review" })).not.toBeInTheDocument();
	expect(mocks.start).toHaveBeenCalledTimes(1);
	await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	selection = "second";
	fireEvent.click(screen.getByRole("button", { name: "Review selection" }));
	fireEvent.click(screen.getByRole("button", { name: "Start review" }));
	await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
	expect(prepare).toHaveBeenCalledTimes(2);
	expect(mocks.start.mock.calls[1]?.[0]).toMatchObject({ parameters: { sourceId: "second" } });
	expect(mocks.start.mock.calls[1]?.[0].requestKey).not.toBe(first.requestKey);
});

it("publishes feedback only after a real acceptance, without waiting for presentation timers", async () => {
	let acknowledge: (value: unknown) => void = () => {
		throw new Error("Missing request");
	};
	mocks.decide.mockImplementation(
		() =>
			new Promise((resolve) => {
				acknowledge = resolve;
			}),
	);
	mount();
	fireEvent.click(await screen.findByRole("button", { name: /^Accept$/u }));
	await waitFor(() => expect(mocks.decide).toHaveBeenCalled());
	expect(mocks.feedback).not.toHaveBeenCalled();
	vi.useFakeTimers();
	const acknowledgedAt = Date.now();
	await act(async () => {
		acknowledge({ decisionId: "saved", resumeId: "cv", updatedAt: "2026-11-12T00:00:01.000Z" });
		await vi.advanceTimersByTimeAsync(0);
	});
	expect(mocks.feedback).toHaveBeenCalledWith(
		expect.objectContaining({ id: "saved", action: "accept", targets: [{ kind: "section", sectionId: "summary" }] }),
	);
	expect(Date.now()).toBe(acknowledgedAt);
	expect(screen.getByRole("button", { name: /^Accept$/u })).toBeEnabled();
});

function SummaryProjection() {
	const summary = useResumeReviewSummary();
	const client = useQueryClient();
	return (
		<>
			<output>
				{summary.state}:{summary.pendingCount ?? "unknown"}
			</output>
			<button onClick={() => void client.invalidateQueries({ queryKey: ["review", "op"] })}>Refresh summary</button>
		</>
	);
}
it("keeps the AI-off summary read-only and does not fetch a review", async () => {
	mocks.state = "not_enabled";
	mount(<SummaryProjection />);
	expect(await screen.findByText("off:unknown")).toBeDefined();
	expect(mocks.latest).not.toHaveBeenCalled();
	expect(mocks.read).not.toHaveBeenCalled();
	expect(mocks.preflight).not.toHaveBeenCalled();
	expect(mocks.start).not.toHaveBeenCalled();
	expect(mocks.decide).not.toHaveBeenCalled();
});
it("counts actual pending statuses and updates after an acknowledged refetch", async () => {
	mount(<SummaryProjection />);
	expect(await screen.findByText("available:1")).toBeDefined();
	if (mocks.view) mocks.view.statuses.p = "accepted";
	fireEvent.click(screen.getByRole("button", { name: "Refresh summary" }));
	expect(await screen.findByText("available:0")).toBeDefined();
	expect(mocks.start).not.toHaveBeenCalled();
});
it("keeps unknown and foreign-document counts hidden", async () => {
	mocks.latest.mockImplementation(() => new Promise(() => {}));
	const view = mount(<SummaryProjection />);
	expect(await screen.findByText("available:unknown")).toBeDefined();
	view.unmount();
	mocks.latest.mockResolvedValue("op");
	if (mocks.current) mocks.current.resume.id = "other-cv";
	mount(<SummaryProjection />);
	await waitFor(() => expect(mocks.read).toHaveBeenCalled());
	expect(screen.getByText("available:unknown")).toBeDefined();
});
it("reports zero only after the latest query confirms no saved review", async () => {
	mocks.latest.mockResolvedValue(null);
	mount(<SummaryProjection />);
	expect(await screen.findByText("available:0")).toBeDefined();
	expect(mocks.read).not.toHaveBeenCalled();
});
it("shows exhausted allowance without starting an operation", async () => {
	mocks.remaining = 0;
	mount(<SummaryProjection />);
	expect(await screen.findByText("unavailable:1")).toBeDefined();
	expect(mocks.start).not.toHaveBeenCalled();
});
it("does not accept a locked proposal or change saved content", async () => {
	if (mocks.current) mocks.current.resume.isLocked = true;
	const before = structuredClone(mocks.current?.resume.data);
	mount();
	await screen.findByText("Clearer wording");
	expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
	expect(mocks.current?.resume.data).toEqual(before);
	expect(mocks.decide).not.toHaveBeenCalled();
});

it("keeps saved multilingual content on rejection and reuses the same failed decision key", async () => {
	if (mocks.current) mocks.current.resume.data.basics.name = "سارة Sara";
	const original = structuredClone(mocks.current?.resume.data);
	mount();
	const reject = await screen.findByRole("button", { name: "Keep original" });
	fireEvent.click(reject);
	await waitFor(() => expect(mocks.decide).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(reject).toBeEnabled());
	fireEvent.click(reject);
	await waitFor(() => expect(mocks.decide).toHaveBeenCalledTimes(2));
	expect(mocks.decide.mock.calls[0]?.[0]).toEqual(mocks.decide.mock.calls[1]?.[0]);
	expect(mocks.current?.resume.data).toEqual(original);
});
