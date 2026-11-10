// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Dialog } from "@reactive-resume/ui/components/dialog";

const mocks = vi.hoisted(() => ({ changePassword: vi.fn(), close: vi.fn() }));
vi.mock("@/libs/auth/client", () => ({
	authClient: { changePassword: mocks.changePassword },
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}) }) }));
vi.mock("@/hooks/use-form-blocker", () => ({ useFormBlocker: () => ({ requestClose: mocks.close }) }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn(), close: vi.fn() } }));
vi.mock("../store", () => ({
	useDialogStore: (select: (state: unknown) => unknown) => select({ closeDialog: mocks.close }),
}));

import { ChangePasswordDialog } from "./change-password";
import { getUiLocaleMessages } from "@/libs/locale";

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.changePassword.mockResolvedValue({ error: null });
});
afterEach(cleanup);

it("sends revokeOtherSessions: true when user checks the option", async () => {
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<ChangePasswordDialog />
			</Dialog>
		</I18nProvider>,
	);

	fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "oldPassword123" } });
	fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "newPassword456" } });
	fireEvent.click(screen.getByRole("checkbox", { name: "Sign out from all other devices" }));
	fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

	await waitFor(() => {
		expect(mocks.changePassword).toHaveBeenCalledWith({
			currentPassword: "oldPassword123",
			newPassword: "newPassword456",
			revokeOtherSessions: true,
		});
	});
	expect(mocks.close).toHaveBeenCalled();
});

it("preserves a legacy current password and keeps other sessions by default", async () => {
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<ChangePasswordDialog />
			</Dialog>
		</I18nProvider>,
	);

	fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "old123" } });
	fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "newPassword456" } });
	fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

	await waitFor(() => {
		expect(mocks.changePassword).toHaveBeenCalledWith({
			currentPassword: "old123",
			newPassword: "newPassword456",
			revokeOtherSessions: false,
		});
	});
	expect(mocks.close).toHaveBeenCalled();
});

it("localizes the same-password validation after switching the interface to Arabic", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<ChangePasswordDialog />
			</Dialog>
		</I18nProvider>,
	);
	const inputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
	for (const input of inputs) fireEvent.change(input, { target: { value: "samePassword123" } });
	const form = container.ownerDocument.querySelector("form");
	if (!form) throw new Error("Password form must be present");
	fireEvent.submit(form);
	await waitFor(() =>
		expect(screen.getByText("يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية.")).toBeDefined(),
	);
	expect(mocks.changePassword).not.toHaveBeenCalled();
});
