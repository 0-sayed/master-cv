// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { operationRequestSchema } from "@reactive-resume/schema/ai-operation";
const state = vi.hoisted(() => ({
	reserved: 1,
	remaining: 0 as number | null,
	usageReads: 0,
	started: vi.fn(),
	notices: vi.fn(),
	preflight: vi.fn(),
	grant: vi.fn(),
	availability: "ready",
}));
vi.mock("@/libs/orpc/client", () => ({
	client: {
		ai: {
			processing: {
				notices: async () =>
					state.notices() ?? [
						{
							purposes: ["review.summary", "review.job-evidence", "review.translation"],
							route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
							noticeVersion: "1",
						},
					],
				grant: async () => state.grant(),
			},
			operations: {
				cancel: async () => {},
				preflight: async (input: unknown) => {
					operationRequestSchema.parse(input);
					return state.preflight() ?? { available: true };
				},
				start: async (input: unknown) => {
					operationRequestSchema.parse(input);
					return { id: "started" };
				},
			},
		},
	},
	orpc: {
		ai: {
			availability: {
				queryOptions: () => ({ queryKey: ["availability"], queryFn: async () => ({ state: state.availability }) }),
			},
			usage: {
				get: {
					queryOptions: () => ({
						queryKey: ["usage"],
						queryFn: async () => {
							state.usageReads++;
							return { operations: { remaining: state.remaining, reserved: state.reserved } };
						},
					}),
				},
			},
			operations: {
				get: {
					queryOptions: () => ({
						queryKey: ["operation", "op"],
						queryFn: async () => ({ state: "running", resultId: null }),
					}),
				},
			},
		},
	},
}));
import { ReviewLaunch, ReviewOperationPanel } from "./review-operation";
it.each(["failed", "cancelled", "waiting_review", "succeeded"])(
	"refreshes last-quota usage at the %s transition",
	async (terminal) => {
		state.remaining = 0;
		state.reserved = 1;
		state.usageReads = 0;
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		render(
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={queryClient}>
					<ReviewLaunch
						kind="review.wording"
						prepare={async () => ({ sources: [], parameters: {} })}
						onStarted={() => {}}
					>
						Request review
					</ReviewLaunch>
					<ReviewOperationPanel operationId="op">
						<p>Delivered</p>
					</ReviewOperationPanel>
				</QueryClientProvider>
			</I18nProvider>,
		);
		await screen.findByText("An operation is already in progress. Your writing is kept.");
		await screen.findByText("Review in progress");
		const before = state.usageReads;
		state.reserved = 0;
		await act(async () => {
			queryClient.setQueryData(["operation", "op"], {
				state: terminal,
				resultId: terminal === "waiting_review" || terminal === "succeeded" ? "result" : null,
			});
		});
		await waitFor(() => expect(state.usageReads).toBeGreaterThan(before));
		await waitFor(() =>
			expect(screen.queryByText("An operation is already in progress. Your writing is kept.")).toBeNull(),
		);
		await screen.findByText(
			"You used all available assistant operations. Your draft is kept. Review your allowance in account settings.",
			{ exact: true },
		);
		queryClient.clear();
	},
);

it.each(["review.summary", "review.job-evidence"] as const)(
	"starts %s through the consent UI with preparation metadata",
	async (kind) => {
		state.remaining = 5;
		state.reserved = 0;
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const onStarted = vi.fn();
		const view = render(
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={cache}>
					<ReviewLaunch
						kind={kind}
						prepare={async () => ({
							kind,
							sources: [{ kind: "resume", id: "cv", revision: "revision" }],
							parameters: {},
							evidenceIds: ["fact"],
							contractVersion: "v2",
						})}
						onStarted={onStarted}
					>
						Launch
					</ReviewLaunch>
				</QueryClientProvider>
			</I18nProvider>,
		);
		fireEvent.click(await screen.findByRole("button", { name: "Launch" }));
		fireEvent.click(screen.getByRole("button", { name: "Start review" }));
		await waitFor(() => expect(onStarted).toHaveBeenCalledWith("started"));
		view.unmount();
		cache.clear();
	},
);

