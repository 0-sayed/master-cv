// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageVersions } from "./language-versions";

const state = vi.hoisted(() => ({ create: vi.fn(), revision: "2026-11-14T00:00:00.000Z" }));
vi.mock("@/libs/orpc/client", () => ({
	client: { resume: { variants: { create: state.create } } },
	orpc: {
		resume: {
			variants: { list: { queryOptions: () => ({ kind: "list" }) }, freshness: { queryOptions: () => ({}) } },
			getById: { queryOptions: () => ({}) },
		},
	},
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-query")>()),
	useQuery: ({ kind }: { kind?: string }) => ({
		data:
			kind === "list"
				? [
						{
							resumeId: "base",
							name: "Original",
							variantKind: "base",
							documentLocale: "ar-SA",
							updatedAt: state.revision,
						},
					]
				: undefined,
		refetch: vi.fn(),
	}),
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/source">{children}</a>,
}));
vi.mock("../editor/proposals/review-operation", () => ({
	ReviewLaunch: () => null,
	ReviewOperationPanel: () => null,
	ReviewNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));
vi.mock("./translation-review", () => ({ TranslationReview: () => null }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: () => null }));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("reuses a creation request after a lost response and starts a fresh request after acknowledgment", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const keys: string[] = [];
	state.create.mockImplementation(async (input: { requestKey: string }) => {
		keys.push(input.requestKey);
		if (keys.length === 1) throw new Error("response lost");
		return { resumeId: "copy" };
	});
	const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<LanguageVersions resumeId="base" />
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Create language copy" }));
	await screen.findByRole("alert");
	fireEvent.click(screen.getByRole("button", { name: "Create language copy" }));
	await waitFor(() => expect(keys).toHaveLength(2));
	expect(keys[1]).toBe(keys[0]);
	await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
	fireEvent.click(screen.getByRole("button", { name: "Create language copy" }));
	await waitFor(() => expect(keys).toHaveLength(3));
	expect(keys[2]).not.toBe(keys[0]);
	cache.clear();
});
