// @vitest-environment happy-dom
import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ reserved: 1, usageReads: 0 }));
vi.mock("@/libs/orpc/client", () => ({
	client: { ai: { operations: { cancel: async () => {} } } },
	orpc: {
		ai: {
			availability: { queryOptions: () => ({ queryKey: ["availability"], queryFn: async () => ({ state: "ready" }) }) },
			usage: {
				get: {
					queryOptions: () => ({
						queryKey: ["usage"],
						queryFn: async () => {
							state.usageReads++;
							return { operations: { remaining: 0, reserved: state.reserved } };
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
