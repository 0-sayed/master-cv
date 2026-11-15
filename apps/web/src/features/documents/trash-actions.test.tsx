// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TrashPage } from "./trash-page";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";
const fixture = vi.hoisted(() => ({
	documents: [] as unknown[],
	restore: vi.fn(),
	purge: vi.fn(),
	notify: vi.fn(),
	navigate: vi.fn(),
}));
vi.mock("@/libs/orpc/client", () => {
	const mutation = (fn = vi.fn()) => ({ mutationOptions: (options: object) => ({ mutationFn: fn, ...options }) });
	return {
		orpc: {
			documents: {
				key: () => ["documents"],
				list: { queryOptions: () => ({ queryKey: ["documents", "trash"], queryFn: async () => fixture.documents }) },
				rename: mutation(),
				setLocked: mutation(),
				trash: mutation(),
				restore: mutation(fixture.restore),
				purge: mutation(fixture.purge),
			},
			resume: { update: mutation(), list: { key: () => ["resumes"] }, duplicate: mutation() },
			coverLetters: { duplicate: mutation() },
		},
	};
});
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: fixture.notify } }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => fixture.navigate,
	Link: ({ children }: { children: import("react").ReactNode }) => <a href="/dashboard">{children}</a>,
}));
vi.mock("./resume-thumbnail", () => ({ ResumeThumbnail: () => null }));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	fixture.documents = ["First CV", "Second CV"].map((name, index) => ({
		id: String(index),
		type: "resume",
		name,
		trashedAt: new Date(),
		tags: [],
		application: null,
		isPublic: false,
	}));
	fixture.restore.mockImplementation(async ({ id }: { id: string }) => {
		fixture.documents = fixture.documents.filter((item) => (item as { id: string }).id !== id);
	});
	fixture.purge.mockImplementation(async ({ id }: { id: string }) => {
		fixture.documents = fixture.documents.filter((item) => (item as { id: string }).id !== id);
	});
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<ConfirmDialogProvider>
					<TrashPage />
				</ConfirmDialogProvider>
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("names the document, requires confirmation and permits cancelling permanent deletion", async () => {
	show();
	const row = await screen.findByRole("row", { name: "First CV" });
	fireEvent.click(within(row).getByRole("button", { name: "Delete forever" }));
	const dialog = await screen.findByRole("alertdialog");
	expect(within(dialog).getByRole("heading").textContent).toMatch(/Delete.*First CV.*forever/);
	expect(dialog).toHaveTextContent("can't be restored");
	expect(fixture.purge).not.toHaveBeenCalled();
	await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Keep in Trash" })));
	expect(fixture.purge).not.toHaveBeenCalled();
});
it("restores immediately after success and offers Open on the resulting toast", async () => {
	show();
	const row = await screen.findByRole("row", { name: "First CV" });
	fireEvent.click(within(row).getByRole("button", { name: "Restore" }));
	await waitFor(() => expect(screen.queryByRole("row", { name: "First CV" })).not.toBeInTheDocument());
	const toast = fixture.notify.mock.calls.at(-1)?.[0];
	expect(toast.actionProps.children).toBe("Open");
	toast.actionProps.onClick();
	expect(fixture.navigate).toHaveBeenCalledWith({ to: "/builder/$resumeId", params: { resumeId: "0" } });
});
it("bulk restore leaves failed items in trash and reports partial success", async () => {
	show();
	fixture.restore.mockImplementation(async ({ id }: { id: string }) => {
		if (id === "1") throw new Error("offline");
		fixture.documents = fixture.documents.filter((item) => (item as { id: string }).id !== id);
	});
	await screen.findByRole("row", { name: "First CV" });
	fireEvent.click(screen.getByRole("checkbox", { name: "Select all trash" }));
	fireEvent.click(screen.getByRole("button", { name: "Restore selected" }));
	await waitFor(() => expect(screen.queryByRole("row", { name: "First CV" })).not.toBeInTheDocument());
	expect(screen.getByRole("row", { name: "Second CV" })).toBeVisible();
	expect(fixture.notify).toHaveBeenCalledWith(
		expect.objectContaining({ type: "error", description: "Restored 1 of 2 documents." }),
	);
});
it("empty trash reviews the complete named scope before any deletion", async () => {
	show();
	await screen.findByRole("row", { name: "First CV" });
	fireEvent.click(screen.getByRole("button", { name: "Empty trash" }));
	const dialog = await screen.findByRole("alertdialog");
	expect(dialog).toHaveTextContent("Empty trash?");
	expect(dialog).toHaveTextContent("First CV");
	expect(dialog).toHaveTextContent("Second CV");
	expect(fixture.purge).not.toHaveBeenCalled();
	fireEvent.click(within(dialog).getByRole("button", { name: "Delete forever" }));
	expect(await screen.findByText("Trash is empty")).toBeVisible();
});
