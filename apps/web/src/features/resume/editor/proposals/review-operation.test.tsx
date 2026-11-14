// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { operationRequestSchema } from "@reactive-resume/schema/ai-operation";
const state = vi.hoisted(() => ({ reserved: 1, remaining: 0, usageReads: 0, started: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	client: {
		ai: {
			processing: {
				notices: async () => [
					{
						purposes: ["review.summary", "review.job-evidence"],
						route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
						noticeVersion: "1",
					},
				],
				grant: async () => {},
			},
			operations: {
				cancel: async () => {},
				preflight: async (input: unknown) => {
					operationRequestSchema.parse(input);
					return { available: true };
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
			availability: { queryOptions: () => ({ queryKey: ["availability"], queryFn: async () => ({ state: "ready" }) }) },
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