it.each(["failed", "cancelled"])("provides a complete recoverable notice when a review is %s", async (terminal) => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	cache.setQueryData(["operation", "op"], { state: terminal, resultId: null });
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewOperationPanel operationId="op">
					<p>Delivered</p>
				</ReviewOperationPanel>
			</QueryClientProvider>
		</I18nProvider>,
	);
	const notice = view.container.querySelector('[data-slot="alert"]');
	expect(notice?.querySelector('[data-slot="icon"]')).not.toBeNull();
	expect(notice?.querySelector('[data-slot="alert-title"]')?.textContent).toBeTruthy();
	expect(notice?.querySelector('[data-slot="alert-description"]')?.textContent).toContain("No operation was deducted");
	expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
	view.unmount();
	cache.clear();
});

it("explains how to recover when independent copy structure prevents translation", async () => {
	state.remaining = 5;
	state.reserved = 0;
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const onStarted = vi.fn();
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewLaunch
					kind="review.translation"
					prepare={async () => {
						throw new ORPCError("CONFLICT", { data: { reason: "TRANSLATION_STRUCTURE_CHANGED" } });
					}}
					onStarted={onStarted}
				>
					Translate copy
				</ReviewLaunch>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Translate copy" }));
	fireEvent.click(screen.getByRole("button", { name: "Start review" }));
	expect(
		await screen.findByText(
			"The source and language copy have different sections or text blocks. Open the saved CV and align its structure with the source before requesting a translation.",
		),
	).toBeDefined();
	expect(onStarted).not.toHaveBeenCalled();
	view.unmount();
	cache.clear();
});

afterEach(() => {
	cleanup();
	state.notices.mockReset();
	state.preflight.mockReset();
	state.grant.mockReset();
	state.availability = "ready";
});

it.each([
	[
		"review.wording",
		"You used all available assistant operations. Your draft is kept. Review your allowance in account settings.",
	],
	[
		"review.job-evidence",
		"You have used all your free assistant operations. They do not renew. You can continue editing manually and download a PDF.",
	],
] as const)("keeps the exhausted %s guidance and refreshes usage without starting a review", async (kind, message) => {
	state.remaining = 0;
	state.reserved = 0;
	state.usageReads = 0;
	const prepare = vi.fn();
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewLaunch kind={kind} prepare={prepare} onStarted={vi.fn()}>
					Launch
				</ReviewLaunch>
			</QueryClientProvider>
		</I18nProvider>,
	);
	await screen.findByText(message, { exact: true });
	const before = state.usageReads;
	fireEvent.click(screen.getByRole("button", { name: /^Retry$/ }));
	await waitFor(() => expect(state.usageReads).toBeGreaterThan(before));
	expect(screen.getByText(message, { exact: true })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Launch" })).toBeNull();
	expect(prepare).not.toHaveBeenCalled();
	cache.clear();
});

it("keeps disabled guidance distinct from recoverable processing unavailability", async () => {
	state.remaining = 5;
	state.reserved = 0;
	state.availability = "not_enabled";
	const prepare = vi.fn();
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewLaunch kind="review.job-evidence" prepare={prepare} onStarted={vi.fn()}>
					Launch
				</ReviewLaunch>
			</QueryClientProvider>
		</I18nProvider>,
	);
	await screen.findByText("The assistant is not enabled yet", { exact: true });
	expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
	state.availability = "unavailable";
	await act(async () => {
		await cache.invalidateQueries({ queryKey: ["availability"] });
	});
	await screen.findByText("AI is not available in this environment.", { exact: true });
	expect(
		screen.getByText(
			"Nothing in your CV changed. No operation was deducted from your allowance. Keep writing yourself and try again later.",
			{ exact: true },
		),
	).toBeTruthy();
	state.availability = "ready";
	fireEvent.click(screen.getByRole("button", { name: /^Retry$/ }));
	await screen.findByRole("button", { name: "Launch" });
	expect(prepare).not.toHaveBeenCalled();
	cache.clear();
});

