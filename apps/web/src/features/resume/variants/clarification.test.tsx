// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Clarification } from "./clarification";
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/career">{children}</a>,
}));
vi.mock("@/libs/orpc/client", () => ({ client: {} }));
vi.mock("../editor/proposals/review-operation", () => ({ ReviewNotice: () => null }));
afterEach(() => {
	cleanup();
	document.documentElement.removeAttribute("dir");
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
