import { expect, test } from "../fixtures/test";
import { totpCode } from "../fixtures/totp";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} wrong password stays inline and allows a successful retry`, async ({
			authPage: page,
			account,
			baseURL,
		}, testInfo) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.goto("/dashboard/settings/account");
			await page.getByRole("button", { name: /^(Change|تغيير)$/u }).click();
			const dialog = page.getByRole("dialog");
			const current = dialog.locator('input[name="currentPassword"]');
			const next = dialog.locator('input[name="newPassword"]');
			await current.fill("Wrong-current-password-123");
			const newPassword = `${account.password}-changed`;
			await next.fill(newPassword);
			const submit = dialog.locator('button[type="submit"]');
			await submit.click();
			const alert = dialog.getByRole("alert");
			await expect(alert).toContainText(
				locale === "ar-SA" ? "تحقق من كلمة المرور الحالية" : "Check your current password",
			);
			await expect(page.getByText("Invalid password", { exact: true })).toHaveCount(0);
			await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
			await expect(current).toHaveValue("Wrong-current-password-123");
			await expect(next).toHaveValue(newPassword);
			await expect(submit).toBeInViewport();
			// Real hit testing catches toast/layer occlusion, not just bounding-box overlap.
			expect(
				await submit.evaluate((button) => {
					const rect = button.getBoundingClientRect();
					return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
				}),
			).toBe(true);
			await submit.focus();
			await expect(submit).toBeFocused();
			await page.evaluate(() => document.fonts.ready);
			expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
			await page.screenshot({
				path: testInfo.outputPath(`${locale}-${width}-password-inline-error.png`),
				animations: "disabled",
			});
			await current.fill(account.password);
			await alert.getByRole("button", { name: /^(Try again|حاول مرة أخرى)$/u }).click();
			await expect(dialog).toHaveCount(0);
			account.password = newPassword;
		});

		test(`${locale} ${width} completes authenticator enrollment and continues login through the UI`, async ({
			authPage: page,
			account,
			baseURL,
		}, testInfo) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.goto("/dashboard/settings/account");
			await page.getByRole("button", { name: /^(Set up|إعداد)$/u }).click();
			const dialog = page.getByRole("dialog");
			await dialog.getByLabel(/^(Password|كلمة المرور)$/u).fill(account.password);
			await dialog.getByRole("button", { name: /^(Continue|استمر)$/u }).click();
			const secret = await dialog.locator("input[readonly]").inputValue();
			const uri = `otpauth://totp/MasterCV?secret=${secret.replaceAll(" ", "")}`;
			await dialog.locator('[data-slot="otp-field-input"]').fill(totpCode(uri));
			await dialog.getByRole("button", { name: /^(Verify|تحقّق|تحقق)$/u }).click();
			await expect(dialog.getByRole("button", { name: /^(Download|تنزيل)$/u })).toBeVisible();
			await dialog.getByRole("button", { name: /^(Continue|استمر)$/u }).click();
			await expect(dialog).toHaveCount(0);
			await expect(page.getByRole("button", { name: /^(Turn off|إيقاف)$/u })).toBeVisible();
			await page.reload();
			await expect(page.getByRole("button", { name: /^(Turn off|إيقاف)$/u })).toBeVisible();
			// Sign out is fixture setup; both credential and MFA continuation use real forms.
			await page.request.post("/api/auth/sign-out", { headers: { origin: new URL(page.url()).origin }, data: {} });
			await page.goto("/auth/login");
			await page.locator('input[name="identifier"]').fill(account.email);
			await page.locator('input[name="password"]').fill(account.password);
			await page.locator('button[type="submit"]').click();
			await expect(page).toHaveURL(/verify-2fa/);
			await page.locator('[data-slot="otp-field-input"]').fill(totpCode(uri));
			await page.locator('button[type="submit"]').click();
			await expect(page).toHaveURL(/dashboard/);
			await page.goto("/dashboard/settings/account");
			await expect(page.getByRole("button", { name: /^(Turn off|إيقاف)$/u })).toBeVisible();
			expect((await (await page.request.get("/api/auth/get-session")).json()).user.twoFactorEnabled).toBe(true);
			await page.screenshot({
				path: testInfo.outputPath(`${locale}-${width}-mfa-login-complete.png`),
				animations: "disabled",
			});
		});
	}
}
