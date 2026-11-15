import type { Page, TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { capturedAuthLink } from "../fixtures/mail";
import { privacyPost, privacyDatabase } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";

async function capture(page: Page, info: TestInfo, name: string) {
	await expect(page.locator("main h1")).toBeAttached();
	await page.evaluate(async () => {
		await Promise.all([
			document.fonts.load('400 16px "Noto Sans"', "Master CV"),
			document.fonts.load('400 16px "Noto Sans Arabic"', "العربية"),
		]);
		await document.fonts.ready;
	});
	const metrics = await page.evaluate(() => ({
		width: innerWidth,
		scrollWidth: document.documentElement.scrollWidth,
		fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
	}));
	expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
	expect(metrics.fonts.some((f) => f.includes("Noto"))).toBe(true);
	await writeFile(info.outputPath(`${name}.json`), JSON.stringify(metrics));
	await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
	const scroller = (await page.getByRole("dialog").count()) ? page.getByRole("dialog") : page.locator("main");
	const sizes = await scroller.evaluate((e) => ({ height: e.clientHeight, total: e.scrollHeight }));
	for (
		let top = sizes.height - 80, index = 1;
		sizes.height > 100 && sizes.total > sizes.height + 10 && top < sizes.total - 10;
		top += sizes.height - 80, index++
	) {
		await scroller.evaluate((e, y) => {
			e.scrollTop = y;
		}, top);
		await page.screenshot({
			path: info.outputPath(`${name}-scroll-${index}.png`),
			fullPage: true,
			animations: "disabled",
		});
	}

	await scroller.evaluate((e) => {
		e.scrollTop = 0;
	});
}

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`${locale} ${width} first use, settings and email outcomes`, async ({
			authPage: page,
			account,
			baseURL,
		}, info) => {
			test.setTimeout(180000);
			if (!baseURL) throw new Error("Synthetic URL required");
			await page.setViewportSize({ width, height: 1024 });
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			const session = await (await page.request.get("/api/auth/get-session")).json();
			const agent = await page.evaluate(() => navigator.userAgent);
			await privacyDatabase((pool) =>
				pool.query('UPDATE "session" SET user_agent=$1 WHERE id=$2', [agent, session.session.id]),
			);
			const shot = (name: string) => capture(page, info, `${locale}-${width}-${name}`);
			await page.goto("/dashboard");
			const empty = page.locator('[data-slot="empty-state"]');
			await expect(empty).toBeVisible();
			await expect(empty.getByRole("button")).toHaveCount(2);
			await expect(empty.locator('[data-slot="icon"]').first()).toHaveAttribute("aria-hidden", "true");
			await expect(page.locator("html")).toHaveAttribute("dir", locale === "en-US" ? "ltr" : "rtl");
			await shot("documents-first-use");
			await empty.getByRole("button").first().click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await page
				.getByRole("dialog")
				.getByRole("button", { name: /^(Cancel|إلغاء)$/u })
				.click();
			await expect(page.getByRole("dialog")).toHaveCount(0);
			for (const [path, name] of [
				["/dashboard/trash", "trash-empty"],
				["/dashboard/career/information", "career-empty"],
				["/dashboard/career/knowledge/facts", "facts-empty"],
				["/dashboard/career/knowledge/stories", "stories-empty"],
				["/dashboard/career/offers", "offers-empty"],
				["/dashboard/applications", "applications-empty"],
				["/dashboard/settings/privacy", "export-empty"],
			]) {
				await page.goto(path);
				if (name === "export-empty") {
					await expect(page.locator('main [role="status"]')).toContainText(
						locale === "en-US" ? "No data copy requested yet" : "لم تطلب نسخة من بياناتك بعد",
					);
				} else await expect(page.locator('[data-slot="empty-state"]').first()).toBeVisible();
				await shot(name);
			}
			const application = await page.request.post("/api/openapi/applications", {
				data: { company: "Synthetic dashboard audit", role: "Engineer", status: "saved" },
			});
			await expect(application).toBeOK();
			await page.goto("/dashboard/applications?q=synthetic-no-match");
			await expect(empty).toBeVisible();
			await shot("applications-no-results");
			if (width === 1440) {
				await page.goto("/dashboard/applications?view=calendar");
				await expect(empty).toBeVisible();
				await shot("calendar-empty");
			}
			await page.goto("/dashboard/applications?view=insights");
			await expect(empty).toBeVisible();
			await shot("application-insights");
			const created = await page.request.post("/api/openapi/resumes", {
				data: { name: "Synthetic search CV", tags: [], withSampleData: false },
			});
			await expect(created).toBeOK();
			await page.goto("/dashboard?q=synthetic-no-match");
			await expect(empty).toBeVisible();
			await expect(empty.getByRole("button")).toHaveCount(1);
			await shot("documents-no-results");
			await empty.getByRole("button").click();
			await expect(empty).toHaveCount(0);
			await page.goto("/dashboard/settings/account");
			const security = await privacyPost(page, "security", {});
			const currentDevice = security.sessions.find((item: { current: boolean }) => item.current);
			expect(currentDevice.deviceLabel).toContain("Chrome");
			expect(currentDevice).not.toHaveProperty("userAgent");
			await expect(page.getByRole("button", { name: /^(Add passkey|إضافة مفتاح مرور)$/u })).toBeEnabled();
			await shot("account");
			const setup = page.getByRole("button", { name: /^(Set up|إعداد)$/u });
			await setup.click();
			const dialog = page.getByRole("dialog");
			await dialog.locator('input[type="password"]').fill(account.password);
			await dialog.locator('button[type="submit"]').click();
			await expect(dialog.locator("ol")).toBeVisible();
			const inset = await dialog.evaluate((e) => {
				const titleElement = e.querySelector('[data-slot="dialog-title"]');
				const stepsElement = e.querySelector("ol");
				if (!titleElement || !stepsElement) throw new Error("Authenticator title and steps required");
				const title = titleElement.getBoundingClientRect();
				const steps = stepsElement.getBoundingClientRect();
				return document.dir === "rtl" ? { title: title.right, steps: steps.right } : { title: title.x, steps: steps.x };
			});
			expect(inset.steps).toBeCloseTo(inset.title, 0);
			await shot("authenticator-setup");
			await dialog.getByRole("button", { name: /^(Cancel|إلغاء)$/u }).click();
			await expect(dialog).toHaveCount(0);
			await page.goto("/dashboard/settings/preferences");
			await expect(page.getByRole("radio")).toHaveCount(3);
			await shot("preferences");
			await page.getByRole("radio", { name: /^(Dark|داكن)$/u }).click();
			await expect(page.locator("html")).toHaveClass(/dark/);
			await page.getByRole("radio", { name: /^(Light|فاتح)$/u }).click();
			await expect(page.locator("html")).not.toHaveClass(/dark/);
			await page.goto("/dashboard/settings/account");
			const destination = account.email.replace("@", "_next@");
			const requestChange = () =>
				privacyPost(page, "email/request", {
					newEmail: destination,
					requestNonce: crypto.randomUUID(),
					credential: { method: "password", password: account.password },
				});
			await requestChange();
			await page.goto("/email-change?status=delivery_failed");
			await expect(page.locator('[data-slot="status-card"]')).toContainText(account.email);
			await shot("email-delivery-failed");
			for (const status of ["invalid", "expired"]) {
				await page.goto(`/email-change?status=${status}`);
				await expect(page.locator('[data-slot="status-card"]')).toBeVisible();
				await shot(`email-${status}`);
			}
			await expect(
				await page.request.post("/api/openapi/privacy/email/cancel", { headers: { origin: baseURL }, data: {} }),
			).toBeOK();
			await page.goto("/email-change?status=cancelled");
			await shot("email-cancelled");
			await requestChange();
			await page.goto(await capturedAuthLink(account.email, "email_change"));
			await expect(page).toHaveURL(/status=verification_sent/);
			await expect(page.locator('[data-slot="status-card"]')).toContainText(destination);
			await shot("email-verification-sent");
			await page.goto("/email-change?status=confirmed_old");
			await expect(page.locator('[data-slot="status-card"]')).toContainText(destination);
			await shot("email-confirmed-old");
			await page.goto(await capturedAuthLink(destination, "email_change"));
			await expect(page).toHaveURL(/status=complete/);
			account.email = destination;
			await expect(page.locator('[data-slot="status-card"]')).toContainText(destination);
			await shot("email-complete");
		});
	}

