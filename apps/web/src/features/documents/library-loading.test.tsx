// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentsPage } from "./documents-page";
import { TrashPage } from "./trash-page";
import { LocaleProvider } from "@/features/locale/provider";

const { loadDocuments } = vi.hoisted(() => ({ loadDocuments: vi.fn() }));
const newLetter = vi.hoisted(() => vi.fn());

vi.mock("@/libs/orpc/client", () => ({
	orpc: { documents: { list: { queryOptions: () => ({ queryKey: ["documents"], queryFn: loadDocuments }) } } },
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/dashboard">{children}</a>,
	useRouter: () => ({}),
	useRouteContext: () => ({ flags: { personalToolsAvailability: { coverLetters: true, applications: true } } }),
}));
vi.mock("@/features/resume/builder/draft", () => ({ isEditableElementFocused: () => false }));
vi.mock("./document-actions", () => ({
	TagsDialog: () => null,
	LinkApplicationDialog: () => null,
	useBatchActions: () => ({}),
}));
vi.mock("./document-card", () => ({ DocumentCard: () => null, DocumentRow: () => null }));
vi.mock("./new-document-dialog", () => ({
	useStartDocument: () => ({ startBlank: vi.fn(), trySample: vi.fn(), newLetter, creating: false }),
}));

it.each(["documents", "trash"])("keeps %s load failures distinct from empty state and retries", async (page) => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	loadDocuments.mockReset().mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValue([]);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<LocaleProvider locale="en-US" session={null}>
					{page === "documents" ? (
						<DocumentsPage search={{ type: "all", q: "", tags: [], sort: "edited" }} onSearchChange={vi.fn()} />
					) : (
						<TrashPage />
					)}
				</LocaleProvider>
			</QueryClientProvider>
		</I18nProvider>,
	);

	expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load documents");
	expect(screen.queryByText("Build a CV that grows with you")).not.toBeInTheDocument();
	expect(screen.queryByText("Trash is empty")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(
		await screen.findByText(page === "documents" ? "Build a CV that grows with you" : "Trash is empty"),
	).toBeVisible();
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	view.unmount();
	queryClient.clear();
});

it.each([
	["letter", "", [], false, "No cover letters yet"],
	["resume", "", [], false, "Build a CV that grows with you"],
	["letter", "missing", [], false, "Nothing matches “missing”"],
	["letter", "", ["tag"], false, "Nothing matches these filters"],
	["letter", "", [], true, "Nothing matches these filters"],
] as const)(
	"distinguishes an empty %s collection from search (%s, %s, %s)",
	async (type, q, tags, publicOnly, title) => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		loadDocuments.mockReset().mockResolvedValue([
			{
				id: "other",
				type: type === "letter" ? "resume" : "letter",
				name: "Existing",
				tags: [],
				updatedAt: new Date(),
				createdAt: new Date(),
			},
		]);
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const onSearchChange = vi.fn();
		const view = render(
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={queryClient}>
					<LocaleProvider locale="en-US" session={null}>
						<DocumentsPage
							search={{ type, q, tags: [...tags], public: publicOnly, sort: "edited" }}
							onSearchChange={onSearchChange}
						/>
					</LocaleProvider>
				</QueryClientProvider>
			</I18nProvider>,
		);
		expect(await screen.findByText(title)).toBeVisible();
		if (q || tags.length || publicOnly) {
			fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
			expect(onSearchChange).toHaveBeenCalledWith({ q: "", tags: [], type: "all", public: false });
		} else {
			expect(screen.queryByRole("button", { name: "Clear search and filters" })).not.toBeInTheDocument();
			if (type === "letter") {
				fireEvent.click(screen.getByRole("button", { name: "New cover letter" }));
				expect(newLetter).toHaveBeenCalledOnce();
			} else expect(screen.getByRole("button", { name: "New CV" })).toBeVisible();
		}
		view.unmount();
		queryClient.clear();
	},
);

it("creates another letter from a populated letter collection", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	newLetter.mockClear();
	loadDocuments
		.mockReset()
		.mockResolvedValue([
			{ id: "letter", type: "letter", name: "Existing letter", tags: [], updatedAt: new Date(), createdAt: new Date() },
		]);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<LocaleProvider locale="en-US" session={null}>
					<DocumentsPage search={{ type: "letter", q: "", tags: [], sort: "edited" }} onSearchChange={vi.fn()} />
				</LocaleProvider>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(await screen.findByRole("button", { name: /^New$/ }));
	expect(within(screen.getByRole("tab", { name: /Cover letters/ })).getByText("Beta")).toBeVisible();
	expect(newLetter).toHaveBeenCalledOnce();
	view.unmount();
	queryClient.clear();
});
