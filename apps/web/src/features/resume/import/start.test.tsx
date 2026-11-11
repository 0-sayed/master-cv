// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dialog } from "@reactive-resume/ui/components/dialog";
import { StartCvDialog } from "./start";
import { useDialogStore } from "@/dialogs/store";
const mocks = vi.hoisted(() => ({ create: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouteContext: () => ({ session: { user: { id: "owner" } } }),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { resume: { create: mocks.create } },
	orpc: { documents: { key: () => ["documents"] } },
}));
beforeEach(() => {
	vi.resetAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	useDialogStore.getState().openDialog("document.new", undefined);
});
it.each(["ar-SA", "en-US"])("manual creates an empty %s CV and opens Write without review", async (locale) => {
	mocks.create.mockResolvedValue("new-cv");
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<Dialog open>
					<StartCvDialog />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("radio", { name: locale === "ar-SA" ? "Arabic" : "English" }));
	fireEvent.click(screen.getByRole("button", { name: /^Write from scratch/ }));
	await waitFor(() =>
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/builder/$resumeId",
			params: { resumeId: "new-cv" },
			search: { mode: "write" },
		}),
	);
	expect(mocks.create).toHaveBeenCalledWith(
		expect.objectContaining({ locale, empty: true, withSampleData: false }),
		expect.anything(),
	);
	expect(screen.queryByText("Review imported information")).not.toBeInTheDocument();
});
it("groups language before matching option cards and keeps upload limits and file action together", () => {
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<Dialog open>
					<StartCvDialog />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
	const choices = container.ownerDocument.querySelectorAll('[data-slot="action-choice"]');
	expect(choices).toHaveLength(2);
	expect(choices[0]?.className).toBe(choices[1]?.className);
	const upload = screen.getByRole("button", { name: /^Upload an existing CV/ });
	expect(upload).toHaveTextContent("Choose a file");
	expect(upload).toHaveTextContent("25 MB");
	expect(
		screen.getByRole("group", { name: "CV language" }).compareDocumentPosition(upload) &
			Node.DOCUMENT_POSITION_FOLLOWING,
	).toBeTruthy();
	expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("border-line-2");
});

it("offers creation retry after a manual start fails, rather than opening the file picker", async () => {
	mocks.create.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("new-cv");
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<Dialog open>
					<StartCvDialog />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^Write from scratch/ }));
	expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
	expect(mocks.create).toHaveBeenCalledTimes(2);
});

it("blocks dialog dismissal while manual creation is pending and opens the created CV", async () => {
	let complete!: (id: string) => void;
	mocks.create.mockReturnValue(
		new Promise<string>((resolve) => {
			complete = resolve;
		}),
	);
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<Dialog open>
					<StartCvDialog />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^Write from scratch/ }));
	const cancelDismissal = vi.fn();
	useDialogStore.getState().onOpenChange(false, { cancel: cancelDismissal });
	await waitFor(() => expect(cancelDismissal).toHaveBeenCalledOnce());
	expect(useDialogStore.getState().open).toBe(true);
	expect(mocks.create.mock.calls[0]?.[1].signal.aborted).toBe(false);
	complete("new-cv");
	await waitFor(() =>
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/builder/$resumeId",
			params: { resumeId: "new-cv" },
			search: { mode: "write" },
		}),
	);
	expect(useDialogStore.getState().open).toBe(false);
});
