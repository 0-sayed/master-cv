import { capturedAuthLink } from "../fixtures/mail";
import { privacyPost } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";
import { totpCode } from "../fixtures/totp";

test("email correction retains old address through both mailbox confirmations", async ({ authPage: page, account }) => {
	await page.goto("/dashboard/settings/account");
	const destination = account.email.replace("@", "_corrected@");
	await privacyPost(page, "email/request", {
		newEmail: destination,
		requestNonce: crypto.randomUUID(),
		credential: { method: "password", password: account.password },
	});
	await page.reload();
	await expect(page.locator('[data-slot="alert"]').filter({ hasText: "Confirm at your current email" })).toContainText(
		account.email,
	);
	let current = await (await page.request.get("/api/auth/get-session")).json();
	expect(current.user.email).toBe(account.email);
	const approvalLink = await capturedAuthLink(account.email, "email_change");
	await page.goto(approvalLink);
	await expect(page).toHaveURL(/email-change\?status=verification_sent/);
	await page.goto(approvalLink);
	await expect(page).toHaveURL(/email-change\?status=verification_sent/);
	current = await (await page.request.get("/api/auth/get-session")).json();
	expect(current.user.email).toBe(account.email);
	await page.goto("/dashboard/settings/account");
	await expect(page.locator('[data-slot="alert"]').filter({ hasText: destination })).toBeVisible();
	await page.goto(await capturedAuthLink(destination, "email_change"));
	await expect(page).toHaveURL(/email-change\?status=complete/);
	current = await (await page.request.get("/api/auth/get-session")).json();
	expect(current.user.email).toBe(destination);
	// Cleanup follows the persisted corrected identity.
	account.email = destination;
});

test("enrolled MFA is required for an email correction", async ({ authPage: page, account }) => {
	await page.goto("/dashboard/settings/account");
	const origin = new URL(page.url()).origin;
	const enrolled = await page.request.post("/api/auth/two-factor/enable", {
		headers: { origin },
		data: { password: account.password },
	});
	await expect(enrolled).toBeOK();
	const { totpURI } = await enrolled.json();
	const code = () => totpCode(totpURI);
	await expect(
		await page.request.post("/api/auth/two-factor/verify-totp", { headers: { origin }, data: { code: code() } }),
	).toBeOK();
	// Enrollment rotates the session; use the normal MFA continuation before the action proof.
	await page.request.post("/api/auth/sign-out", { headers: { origin }, data: {} });
	await page.goto("/auth/login");
	await page.locator('input[name="identifier"]').fill(account.email);
	await page.locator('input[name="password"]').fill(account.password);
	await page.locator('button[type="submit"]').click();
	await expect(page).toHaveURL(/verify-2fa/);
	await page.locator('[data-slot="otp-field-input"]').fill(code());
	await page.locator('button[type="submit"]').click();
	await expect(page).toHaveURL(/dashboard/);
	const destination = account.email.replace("@", "_mfa@");
	const denied = await page.request.post("/api/openapi/privacy/email/request", {
		headers: { origin },
		data: {
			newEmail: destination,
			requestNonce: crypto.randomUUID(),
			credential: { method: "password", password: account.password },
		},
	});
	expect(denied.ok()).toBe(false);
	await privacyPost(page, "email/request", {
		newEmail: destination,
		requestNonce: crypto.randomUUID(),
		credential: { method: "password", password: account.password, mfaCode: code() },
	});
	await page.goto(await capturedAuthLink(account.email, "email_change"));
	await page.goto(await capturedAuthLink(destination, "email_change"));
	expect((await (await page.request.get("/api/auth/get-session")).json()).user.email).toBe(destination);
	account.email = destination;
});

test("virtual passkey confirms the export purpose through the actual authenticator", async ({ authPage: page }) => {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("WebAuthn.enable");
	const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			transport: "internal",
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});
	try {
		await page.goto("/dashboard/settings/account");
		await page.getByRole("button", { name: "Add passkey", exact: true }).click();
		await expect(page.getByText("Name this passkey", { exact: true })).toBeVisible();
		await page.getByRole("button", { name: "Cancel", exact: true }).click();
		await page.goto("/dashboard/settings/privacy");
		await page.getByRole("button", { name: "Request a copy of my data", exact: true }).click();
		await page.getByRole("button", { name: "Use passkey", exact: true }).click();
		await expect(page.getByRole("link", { name: "Download copy", exact: true })).toBeVisible({ timeout: 30000 });
	} finally {
		await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
		await cdp.detach();
	}
});
test("security transport failure is unknown and recoverable", async ({ authPage: page }) => {
	await page.route("**/api/rpc/**", (route) => route.abort());
	await page.goto("/dashboard/settings/account");
	await expect(page.getByRole("alert")).toBeVisible();
	await expect(page.getByText("You sign in without one")).toHaveCount(0);
	await page.unroute("**/api/rpc/**");
	await page.getByRole("button", { name: "Try again" }).first().click();
	await expect(page.getByText("You sign in without one")).toHaveCount(0);
});

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} account credential dialogs provide neutral Cancel actions`, async ({
			authPage: page,
			account,
			baseURL,
		}, testInfo) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.goto("/dashboard/settings/account");
			const dialog = page.getByRole("dialog").filter({ has: page.locator('[data-slot="dialog-footer"]') });
			const cancel = dialog.getByRole("button", { name: /^(Cancel|إلغاء)$/u });
			const capture = async (state: string) => {
				await expect(cancel).toBeVisible();
				await expect(cancel).toHaveClass(/bg-surface/);
				await expect(dialog.locator('[data-slot="dialog-footer"]')).toContainText(/Cancel|إلغاء/u);
				await page.evaluate(() => document.fonts.ready);
				expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
				await page.screenshot({ path: testInfo.outputPath(`${locale}-${width}-${state}.png`), animations: "disabled" });
			};
			await page.getByRole("button", { name: /^(Change|تغيير)$/u }).click();
			await capture("password");
			await cancel.focus();
			await expect(cancel).toBeFocused();
			await page.keyboard.press("Enter");
			await expect(dialog).toHaveCount(0);

			const enable = page.getByRole("button", { name: /^(Set up|إعداد)$/u });
			await enable.click();
			await capture("mfa-setup");
			await cancel.click();
			await enable.click();
			await dialog.getByLabel(/^(Password|كلمة المرور)$/u).fill(account.password);
			await dialog.getByRole("button", { name: /^(Continue|استمر)$/u }).click();
			await expect(dialog.locator('[data-slot="otp-field-input"]').first()).toBeVisible();
			await capture("mfa-verify");
			await cancel.click();
			await expect(dialog).toHaveCount(0);

			// Only the local synthetic auth service is used to enroll the test account.
			const origin = new URL(page.url()).origin;
			const enrollment = await page.request.post("/api/auth/two-factor/enable", {
				headers: { origin },
				data: { password: account.password },
			});
			await expect(enrollment).toBeOK();
			const { totpURI } = (await enrollment.json()) as { totpURI: string };
			await expect(
				await page.request.post("/api/auth/two-factor/verify-totp", {
					headers: { origin },
					data: { code: totpCode(totpURI) },
				}),
			).toBeOK();
			await page.reload();
			await page.getByRole("button", { name: /^(Turn off|إيقاف)$/u }).click();
			await capture("mfa-disable");
			await cancel.click();
			await expect(dialog).toHaveCount(0);
			await expect(page.getByRole("button", { name: /^(Turn off|إيقاف)$/u })).toBeVisible();
		});
	}
}
