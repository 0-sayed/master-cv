// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Clarification } from "./clarification";
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/career">{children}</a>,
}));
const api = vi.hoisted(() => ({ answer: vi.fn(), dismiss: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	client: { ai: { review: { answer: api.answer, dismissQuestion: api.dismiss } } },
}));
vi.mock("../editor/proposals/review-operation", () => ({
	ReviewNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));
afterEach(() => {
	cleanup();
	document.documentElement.removeAttribute("dir");
});

function showQuestion(dismissed: string[] = []) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const view = render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<Clarification
					operationId="review"
					source={{ kind: "resume", id: "cv", revision: "1" }}
					questions={[{ id: "q", prompt: "What project can you confirm?" }]}
					resolved={[]}
					dismissed={dismissed}
					stale={false}
					onSaved={() => {}}
				/>
			</QueryClientProvider>
		</I18nProvider>,
	);
	return { ...view, cache };
}

it("shows a failed Skip beside the question and clears it when opening an answer", async () => {
	api.dismiss.mockRejectedValueOnce(new Error("offline"));
	const { cache } = showQuestion();
	fireEvent.click(screen.getByRole("button", { name: "Skip" }));
	expect(await screen.findByRole("alert")).toBeDefined();
	expect(screen.queryByRole("dialog")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Add information" }));
	await screen.findByRole("dialog");
	await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
	cache.clear();
});

it("keeps an unsaved answer visible after failure", async () => {
	api.answer.mockRejectedValueOnce(new Error("offline"));
	const { cache } = showQuestion();
	fireEvent.click(screen.getByRole("button", { name: "Add information" }));
	fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Built a reporting project." } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(await screen.findByRole("alert")).toBeDefined();
	expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Built a reporting project.");
	cache.clear();
});

it("shows skipped status without implying supplied information", () => {
	const { cache } = showQuestion(["q"]);
	expect(screen.getByText("Skipped. You can request another review when you have more information.")).toBeDefined();
	expect(screen.queryByText(/Supplied information/)).toBeNull();
	expect(screen.queryByRole("button", { name: "Add information" })).toBeNull();
	cache.clear();
});
it("isolates English generated clarification text from an Arabic interface in the overlay", async () => {
	document.documentElement.dir = "rtl";
	i18n.loadAndActivate({ locale: "ar-SA", messages: {} });
	const cache = new QueryClient();
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={cache}>
				<Clarification
					operationId="review"
					source={{ kind: "resume", id: "cv", revision: "1" }}
					questions={[{ id: "q", prompt: "What project can you confirm?" }]}
					resolved={[]}
					stale={false}
					onSaved={() => {}}
				/>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Add information" }));
	const dialog = await screen.findByRole("dialog");
	const prompt = Array.from(dialog.querySelectorAll("p")).find(
		(node) => node.textContent === "What project can you confirm?",
	);
	expect(prompt?.getAttribute("dir")).toBe("auto");
	cache.clear();
});
