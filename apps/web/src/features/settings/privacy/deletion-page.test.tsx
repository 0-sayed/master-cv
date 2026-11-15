// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeletionPage } from "./deletion-page";
const fixture = vi.hoisted(() => ({ remove: vi.fn(), clear: vi.fn(), accept: vi.fn(), expiry: Date.now() + 300000 }));
vi.mock("@/libs/orpc/client", () => ({
	client: { privacy: { requestDeletion: fixture.remove } },
	orpc: {
		documents: {
			counts: {
				queryOptions: () => ({ queryKey: ["counts"], queryFn: async () => ({ resume: 2, letter: 1, trash: 0 }) }),
			},
		},
	},
}));
vi.mock("@tanstack/react-router", () => ({
	useRouteContext: () => ({ session: { user: { id: "alice" } } }),
	Link: ({ children, to }: { children: import("react").ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/dialogs/auth/confirm-account-access", () => ({
	ConfirmAccountAccess: ({ onVerified }: { onVerified: (value: unknown) => void }) => (
		<button
			onClick={() =>
				onVerified({ token: "proof", action: "delete_account", expiresAt: new Date(fixture.expiry).toISOString() })
			}
		>
			Verify fixture
		</button>
	),
}));
vi.mock("@/libs/browser-storage", () => ({ clearPersonalStorage: fixture.clear }));
vi.mock("@/libs/auth/identity", () => ({ authIdentity: () => ({ accept: fixture.accept }) }));
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	fixture.remove.mockReset();
	fixture.clear.mockReset();
	fixture.accept.mockReset();
	fixture.expiry = Date.now() + 300000;
});
async function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<DeletionPage />
			</QueryClientProvider>
		</I18nProvider>,
	);
	await screen.findByText(/documents, including/);
}
async function prove() {
	fireEvent.click(screen.getByRole("button", { name: "Confirm access" }));
	fireEvent.click(screen.getByRole("button", { name: "Verify fixture" }));
}
it("proof alone never submits deletion and final consent is required", async () => {
	await show();
	await prove();
	expect(fixture.remove).not.toHaveBeenCalled();
	expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeDisabled();
});
it("expired proof reconfirms without losing review consent", async () => {
	fixture.expiry = Date.now() + 500;
	await show();
	await prove();
	await userEvent.click(screen.getByRole("checkbox"));
	await screen.findByRole("button", { name: "Confirm access" });
	expect(screen.getByRole("checkbox")).toBeChecked();
	expect(screen.getByRole("button", { name: "Permanently delete my account" })).toBeDisabled();
});
it("lost response is unconfirmed and preserves client data", async () => {
	fixture.remove.mockRejectedValue(new Error("network response lost"));
	await show();
	await prove();
	await userEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByRole("button", { name: "Permanently delete my account" }));
	await waitFor(() => expect(screen.getByText("Deletion request was not confirmed")).toBeDefined());
	expect(fixture.clear).not.toHaveBeenCalled();
	expect(fixture.accept).not.toHaveBeenCalled();
	expect(screen.getByRole("link", { name: "Help and contact" })).toHaveAttribute("href", "/help");
});
it("accepted request clears private state before navigating to the public receipt", async () => {
	const events: string[] = [];
	fixture.remove.mockResolvedValue({ requestId: "accepted", status: "requested" });
	fixture.clear.mockImplementation(() => events.push("storage"));
	fixture.accept.mockImplementation(() => events.push("identity"));
	const navigate = vi.spyOn(window.location, "replace").mockImplementation(() => {
		events.push("receipt");
	});
	await show();
	await prove();
	await userEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByRole("button", { name: "Permanently delete my account" }));
	await waitFor(() => expect(navigate).toHaveBeenCalledWith("/deletion-requested"));
	expect(events).toEqual(["storage", "identity", "receipt"]);
	expect(fixture.clear).toHaveBeenCalledWith("alice");
	navigate.mockRestore();
});
it("double submit while acceptance is pending sends one request", async () => {
	fixture.remove.mockImplementation(() => new Promise(() => {}));
	await show();
	await prove();
	await userEvent.click(screen.getByRole("checkbox"));
	const submit = screen.getByRole("button", { name: "Permanently delete my account" });
	fireEvent.click(submit);
	fireEvent.click(submit);
	await waitFor(() => expect(fixture.remove).toHaveBeenCalledTimes(1));
	expect(fixture.clear).not.toHaveBeenCalled();
});
