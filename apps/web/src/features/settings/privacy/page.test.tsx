// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivacyPage } from "./page";
const fixture = vi.hoisted(() => ({ latest: vi.fn(), request: vi.fn(), notify: vi.fn() }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: fixture.notify } }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@/libs/orpc/client", () => ({
	client: { privacy: { requestExport: fixture.request } },
	orpc: { privacy: { latestExport: { queryOptions: () => ({ queryKey: ["export"], queryFn: fixture.latest }) } } },
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to, search, ...props }: { children: ReactNode; to: string; search?: Record<string, string> }) => (
		<a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/dialogs/auth/confirm-account-access", () => ({
	ConfirmAccountAccess: ({ onVerified }: { onVerified: (proof: { token: string }) => void }) => (
		<button onClick={() => onVerified({ token: "fresh-proof" })}>Verify fixture</button>
	),
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
function show(value: unknown = null, unavailable = false) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	if (unavailable) fixture.latest.mockRejectedValue(new Error("offline"));
	else fixture.latest.mockResolvedValue(value);
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<PrivacyPage />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("summarizes stored categories with expandable details and a draft policy link", async () => {
	show();
	const toggle = screen.getByRole("button", { name: /Your account/ });
	expect(toggle).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(toggle);
	expect(await screen.findByText(/Name, email and password/)).toBeVisible();
	expect(screen.getByRole("link", { name: "Privacy policy and help" })).toHaveAttribute(
		"href",
		"/privacy-and-terms?tab=privacy&locale=en-US",
	);
	expect(screen.queryByText(/owner approval/i)).not.toBeInTheDocument();
});
it("a new export requires fresh proof and has one request action", async () => {
	show();
	await screen.findByText("No data copy requested yet");
	fixture.request.mockResolvedValue({ id: "new-copy", status: "queued" });
	fireEvent.click(screen.getByRole("button", { name: "Request a copy of my data" }));
	expect(fixture.request).not.toHaveBeenCalled();
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "Verify fixture" })));
	await vi.waitFor(() =>
		expect(fixture.request).toHaveBeenCalledWith(expect.objectContaining({ proofToken: "fresh-proof" })),
	);
});
it("does not misrepresent a failed status lookup as an empty export history", async () => {
	show(null, true);
	await screen.findByText("Export status is unavailable");
	expect(screen.queryByText("No data copy requested yet")).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Request a copy of my data" })).not.toBeInTheDocument();
	fixture.latest.mockResolvedValue(null);
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(await screen.findByText("No data copy requested yet")).toBeVisible();
});
it("a preparing copy blocks another request and states how readiness is notified", async () => {
	show({ id: "owned", status: "preparing", requestedAt: new Date().toISOString(), expiresAt: null, failureCode: null });
	await screen.findByText("Preparing your data copy");
	expect(screen.queryByRole("button", { name: "Request a copy of my data" })).not.toBeInTheDocument();
	expect(screen.getByRole("status")).toHaveTextContent("we email you when it is ready");
});
it("announces readiness in-app when a preparing copy finishes", async () => {
	vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
	try {
		show({
			id: "owned",
			status: "preparing",
			requestedAt: new Date().toISOString(),
			expiresAt: null,
			failureCode: null,
		});
		await screen.findByText("Preparing your data copy");
		fixture.latest.mockResolvedValue({
			id: "owned",
			status: "ready",
			requestedAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 60000).toISOString(),
			failureCode: null,
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		await screen.findByRole("link", { name: "Download copy" });
		expect(fixture.notify).toHaveBeenCalledWith(expect.objectContaining({ description: "Your data copy is ready" }));
	} finally {
		vi.useRealTimers();
	}
});
it("the danger zone is last, explains retention and links back to export", async () => {
	show();
	const sections = screen.getAllByRole("region");
	const danger = sections[sections.length - 1];
	if (!danger) throw new Error("Missing danger zone");
	expect(within(danger).getByRole("heading", { name: "Delete account" })).toBeVisible();
	expect(within(danger).getByText(/Backups/)).toBeVisible();
	expect(within(danger).getByRole("link", { name: "Download your data first" })).toHaveAttribute(
		"href",
		"#data-export",
	);
	expect(within(danger).getByRole("link", { name: "Review account deletion" })).toHaveAttribute(
		"href",
		"/dashboard/settings/delete-account",
	);
});