it.each([
	["Failed to fetch", true],
	["Cannot read properties of undefined", false],
] as const)("offers retry only for a transient transport failure: %s", async (message, retryable) => {
	state.remaining = 5;
	state.reserved = 0;
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewLaunch
					kind="review.summary"
					prepare={async () => {
						throw new TypeError(message);
					}}
					onStarted={vi.fn()}
				>
					Launch
				</ReviewLaunch>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Launch" }));
	fireEvent.click(screen.getByRole("button", { name: "Start review" }));
	await screen.findByText(
		retryable
			? "The AI provider is temporarily unavailable. Your draft is kept. Retry later."
			: "This request needs changes before it can start. Cancel and review the selected text. Your draft is kept.",
	);
	expect(Boolean(screen.queryByRole("button", { name: "Retry" }))).toBe(retryable);
	view.unmount();
	cache.clear();
});

it("shows environment unavailability without retry when no processing route exists", async () => {
	state.remaining = 5;
	state.reserved = 0;
	state.notices.mockReturnValue([]);
	const prepare = vi.fn();
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewLaunch kind="review.summary" prepare={prepare} onStarted={vi.fn()}>
					Launch
				</ReviewLaunch>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Launch" }));
	fireEvent.click(screen.getByRole("button", { name: "Start review" }));
	expect(await screen.findByText("AI is not available in this environment.")).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
	expect(prepare).not.toHaveBeenCalled();
	cache.clear();
});
it.each([null, 2, 49])("shows the real allowance for remaining %s", async (remaining) => {
	state.remaining = remaining;
	state.reserved = 0;
	const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<ReviewLaunch kind="review.summary" prepare={vi.fn()} onStarted={vi.fn()}>
					Launch
				</ReviewLaunch>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: "Launch" }));
	expect(screen.queryByText(/5 free operations/)).toBeNull();
	if (remaining !== null) expect(screen.getByText(`Remaining assistant operations: ${remaining}`)).toBeTruthy();
	else expect(screen.queryByText(/Remaining assistant operations:/)).toBeNull();
	cache.clear();
});

it.each([
	["AI_NOT_ENABLED", "AI is not available in this environment.", false],
	["AI_BUDGET_LIMIT", "The daily AI budget is reached. Try again tomorrow. Your draft is kept.", false],
	[
		"AI_OPERATIONS_LIMIT",
		"You used all available assistant operations. Your draft is kept. Review your allowance in account settings.",
		false,
	],
	["AI_CONSENT_REQUIRED", "Review the processing notice and give consent before starting. Your draft is kept.", false],
	["AI_PROVIDER_ERROR", "The AI provider is temporarily unavailable. Your draft is kept. Retry later.", true],
	["AI_CONCURRENCY_LIMIT", "Another AI operation is in progress. Wait for it to finish. Your draft is kept.", true],
	[
		"AI_INVALID_REQUEST",
		"This request needs changes before it can start. Cancel and review the selected text. Your draft is kept.",
		false,
	],
] as const)("explains %s from both preflight and server errors", async (reason, message, retryable) => {
	for (const preflight of [true, false]) {
		state.remaining = 5;
		state.reserved = 0;
		state.preflight.mockReset();
		if (preflight) state.preflight.mockReturnValue({ available: false, reason });
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const view = render(
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={cache}>
					<ReviewLaunch
						kind="review.summary"
						prepare={async () => {
							if (!preflight) throw new ORPCError("PRECONDITION_FAILED", { data: { reason } });
							return { sources: [{ kind: "resume", id: "cv", revision: "revision" }], parameters: {} };
						}}
						onStarted={vi.fn()}
					>
						Launch
					</ReviewLaunch>
				</QueryClientProvider>
			</I18nProvider>,
		);
		fireEvent.click(await screen.findByRole("button", { name: "Launch" }));
		fireEvent.click(screen.getByRole("button", { name: "Start review" }));
		expect(await screen.findByText(message)).toBeTruthy();
		expect(Boolean(screen.queryByRole("button", { name: "Retry" }))).toBe(retryable);
		expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
		if (reason === "AI_CONSENT_REQUIRED") {
			fireEvent.click(screen.getByRole("button", { name: "Review consent" }));
			state.preflight.mockReturnValue({ available: true });
			if (preflight) {
				fireEvent.click(screen.getByRole("button", { name: "Start review" }));
				await waitFor(() => expect(state.grant).toHaveBeenCalledTimes(2));
			}
		}
		view.unmount();
		cache.clear();
		state.grant.mockReset();
	}
});
