// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SecuritySection } from "./security";

const state = vi.hoisted(() => ({ value: { status: "loading" } as unknown, passkeysError: false }));
vi.mock("./auth-hooks", () => ({ useAccountSecurity: () => state.value }));
vi.mock("./sessions", () => ({ SessionsSection: () => null }));
vi.mock("@/dialogs/store", () => ({ useDialogStore: () => vi.fn() }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn(), usePrompt: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to }: { children: import("react").ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/libs/auth/client", () => ({
	authClient: {
		passkey: { listUserPasskeys: async () => (state.passkeysError ? { error: { message: "offline" } } : { data: [] }) },
	},
}));
afterEach(cleanup);
function show(value: unknown) {
	state.value = value;
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<SecuritySection />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("accounts error is unknown not passwordless", () => {
	show({ status: "error", refresh: vi.fn() });
	expect(screen.queryByText("Not set")).toBeNull();
	expect(screen.getByRole("alert")).toBeDefined();
	expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
});
it("loading MFA is not disabled", () => {
	show({ status: "loading" });
	expect(screen.queryByRole("switch")).toBeNull();
	expect(screen.getByRole("status")).toBeDefined();
});
it("successful empty is empty", () => {
	show({
		status: "ready",
		data: { credentials: { hasPassword: false, mfaEnabled: false, passkeyCount: 0 }, sessions: [], pendingEmail: null },
		refresh: vi.fn(),
	});
	expect(screen.getByText("Not set")).toBeDefined();
	expect(screen.getByText("Off")).toBeDefined();
	expect(screen.queryByText("You sign in without one")).toBeNull();
	expect(screen.queryByText("Two-step verification is not enabled")).toBeNull();
});
it("stale known enrollment retains error label", () => {
	show({
		status: "error",
		data: { credentials: { hasPassword: true, mfaEnabled: true, passkeyCount: 1 }, sessions: [], pendingEmail: null },
		refresh: vi.fn(),
	});
	expect(screen.getByRole("alert")).toBeDefined();
	expect(screen.getByText("On")).toBeDefined();
});

it("failed passkeys query disables method changes", async () => {
	state.passkeysError = true;
	show({
		status: "ready",
		data: { credentials: { hasPassword: true, mfaEnabled: false, passkeyCount: 0 }, sessions: [], pendingEmail: null },
		refresh: vi.fn(),
	});
	await screen.findByRole("alert");
	expect(screen.getByRole("button", { name: "Add passkey" }).hasAttribute("disabled")).toBe(true);
	state.passkeysError = false;
});