test("email result resends the pending confirmation and completes the same change", async ({
	authPage: page,
	account,
}) => {
	await page.goto("/dashboard/settings/account");
	const destination = account.email.replace("@", "_resend@");
	await privacyPost(page, "email/request", {
		newEmail: destination,
		requestNonce: crypto.randomUUID(),
		credential: { method: "password", password: account.password },
	});
	await page.goto(await capturedAuthLink(account.email, "email_change"));
	// Advance only this synthetic request beyond the existing resend cooldown.
	await privacyDatabase((pool) =>
		pool.query("UPDATE account_email_change SET requested_at=now()-interval '61 seconds' WHERE new_email=$1", [
			destination,
		]),
	);
	const sentAt = Date.now();
	await page.getByRole("button", { name: "Resend", exact: true }).click();
	await expect(page.getByRole("status")).toHaveText("Confirmation email sent. Check your inbox.");
	await page.goto(await capturedAuthLink(destination, "email_change", sentAt));
	await expect(page).toHaveURL(/status=complete/);
	account.email = destination;
	await expect(page.locator('[data-slot="status-card"]')).toContainText(destination);
});

test("device timezone applies immediately and remains selected after reload", async ({ authPage: page }) => {
	await page.goto("/dashboard/settings/preferences");
	const timezone = page.getByRole("combobox").last();
	await expect(timezone).toContainText("UTC");
	await timezone.click();
	await page.getByRole("option", { name: /Asia\/Riyadh/ }).click();
	const device = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
	await page.getByRole("button", { name: `Use this device's timezone (${device})`, exact: true }).click();
	await expect(timezone).toContainText(device);
	await expect(page.locator('[data-slot="toast"]')).toContainText("Saved");
	await page.reload();
	await expect(timezone).toContainText(device);
});
