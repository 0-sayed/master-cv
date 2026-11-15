// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChangeEmailDialog } from "./change-email";
const calls = vi.hoisted(() => ({ request: vi.fn(), close: vi.fn(), security: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ client: { privacy: { requestEmailChange: calls.request } } }));
vi.mock("@/features/settings/account/auth-hooks", () => ({ useAccountSecurity: calls.security }));
vi.mock("../store", () => ({
	useDialogStore: (select: (s: { closeDialog: () => void }) => unknown) => select({ closeDialog: calls.close }),
}));
vi.mock("@reactive-resume/ui/components/task-overlay", () => {
	const Box = ({ children }: { children: ReactNode }) => <div>{children}</div>;
	return {
		TaskOverlay: Box,
		TaskOverlayContent: Box,
		TaskOverlayHeader: Box,
		TaskOverlayTitle: Box,
		TaskOverlayDescription: Box,
		TaskOverlayFooter: Box,
	};
});
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	calls.security.mockReturnValue({ status: "ready", data: { credentials: { hasPassword: true } } });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<ChangeEmailDialog />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("credential/server errors preserve new address, password and MFA for recovery", async () => {
	calls.request.mockRejectedValue(new Error("MFA_INVALID"));
	show();
	fireEvent.change(screen.getByLabelText("New email"), { target: { value: "corrected@example.test" } });
	fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "synthetic-password" } });
	fireEvent.change(screen.getByLabelText("Authenticator code, if enabled"), { target: { value: "123456" } });
	fireEvent.click(screen.getByRole("button", { name: "Send verification link" }));
	expect(await screen.findByRole("alert")).toBeDefined();
	expect(screen.getByLabelText("New email")).toHaveValue("corrected@example.test");
	expect(screen.getByLabelText("Current password")).toHaveValue("synthetic-password");
	expect(calls.close).not.toHaveBeenCalled();
	calls.request.mockResolvedValue({ status: "pending" });
	fireEvent.click(screen.getByRole("button", { name: "Send verification link" }));
	await waitFor(() => expect(calls.close).toHaveBeenCalledOnce());
	expect(calls.request).toHaveBeenLastCalledWith(
		expect.objectContaining({ credential: { method: "password", password: "synthetic-password", mfaCode: "123456" } }),
	);
});
