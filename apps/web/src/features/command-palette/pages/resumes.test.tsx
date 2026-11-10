// @vitest-environment happy-dom

import type { DocumentSummary } from "@/features/documents/filter";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Command, CommandInput, CommandList } from "@reactive-resume/ui/components/command";
import { useCommandPaletteStore } from "../store";
import { ResumesCommandGroup } from "./resumes";
import { LinkApplicationDialog } from "@/features/documents/document-actions";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouteContext: () => ({ session: { user: { id: "synthetic-owner" } } }),
}));
vi.mock("@/libs/orpc/client", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/libs/orpc/client")>();
	return {
		...original,
		orpc: createTanstackQueryUtils({
			resume: { list: lookup },
			applications: { list: lookup },
			agent: { threads: { list: lookup } },
			documents: { linkApplication: lookup },
		}),
	};
});

beforeEach(() => {
	lookup.mockReset();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	useCommandPaletteStore.getState().reset();
});

function setup(page: "resumes" | "applications" | "threads" | "link") {
	useCommandPaletteStore.getState().pushPage(page);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				{page === "link" ? (
					<LinkApplicationDialog document={{ id: "letter-1", type: "letter" } as DocumentSummary} onClose={vi.fn()} />
				) : (
					<Command>
						<CommandInput />
						<CommandList>
							<ResumesCommandGroup />
						</CommandList>
					</Command>
				)}
			</QueryClientProvider>
		</I18nProvider>,
	);
}

it.each(["resumes", "applications", "threads", "link"] as const)(
	"%s distinguishes loading, failed lookup, retrying and successful empty results",
	async (page) => {
		let rejectLookup!: (error: Error) => void;
		let resolveRetry!: (result: []) => void;
		lookup.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectLookup = reject;
				}),
		);
		setup(page);
		if (page !== "link") {
			fireEvent.change(screen.getByRole("combobox"), { target: { value: "unmatched synthetic search" } });
		}
		expect(await screen.findByRole("status")).toHaveTextContent("Loading");
		expect(screen.queryByText(/No applications yet/)).not.toBeInTheDocument();
		await act(async () => rejectLookup(new Error("Synthetic lookup failure")));
		expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load");
		expect(screen.queryByText(/No applications yet/)).not.toBeInTheDocument();
		lookup.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveRetry = resolve;
				}),
		);
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByRole("button", { name: /Retrying/ })).toBeDisabled();
		await act(async () => resolveRetry([]));
		expect(await screen.findByText(page === "link" ? /No applications yet/ : /No results found/)).toBeVisible();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	},
);

it.each(["resumes", "applications", "threads", "link"] as const)(
	"%s shows successful lookup results without an empty or error state",
	async (page) => {
		lookup.mockResolvedValueOnce([
			{
				id: "synthetic-1",
				name: "Sample CV",
				slug: "sample",
				role: "Engineer",
				company: "Sample company",
				status: "saved",
				title: "Sample conversation",
				scope: "document",
			},
		]);
		setup(page);
		expect(
			await screen.findByText(
				page === "resumes" ? "Sample CV" : page === "threads" ? "Sample conversation" : "Engineer",
			),
		).toBeVisible();
		expect(screen.queryByText(/No results found|No applications yet/)).not.toBeInTheDocument();
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	},
);
