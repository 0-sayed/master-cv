import { createHmac } from "node:crypto";
import { registerViaApi } from "../fixtures/auth";
import { settleScreen } from "../fixtures/screen";

test("Arabic desktop auth keeps the brand panel on the left", async ({ page, context, baseURL }) => {
	await context.addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3000" }]);
	await page.setViewportSize({ width: 1440, height: 950 });
	await page.goto("/auth/login");
	await settleScreen(page);
	expect((await page.locator("section").first().boundingBox())?.x).toBe(0);
	await expect(page.getByRole("button", { name: /Google|جوجل/ })).toHaveCount(0);
});
import { capturedAuthLink } from "../fixtures/mail";
import { test, expect } from "../fixtures/test";

test("auth language changes preserve signup and reset inputs", async ({ page }) => {
	await page.goto("/auth/register");
	await page.locator('input[name="name"]').fill("اسم Synthetic");
	await page.locator('input[name="email"]').fill("synthetic.locale@example.test");
	await page.locator('input[name="password"]').fill("Synthetic-password-123");
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await expect(page.locator('input[name="name"]')).toHaveValue("اسم Synthetic");
	await expect(page.locator('input[name="email"]')).toHaveValue("synthetic.locale@example.test");
	await expect(page.locator('input[name="password"]')).toHaveValue("Synthetic-password-123");
	await expect(page.getByRole("checkbox")).toBeChecked();
	await expect(page.locator('input[type="tel"]')).toHaveCount(0);
	await page.goto("/auth/reset-password?token=synthetic-locale-proof");
	await page.locator('input[name="password"]').fill("Replacement-password-123");
	await page.locator('input[name="confirmation"]').fill("Replacement-password-123");
	await page.getByRole("button", { name: "تغيير الواجهة إلى الإنجليزية" }).click();
	await expect(page.locator('input[name="password"]')).toHaveValue("Replacement-password-123");
	await expect(page.locator('input[name="confirmation"]')).toHaveValue("Replacement-password-123");
});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`verified signup and welcome ${locale} at ${width}`, async ({ page, account, baseURL, context }, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await page.goto("/auth/register");
			await page.locator('input[name="name"]').fill(account.name);
			await page.locator('input[name="username"]').fill(account.username);
			await page.locator('input[name="email"]').fill(account.email);
			await page.locator('input[name="password"]').fill(account.password);
			await page.getByRole("checkbox").check();
			await page.getByRole("button", { name: locale === "en-US" ? "Sign up" : "إنشاء حساب", exact: true }).click();
			await expect(page).toHaveURL(/\/auth\/verify-email/);
			await expect(page.locator("html")).toHaveAttribute("dir", locale === "en-US" ? "ltr" : "rtl");
			const loadedFonts = await page.evaluate(async () => {
				const faces = await Promise.all([
					document.fonts.load('400 16px "Noto Sans Arabic"', "العربية"),
					document.fonts.load('400 16px "Noto Sans"', "Master CV"),
				]);
				return faces.map((group) => group.map((face) => face.status));
			});
			for (const statuses of loadedFonts) {
				expect(statuses.length).toBeGreaterThan(0);
				expect(statuses.every((status) => status === "loaded")).toBe(true);
			}
			await page.evaluate(() => document.fonts.ready);
			expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans Arabic"'))).toBe(true);
			expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans"'))).toBe(true);
			await expect(page.getByRole("button", { name: /Google|جوجل/ })).toHaveCount(0);
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("verify-email.png"), fullPage: true });
			await page.goto("/dashboard");
			await expect(page).toHaveURL(/\/auth\/login/);
			const loginBefore = await page.request.post("/api/auth/sign-in/email", {
				headers: { origin: baseURL ?? "http://localhost:3000" },
				data: { email: account.email, password: account.password },
			});
			expect(loginBefore.status()).toBe(403);
			await page.goto(await capturedAuthLink(account.email, "verification"));
			await expect(page).toHaveURL(/\/auth\/login/);
			const noSession = await page.request.get("/api/auth/get-session");
			expect(await noSession.json()).toBeNull();
			await page.locator('input[name="identifier"]').fill(account.email);
			await page.locator('input[name="password"]').fill(account.password);
			await page.locator('button[type="submit"]').click();
			await expect(page).toHaveURL(/\/dashboard\/welcome/);
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("welcome.png"), fullPage: true });
			await page.getByRole("button", { name: locale === "en-US" ? "Explore first" : "أتصفّح أولًا", exact: true }).click();
			await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
			await page.reload();
			await expect(page).not.toHaveURL(/welcome/);
			await expect(page.locator("h1")).toBeAttached();
			await expect(page.getByRole("button", { name: locale === "en-US" ? "New" : "جديد", exact: true })).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("documents-empty.png"), fullPage: true });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		});
	}

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`reset uses captured SMTP ${locale} at ${width}`, async ({ page, account, baseURL, context }, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await registerViaApi(page.request, account, baseURL ?? "http://localhost:3000");
			await page.request.get(await capturedAuthLink(account.email, "verification"));
			await page.goto("/auth/forgot-password");
			await page.locator('input[name="email"]').fill(account.email);
			await page.locator('button[type="submit"]').click();
			await expect(
				page.getByRole("heading", { name: locale === "en-US" ? "Check your email" : "تحقق من بريدك" }),
			).toBeVisible();
			await page.goto(await capturedAuthLink(account.email, "reset"));
			await expect(page).toHaveURL(/auth\/reset-password/);
			await page.locator('input[name="password"]').fill("Replacement-password-123");
			await page.locator('input[name="confirmation"]').fill("Different-password-123");
			await page.locator('button[type="submit"]').click();
			await expect(page.getByRole("alert")).toBeVisible();
			await expect(page).toHaveURL(/reset-password/);
			await page.locator('input[name="confirmation"]').fill("Replacement-password-123");
			await page.locator('button[type="submit"]').click();
			await expect(page).toHaveURL(/reason=passwordChanged/);
			await expect(page.getByRole("status")).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("password-changed.png"), fullPage: true });
			await page.locator('input[name="identifier"]').fill(account.email);
			await page.locator('input[name="password"]').fill(account.password);
			await page.locator('button[type="submit"]').click();
			await expect(page.getByRole("alert")).toBeVisible();
			await expect(page.getByRole("alert")).toBeFocused();
			await page.getByRole("alert").getByRole("link").click();
			await expect(page.locator("#login-password")).toBeFocused();
		});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`verification recovery and resend ${locale} at ${width}`, async ({
			page,
			context,
			account,
			baseURL,
		}, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await registerViaApi(page.request, account, baseURL ?? "http://localhost:3000");
			const url = new URL(await capturedAuthLink(account.email, "verification"));
			url.searchParams.set("token", "invalid-proof");
			url.searchParams.set(
				"callbackURL",
				`${baseURL}/auth/verify-email?email=${encodeURIComponent(account.email)}&done=true`,
			);
			await page.goto(url.toString());
			await expect(
				page.getByRole("heading", { name: locale === "en-US" ? "Link expired" : "انتهت صلاحية الرابط" }),
			).toBeVisible();
			await page.route("**/api/auth/send-verification-email", (route) =>
				route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ code: "UNKNOWN", message: "private server detail" }),
				}),
			);
			const resend = page.getByRole("button", { name: locale === "en-US" ? "Resend link" : "إعادة إرسال الرابط" });
			await resend.click();
			await expect(page.getByRole("alert")).toBeVisible();
			await expect(page.getByRole("alert")).not.toContainText("private server detail");
			await expect(page.getByText(account.email, { exact: false })).toBeVisible();
			await page.unroute("**/api/auth/send-verification-email");
			const sentAt = Date.now();
			await resend.click();
			await expect(resend).toBeDisabled();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("verification-recovery.png"), fullPage: true });
			await page.goto(await capturedAuthLink(account.email, "verification", sentAt));
			await expect(page).toHaveURL(/auth\/login/);
			expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
		});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`invalid reset recovery ${locale} at ${width}`, async ({ page, context, baseURL }, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await page.goto("/auth/reset-password?token=invalid-synthetic-proof");
			await page.locator('input[name="password"]').fill("Replacement-password-123");
			await page.locator('input[name="confirmation"]').fill("Replacement-password-123");
			await page.locator('button[type="submit"]').click();
			await expect(page.getByRole("alert")).toBeVisible();
			const recovery = page.locator('a[href="/auth/forgot-password"]');
			await expect(recovery).toBeVisible();
			await expect(page.locator('input[name="password"]')).toHaveCount(0);
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("reset-recovery.png"), fullPage: true });
			await recovery.click();
			await expect(page.locator('input[name="email"]')).toBeVisible();
		});

