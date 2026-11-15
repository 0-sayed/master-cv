// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Dialog } from "@reactive-resume/ui/components/dialog";

const mocks = vi.hoisted(() => ({
	enable: vi.fn(),
	verify: vi.fn(),
	close: vi.fn(),
	invalidate: vi.fn(async () => {}),
}));
vi.mock("@/libs/auth/client", () => ({
	authClient: { twoFactor: { enable: mocks.enable, verifyTotp: mocks.verify } },
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/hooks/use-form-blocker", () => ({ useFormBlocker: () => ({ requestClose: mocks.close }) }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn(), close: vi.fn() } }));
vi.mock("../store", () => ({
	useDialogStore: (select: (state: unknown) => unknown) => select({ closeDialog: mocks.close }),
}));

import { EnableTwoFactorDialog } from "./enable-two-factor";
import { accountSecurityQueryOptions } from "@/features/settings/account/auth-hooks";
import { getUiLocaleMessages } from "@/libs/locale";

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.enable.mockResolvedValue({
		data: { method: "totp", totpURI: "otpauth://totp/Resume?secret=ABC", backupCodes: ["82cNK-qaOiN"] },
		error: null,
	});
	mocks.verify.mockResolvedValue({ error: null });
});
afterEach(cleanup);

it("cancels before starting two-factor setup without changing credentials", () => {
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<EnableTwoFactorDialog />
			</Dialog>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
	expect(mocks.close).toHaveBeenCalledOnce();
	expect(mocks.enable).not.toHaveBeenCalled();
	expect(mocks.verify).not.toHaveBeenCalled();
});

it("shows numbered setup, an inline grouped key and one OTP before recoverable backup codes", async () => {
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<EnableTwoFactorDialog />
			</Dialog>
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
	fireEvent.click(screen.getByRole("button", { name: "Continue" }));
	const code = await screen.findByLabelText("6-digit code");
	expect(document.querySelectorAll("ol > li")).toHaveLength(3);
	expect(screen.getByRole("img").querySelector("title")).toBeNull();
	const key = screen.getByLabelText("Manual setup key");
	expect(key).toHaveAttribute("dir", "ltr");
	expect(key.closest('[data-slot="input-group"]')).toContainElement(
		screen.getByRole("button", { name: "Copy secret" }),
	);
	expect(screen.queryByText("82cNK-qaOiN")).toBeNull();
	mocks.verify.mockResolvedValueOnce({ error: { code: "INVALID_TWO_FACTOR_CODE" } });
	fireEvent.change(code, { target: { value: "012345" } });
	expect(mocks.verify).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Verify" }));
	await screen.findByRole("alert");
	expect(mocks.close).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Verify" }));
	await screen.findByDisplayValue("82cNK-qaOiN");
	expect(mocks.close).not.toHaveBeenCalled();
	expect(mocks.verify).toHaveBeenLastCalledWith({ code: "012345" });
	fireEvent.click(screen.getByRole("button", { name: "Continue" }));
	expect(mocks.close).toHaveBeenCalledOnce();
	await waitFor(() =>
		expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: accountSecurityQueryOptions().queryKey }),
	);
});

for (const locale of ["en-US", "ar-SA"] as const) {
	it(`${locale} localizes short codes and announces copying the complete manual key`, async () => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		mocks.enable.mockResolvedValue({
			data: { method: "totp", totpURI: "otpauth://totp/Resume?secret=ABCDEFGHIJKLMNOP", backupCodes: ["82cNK-qaOiN"] },
			error: null,
		});
		render(
			<I18nProvider i18n={i18n}>
				<Dialog open>
					<EnableTwoFactorDialog />
				</Dialog>
			</I18nProvider>,
		);
		const password = document.querySelector<HTMLInputElement>('input[name="password"]');
		if (!password?.form) throw new Error("Password form missing");
		fireEvent.change(password, { target: { value: "password123" } });
		fireEvent.submit(password.form);
		const code = await screen.findByRole("textbox", { name: locale === "ar-SA" ? "رمز من 6 أرقام" : "6-digit code" });
		expect(document.querySelector("input[readonly]")).toHaveValue("ABCD EFGH IJKL MNOP");
		fireEvent.click(screen.getByRole("button", { name: locale === "ar-SA" ? "نسخ المفتاح السري" : "Copy secret" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABCDEFGHIJKLMNOP"));
		expect(screen.getByRole("status").textContent).not.toBe("");
		fireEvent.change(code, { target: { value: "12345" } });
		const form = code.closest("form");
		if (!form) throw new Error("Verification form missing");
		fireEvent.submit(form);
		await screen.findByText(locale === "ar-SA" ? "يجب أن يتكوّن الرمز من 6 أرقام" : "Code must be 6 digits");
		expect(mocks.verify).not.toHaveBeenCalled();
	});
	it(`${locale} keeps MFA enrollment recoverable after a rejected password`, async () => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		mocks.enable.mockResolvedValue({ error: { code: "INVALID_PASSWORD", message: "PROVIDER_SECRET" } });
		render(
			<I18nProvider i18n={i18n}>
				<Dialog open>
					<EnableTwoFactorDialog />
				</Dialog>
			</I18nProvider>,
		);
		const password = document.querySelector<HTMLInputElement>('input[name="password"]');
		if (!password) throw new Error("Password input missing");
		fireEvent.change(password, { target: { value: "password123" } });
		const form = password.closest("form");
		if (!form) throw new Error("MFA form missing");
		fireEvent.submit(form);
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).not.toContain("PROVIDER_SECRET");
		expect(alert.textContent).toContain(
			locale === "ar-SA" ? "تحقق من كلمة المرور الحالية" : "Check your current password",
		);
		expect(password.value).toBe("password123");
		mocks.enable.mockResolvedValue({
			data: { method: "totp", totpURI: "otpauth://totp/Resume?secret=ABC", backupCodes: ["82cNK-qaOiN"] },
			error: null,
		});
		fireEvent.click(screen.getByRole("button", { name: /^(Try again|حاول مرة أخرى)$/u }));
		await screen.findByRole("img");
		expect(mocks.close).not.toHaveBeenCalled();
	});
}