function currentTotp(uri: string) {
	const encoded = new URL(uri).searchParams.get("secret");
	if (!encoded) throw new Error("Enrollment secret missing");
	const bits = [...encoded.toUpperCase()]
		.map((c) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0"))
		.join("");
	const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
	const digest = createHmac("sha1", key).update(counter).digest();
	const offset = digest[digest.length - 1] & 15;
	return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`enrolled MFA continuation ${locale} at ${width}`, async ({ authPage: page, account, baseURL }, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			const enrollment = await page.request.post("/api/auth/two-factor/enable", {
				headers: { origin: baseURL ?? "http://localhost:3000" },
				data: { password: account.password },
			});
			expect(enrollment.ok()).toBe(true);
			const { totpURI } = await enrollment.json();
			const verify = await page.request.post("/api/auth/two-factor/verify-totp", {
				headers: { origin: baseURL ?? "http://localhost:3000" },
				data: { code: currentTotp(totpURI) },
			});
			expect(verify.ok()).toBe(true);
			await page.request.post("/api/auth/sign-out", {
				headers: { origin: baseURL ?? "http://localhost:3000" },
				data: {},
			});
			await page.goto("/auth/login");
			await page.locator('input[name="identifier"]').fill(account.email);
			await page.locator('input[name="password"]').fill(account.password);
			await page.locator('button[type="submit"]').click();
			await expect(page).toHaveURL(/verify-2fa/);
			await expect(page.locator('[data-slot="otp-field-input"]').first()).toBeVisible();
			expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("mfa.png"), fullPage: true });
			await page.locator('[data-slot="otp-field-input"]').first().fill(currentTotp(totpURI));
			await expect(page).toHaveURL(/dashboard/);
			expect((await page.request.get("/api/openapi/career/master")).ok()).toBe(true);
		});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`base CV quota recovery preserves library ${locale} at ${width}`, async ({ authPage: page }, testInfo) => {
			await page.setViewportSize({ width, height: 950 });
			await page.goto(`/dashboard?locale=${locale}`);
			await page.locator('button[aria-keyshortcuts="N"]').first().click();
			await page.route("**/api/rpc/resume/create", (route) =>
				route.fulfill({
					status: 412,
					contentType: "application/json",
					body: JSON.stringify({
						json: {
							defined: false,
							code: "PRECONDITION_FAILED",
							status: 412,
							message: "Synthetic quota",
							data: { reason: "BASE_CV_LIMIT" },
						},
					}),
				}),
			);
			await page
				.getByRole("dialog")
				.getByRole("button", { name: locale === "en-US" ? "Start blank" : "ابدأ فارغًا", exact: false })
				.click();
			await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("base-cv-limit.png"), fullPage: true });
			await page
				.getByRole("dialog")
				.getByRole("button", { name: locale === "en-US" ? "Back to documents" : "العودة إلى الوثائق", exact: true })
				.click();
			await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible();
			await expect(page.locator("h1")).toBeAttached();
			await expect(page.getByRole("button", { name: locale === "en-US" ? "New" : "جديد", exact: true })).toBeVisible();
			await expect(page).toHaveURL(/dashboard/);
		});
