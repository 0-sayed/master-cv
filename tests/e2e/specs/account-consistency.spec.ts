import type { Page, TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { capturedAuthLink } from "../fixtures/mail";
import { privacyDatabase, seedPrivacyAccount } from "../fixtures/privacy";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { totpCode } from "../fixtures/totp";

/** Render the real workflows; capture geometry separately from functional acceptance. */
async function capture(page: Page, info: TestInfo, surface: string, locale: string, width: number) {
	await settleScreen(page);
	await expect(page.locator("html")).toHaveAttribute("lang", locale);
	await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
	const modal = page
		.locator('[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="alert-dialog-content"]')
		.filter({ visible: true });
	if (await modal.count()) {
		await expect(modal.last()).toBeVisible();
		await expect(modal.last()).not.toHaveAttribute("data-starting-style");
		await modal.last().evaluate(async (e) => {
			await Promise.all(e.getAnimations().map((a) => a.finished));
		});
	}
	// Measure the same settled state used by Playwright's animations-disabled screenshots.
	await page.evaluate(() => {
		for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish();
	});
	const metrics = await page.evaluate(() => {
		const visible = (e: Element) => e.getBoundingClientRect().height > 0;
		const bounds = (e: Element) => {
			const r = e.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
		};
		return {
			width: innerWidth,
			touch: matchMedia("(pointer: coarse)").matches,
			smallTouchTargets: [...document.querySelectorAll('button, [role="checkbox"], [role="radio"], a.touch-target')]
				.filter(visible)
				.filter((e) => {
					const box = e.getBoundingClientRect();
					const hit = getComputedStyle(e, "::after");
					const hitWidth = hit.content !== "none" ? Number.parseFloat(hit.width) || 0 : 0;
					const hitHeight = hit.content !== "none" ? Number.parseFloat(hit.height) || 0 : 0;
					const label = e.closest("label")?.getBoundingClientRect();
					return (
						Math.max(box.width, hitWidth, label?.width ?? 0) < 44 ||
						Math.max(box.height, hitHeight, label?.height ?? 0) < 44
					);
				})
				.map((e) => e.getAttribute("aria-label") || e.textContent),
			scrollWidth: document.documentElement.scrollWidth,
			fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
			groups: [...document.querySelectorAll('[data-slot="input-group"]')].filter(visible).map((group) => ({
				field: bounds(group),
				actions: [...group.querySelectorAll("button")].map(bounds),
			})),
			modals: [
				...document.querySelectorAll(
					'[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="alert-dialog-content"]',
				),
			]
				.filter(visible)
				.map((e) => ({
					...bounds(e),
					overflow: e.scrollWidth > e.clientWidth,
				})),
			footers: [...document.querySelectorAll('[data-slot="dialog-footer"], [data-slot="alert-dialog-footer"]')]
				.filter(visible)
				.map((e) => ({
					padding: getComputedStyle(e).paddingTop,
					bodyEnd: e.previousElementSibling?.getBoundingClientRect().bottom,
					buttons: [...e.querySelectorAll("button, a")].map(bounds),
				})),
			focus: document.activeElement
				? {
						slot: document.activeElement.getAttribute("data-slot"),
						outline: getComputedStyle(document.activeElement).outline,
						shadow: getComputedStyle(document.activeElement).boxShadow,
					}
				: null,
			clippedControls: [...document.querySelectorAll("button, label")]
				.filter(visible)
				.filter((e) => !!e.textContent?.trim())
				.filter((e) => !e.classList.contains("sr-only"))
				.filter((e) => {
					const box = e.getBoundingClientRect();
					// Measure label text, excluding shared hit areas and Base UI's visually hidden native inputs.
					const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
					for (let node = walker.nextNode(); node; node = walker.nextNode()) {
						if (!node.textContent?.trim() || node.parentElement?.closest('.sr-only, [aria-hidden="true"]')) continue;
						const truncated = node.parentElement?.closest(".truncate");
						if (truncated && getComputedStyle(truncated).textOverflow === "ellipsis") {
							const text = truncated.getBoundingClientRect();
							if (text.left < box.left - 1 || text.right > box.right + 1) return true;
							continue;
						}
						const range = document.createRange();
						range.selectNodeContents(node);
						if ([...range.getClientRects()].some((r) => r.left < box.left - 1 || r.right > box.right + 1)) return true;
					}
					return false;
				})
				.map((e) => e.textContent),
			overflowingNotices: [...document.querySelectorAll('[data-slot="alert-description"], [data-slot="alert-title"]')]
				.filter(visible)
				.filter((e) => {
					const box = e.getBoundingClientRect();
					const range = document.createRange();
					range.selectNodeContents(e);
					return [...range.getClientRects()].some((r) => r.left < box.left - 1 || r.right > box.right + 1);
				})
				.map((e) => e.textContent),
			header: [...document.querySelectorAll('[data-slot="dashboard-header-content"]')].map(bounds),
			content: [...document.querySelectorAll('[data-slot="dashboard-content"]')].map(bounds),
			sidebar: [...document.querySelectorAll("aside")].filter(visible).map(bounds),
		};
	});
	expect(metrics.scrollWidth, surface).toBeLessThanOrEqual(width);
	expect(
		metrics.fonts.some((font) => font.includes("Noto")),
		surface,
	).toBe(true);
	expect(metrics.clippedControls, surface).toEqual([]);
	expect(metrics.overflowingNotices, surface).toEqual([]);
	if (width === 390) {
		expect(metrics.touch, surface).toBe(true);
		expect(metrics.smallTouchTargets, surface).toEqual([]);
	}
	for (const group of metrics.groups)
		for (const action of group.actions) {
			expect(action.x, surface).toBeGreaterThanOrEqual(group.field.x);
			expect(action.right, surface).toBeLessThanOrEqual(group.field.right);
			expect(action.height, surface).toBeGreaterThanOrEqual(44);
		}
	for (const modal of metrics.modals) expect(modal.overflow, surface).toBe(false);
	for (const footer of metrics.footers) {
		const heights = footer.buttons.map((b) => b.height);
		if (heights.length) expect(Math.max(...heights) - Math.min(...heights), surface).toBeLessThanOrEqual(1);
		for (const h of heights) expect(h, surface).toBeGreaterThanOrEqual(44);
		if (footer.bodyEnd !== undefined && footer.buttons.length)
			expect(Math.min(...footer.buttons.map((b) => b.y)) - footer.bodyEnd, surface).toBeGreaterThanOrEqual(16);
	}
	const name = `${locale}-${width}-${surface}`;
	await writeFile(info.outputPath(`${name}.json`), JSON.stringify(metrics, null, 2));
	await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled", fullPage: true });
	// The dashboard and long dialogs own scrolling, so document fullPage alone omits their lower controls.
	const scroller = (await modal.count()) ? modal.last() : page.locator("main");
	if (await scroller.count()) {
		const { height, total } = await scroller.evaluate((e) => ({ height: e.clientHeight, total: e.scrollHeight }));
		for (
			let offset = height - 100, index = 1;
			height > 100 && total > height + 10 && offset < total - 10;
			offset += height - 100, index++
		) {
			await scroller.evaluate((e, top) => {
				e.scrollTop = top;
			}, offset);
			await page.screenshot({
				path: info.outputPath(`${name}-scroll-${index}.png`),
				animations: "disabled",
				fullPage: true,
			});
		}
		await scroller.evaluate((e) => {
			e.scrollTop = 0;
		});
	}
}

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test.describe(`${locale} ${width} input mode`, () => {
			test.use({ hasTouch: width === 390 });
			test(`${locale} ${width} pending email addresses wrap within shared notices`, async ({
				authPage: page,
				account,
				baseURL,
			}, info) => {
				if (!baseURL) throw new Error("Missing synthetic runner URL");
				await page.setViewportSize({ width, height: 1024 });
				await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
				await page.goto("/dashboard/settings/account");
				await page.getByRole("button", { name: /Change email address|تغيير البريد الإلكتروني/u }).click();
				const dialog = page.getByRole("dialog");
				await dialog.locator('input[type="email"]').fill(`${"longaddress".repeat(5)}@example.test`);
				await dialog.locator('input[type="password"]').fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog).toHaveCount(0);
				await expect(page.getByText(/^(Confirm at your current email|تأكيد الطلب عبر بريدك الحالي)$/u)).toBeVisible();
				await capture(page, info, "email-pending-long-address", locale, width);
			});

			test(`${locale} ${width} account controls and credential surface inventory`, async ({
				authPage: page,
				account,
				baseURL,
				browser,
			}, info) => {
				test.setTimeout(180000);
				if (!baseURL) throw new Error("Missing synthetic runner URL");
				await page.setViewportSize({ width, height: 1024 });
				await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
				const shot = (surface: string) => capture(page, info, surface, locale, width);
				const en = locale === "en-US";
				const dialog = page.getByRole("dialog");
				const cancel = () => dialog.getByRole("button", { name: /^(Cancel|إلغاء)$/u }).click();
				await page.goto("/dashboard/settings/account");
				await expect(page.getByRole("button", { name: /^(Set up|إعداد)$/u })).toBeVisible();
				await shot("account-profile-security-devices");
				const other = await browser.newContext({ userAgent: "Synthetic audit device" });
				await expect(
					await other.request.post(`${baseURL}/api/auth/sign-in/email`, {
						headers: { origin: baseURL },
						data: { email: account.email, password: account.password },
					}),
				).toBeOK();
				await other.close();
				await page.reload();
				await expect(page.getByText(en ? "Unknown browser" : "متصفح غير معروف", { exact: true })).toBeVisible();
				await shot("connected-other-device");
				await page.route("**/api/rpc/**", (route) =>
					route.request().url().includes("/flags/get") ? route.continue() : route.abort(),
				);
				await page.reload();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("security-unavailable");
				await page.unroute("**/api/rpc/**");
				await page
					.getByRole("button", { name: /^(Try again|حاول مرة أخرى)$/u })
					.first()
					.click();
				await expect(page.getByRole("button", { name: /^(Set up|إعداد)$/u })).toBeVisible();
				const sharp = createRequire(resolve(process.cwd(), "apps/server/package.json"))("sharp");
				const file: Buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#157a68" } })
					.png()
					.toBuffer();
				await page
					.locator('input[type="file"]')
					.setInputFiles({ name: "synthetic-picture.png", mimeType: "image/png", buffer: file });
				await expect(page.locator('[data-slot="avatar-image"]').first()).toBeVisible();
				await shot("profile-picture-uploaded");
				await page.getByRole("button", { name: /^(Remove|إزالة)$/u }).click();
				await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);
				await shot("profile-picture-removed");
				const name = page.getByRole("textbox", { name: en ? "Name" : "الاسم", exact: true });
				await name.fill("");
				await name.blur();
				await shot("profile-field-invalid");
				await name.fill(account.name);
				await name.blur();
				await page.getByRole("button", { name: /^(Change|تغيير)$/u }).click();
				await shot("password-dialog");
				const password = dialog.locator('input[type="password"]').first();
				await password.focus();
				await expect(password).toBeFocused();
				await expect
					.poll(() =>
						password
							.locator('xpath=ancestor::fieldset[@data-slot="input-group"]')
							.evaluate((e) => getComputedStyle(e).boxShadow),
					)
					.not.toBe("none");
				await page.keyboard.press("Tab");
				await expect(
					dialog.getByRole("button", { name: /^(Show password|إظهار كلمة المرور)$/u }).first(),
				).toBeFocused();
				await shot("password-keyboard-focus");
				await password.fill("Unsaved-password-123");
				await dialog.locator('input[name="newPassword"]').fill("Synthetic-new-password-123");
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("password-dialog-error");
				await cancel();
				const discard = page.getByRole("alertdialog");
				await expect(discard).toBeVisible();
				await shot("unsaved-credential-confirm");
				await discard.getByRole("button", { name: /^(Leave|مغادرة)$/u }).click();
				await expect(dialog).toHaveCount(0);
				await page.getByRole("button", { name: /^(Set up|إعداد)$/u }).click();
				await shot("mfa-password");
				await dialog.getByLabel(/^(Password|كلمة المرور)$/u).fill("Wrong-password-123");
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("mfa-password-error");
				await dialog.getByLabel(/^(Password|كلمة المرور)$/u).fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.locator('[data-slot="otp-field-input"]')).toBeVisible();
				await shot("mfa-manual-key-otp");
				await dialog.getByRole("button", { name: /Copy secret|نسخ المفتاح|نسخ السر/u }).click();
				await shot("mfa-key-copied");
				const secret = await dialog.locator("input[readonly]").inputValue();
				await dialog.locator('[data-slot="otp-field-input"]').fill("000000");
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("mfa-code-error");
				await dialog
					.locator('[data-slot="otp-field-input"]')
					.fill(totpCode(`otpauth://totp/MasterCV?secret=${secret.replaceAll(" ", "")}`));
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("button", { name: /^(Download|تنزيل)$/u })).toBeVisible();
				await shot("mfa-backup-codes");
				await dialog.getByRole("button", { name: /^(Continue|استمر)$/u }).click();
				await page.request.post("/api/auth/sign-out", { headers: { origin: baseURL }, data: {} });
				await page.goto("/auth/login");
				await page.locator('input[name="identifier"]').fill(account.email);
				await page.locator('input[name="password"]').fill(account.password);
				await page.locator('button[type="submit"]').click();
				await expect(page).toHaveURL(/verify-2fa/);
				await shot("mfa-login-code");
				await page.goto("/auth/verify-2fa-backup");
				await shot("mfa-login-backup");
				await page.locator('input[name="code"]').fill("wrongwrong");
				await page.locator('button[type="submit"]').click();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("mfa-login-backup-error");
				await page.goto("/auth/verify-2fa");
				await page.locator('[data-slot="otp-field-input"]').fill("000000");
				await page.locator('button[type="submit"]').click();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("mfa-login-code-error");
				await page
					.locator('[data-slot="otp-field-input"]')
					.fill(totpCode(`otpauth://totp/MasterCV?secret=${secret.replaceAll(" ", "")}`));
				await page.locator('button[type="submit"]').click();
				await expect(page).toHaveURL(/dashboard/);
				await page.goto("/dashboard/settings/account");
				await page.getByRole("button", { name: /Change email address|تغيير البريد الإلكتروني/u }).click();
				await expect(dialog.locator('[data-slot="otp-field-input"]')).toBeVisible();
				await shot("email-dialog-with-mfa");
				await cancel();
				await page.goto("/dashboard/settings/privacy");
				await page.getByRole("button", { name: /^(Request a copy of my data|طلب نسخة من بياناتي)$/u }).click();
				await expect(dialog.locator('[data-slot="otp-field-input"]')).toBeVisible();
				await shot("export-proof-with-mfa");
				await cancel();
				await page.goto("/dashboard/settings/account");
				await page.getByRole("button", { name: /^(Turn off|إيقاف)$/u }).click();
				await shot("mfa-disable");
				await dialog.getByLabel(/^(Password|كلمة المرور)$/u).fill("Wrong-password-123");
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("mfa-disable-error");
				await dialog.getByLabel(/^(Password|كلمة المرور)$/u).fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog).toHaveCount(0);
				const cdp = await page.context().newCDPSession(page);
				await cdp.send("WebAuthn.enable");
				await cdp.send("WebAuthn.addVirtualAuthenticator", {
					options: {
						protocol: "ctap2",
						transport: "internal",
						hasResidentKey: true,
						hasUserVerification: true,
						isUserVerified: true,
						automaticPresenceSimulation: true,
					},
				});
				await page.getByRole("button", { name: en ? "Add passkey" : "إضافة مفتاح مرور", exact: true }).click();
				const prompt = page.getByRole("alertdialog");
				await expect(prompt.getByRole("textbox")).toBeVisible();
				await shot("passkey-name-prompt");
				await prompt.getByRole("textbox").fill("Synthetic device");
				await prompt.getByRole("button", { name: /^(Save|حفظ)$/u }).click();
				await expect(prompt).toHaveCount(0);
				await expect(page.getByText("Synthetic device", { exact: true })).toBeVisible();
				await shot("passkey-connected");
				await page.getByRole("button", { name: /^(Rename|إعادة تسمية)$/u }).click();
				await shot("passkey-rename-prompt");
				await prompt.getByRole("button", { name: /^(Cancel|إلغاء)$/u }).click();
				await page.getByRole("button", { name: /^(Remove|إزالة) Synthetic device$/u }).click();
				await shot("passkey-remove-confirm");
				await prompt.getByRole("button", { name: /^(Cancel|إلغاء)$/u }).click();
				await page.goto("/dashboard/settings/privacy");
				await page.getByRole("button", { name: /^(Request a copy of my data|طلب نسخة من بياناتي)$/u }).click();
				await expect(dialog.getByRole("button", { name: /^(Use passkey|استخدام مفتاح مرور)$/u })).toBeVisible();
				await shot("export-proof-with-passkey");
				await cancel();
				await page.goto("/dashboard/settings/account");
				await cdp.detach();
				await page.getByRole("button", { name: /Change email address|تغيير البريد الإلكتروني/u }).click();
				await shot("email-dialog");
				await dialog.locator('input[type="email"]').fill(account.email.replace("@", "_change@"));
				await dialog.locator('input[type="password"]').fill("Wrong-password-123");
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("email-dialog-error");
				await dialog.locator('input[type="password"]').fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog).toHaveCount(0);
				await shot("email-pending-old-address");
				await page.goto(await capturedAuthLink(account.email, "email_change"));
				await shot("email-result-verification-sent");
				await page.goto("/dashboard/settings/account");
				await shot("email-pending-new-address");
				const destination = account.email.replace("@", "_change@");
				await page.goto(await capturedAuthLink(destination, "email_change"));
				await expect(page).toHaveURL(/email-change\?status=complete/);
				account.email = destination;
				await shot("email-result-complete");
				for (const status of ["delivery_failed", "invalid"]) {
					await page.goto(`/email-change?status=${status}`);
					await shot(`email-result-${status}`);
				}
			});

			test(`${locale} ${width} privacy deletion help and trash surface inventory`, async ({
				authPage: page,
				account,
			}, info) => {
				test.setTimeout(180000);
				const fixture = await seedPrivacyAccount(
					{ locale, state: "active", includeQueuedWork: false },
					{ page, password: account.password },
				);
				await page.setViewportSize({ width, height: 1024 });
				const shot = (surface: string) => capture(page, info, surface, locale, width);
				const en = locale === "en-US";
				await page.goto("/dashboard/settings/privacy");
				await expect(
					page.getByRole("button", { name: en ? "Request a copy of my data" : "طلب نسخة من بياناتي", exact: true }),
				).toBeVisible();
				await shot("privacy-export-none");
				await expect(page.locator('[data-slot="accordion-trigger"]')).toHaveCount(4);
				const categories = ["account", "documents", "files", "assistant"];
				for (const [index, trigger] of (await page.locator('[data-slot="accordion-trigger"]').all()).entries()) {
					await trigger.click();
					await shot(`privacy-storage-${categories[index]}`);
				}
				await page
					.getByRole("button", { name: en ? "Request a copy of my data" : "طلب نسخة من بياناتي", exact: true })
					.click();
				const dialog = page.getByRole("dialog");
				await expect(dialog.locator('input[type="password"]')).toBeVisible();
				await shot("export-proof");
				await dialog.locator('input[type="password"]').fill("Wrong-password-123");
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("export-proof-error");
				await dialog.locator('input[type="password"]').fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(page.getByRole("link", { name: en ? "Download copy" : "تنزيل النسخة", exact: true })).toBeVisible({
					timeout: 30000,
				});
				await shot("privacy-export-ready");
				for (const status of ["queued", "preparing", "failed", "expired", "cancelled"]) {
					await privacyDatabase(async (pool) => {
						await pool.query("UPDATE account_data_export SET status=$1 WHERE user_id=$2", [status, fixture.userId]);
					});
					await page.reload();
					await expect(page.locator('#data-export [role="status"]')).toBeVisible();
					await shot(`privacy-export-${status}`);
				}
				await privacyDatabase(async (pool) => {
					await pool.query("UPDATE resume SET trashed_at=now()-interval '28 days' WHERE id=$1", [fixture.documentId]);
				});
				await page.goto("/dashboard/trash");
				const row = page.getByRole("row", { name: "Synthetic lifecycle CV", exact: true });
				await expect(row).toBeVisible();
				const trashLink = page.locator('aside a[href="/dashboard/trash"]');
				if (width === 1440) {
					await expect(trashLink).toBeVisible();
					await expect(trashLink).toHaveAttribute("aria-current", "page");
					await expect(trashLink.locator('[data-slot="sidebar-count-badge"]')).toHaveText("1");
				}
				await shot("trash-populated");
				await row.getByRole("button", { name: en ? "Delete forever" : "حذف نهائي", exact: true }).click();
				await shot("trash-single-confirm");
				await page
					.getByRole("alertdialog")
					.getByRole("button", { name: en ? "Keep in Trash" : "احتفظ بها في سلة المهملات", exact: true })
					.click();
				await row.getByRole("checkbox").check();
				await page
					.getByRole("button", { name: en ? "Delete selected forever" : "حذف المحدد نهائيًا", exact: true })
					.click();
				await shot("trash-selected-confirm");
				await page
					.getByRole("alertdialog")
					.getByRole("button", { name: en ? "Keep in Trash" : "احتفظ بها في سلة المهملات", exact: true })
					.click();
				await page.getByRole("button", { name: en ? "Empty trash" : "إفراغ سلة المهملات", exact: true }).click();
				await shot("trash-empty-confirm");
				await page
					.getByRole("alertdialog")
					.getByRole("button", { name: en ? "Keep in Trash" : "احتفظ بها في سلة المهملات", exact: true })
					.click();
				await row.getByRole("button", { name: en ? "Restore" : "استعادة", exact: true }).click();
				await expect(row).toHaveCount(0);
				if (width === 1440) {
					await expect(trashLink).toBeVisible();
					await expect(trashLink).toHaveAttribute("aria-current", "page");
					await expect(trashLink.locator('[data-slot="badge"]')).toHaveCount(0);
				}
				await shot("trash-empty");
				await page.goto("/help");
				const subjects = page.getByRole("radio");
				await expect(subjects).toHaveCount(4);
				// The enclosing shared label supplies the radio's 44px target; verify its outer edge activates it.
				await subjects
					.last()
					.locator("xpath=ancestor::label[1]")
					.click({ position: { x: 2, y: 2 } });
				await expect(subjects.last()).toBeChecked();
				await subjects
					.first()
					.locator("xpath=ancestor::label[1]")
					.click({ position: { x: 2, y: 2 } });
				await expect(subjects.first()).toBeChecked();
				await shot("help-intake");
				await expect(page.locator("#help-email")).toHaveCount(0);
				await expect(page.locator("main")).toContainText(account.email);
				await page
					.getByRole("textbox", { name: /^(Your message|رسالتك)$/u })
					.fill("Synthetic consistency audit support request.");
				await page.route("**/api/rpc/**", (route) => route.abort());
				await page.locator('button[type="submit"]').click();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("help-intake-error");
				await page.unroute("**/api/rpc/**");
				await page.locator('button[type="submit"]').click();
				await expect(
					page.getByRole("button", { name: en ? "Send another message" : "إرسال رسالة أخرى", exact: true }),
				).toBeVisible();
				await shot("help-receipt");
				await page.goto("/dashboard/settings/delete-account");
				await shot("deletion-review");
				await page.getByRole("button", { name: en ? "Confirm access" : "تأكيد الوصول", exact: true }).click();
				await expect(dialog.locator('input[type="password"]')).toBeVisible();
				await shot("deletion-proof");
				await dialog.locator('input[type="password"]').fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog).toHaveCount(0);
				await page.getByRole("checkbox").check();
				await shot("deletion-confirmed");
				await page
					.getByRole("button", { name: en ? "Permanently delete my account" : "حذف حسابي نهائيًا", exact: true })
					.click();
				await expect(page).toHaveURL(/deletion-requested/);
				await shot("deletion-receipt");
			});

			test(`${locale} ${width} recovery notice surface inventory`, async ({
				authPage: page,
				account,
				baseURL,
			}, info) => {
				test.setTimeout(120000);
				if (!baseURL) throw new Error("Missing synthetic runner URL");
				await page.setViewportSize({ width, height: 1024 });
				await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
				const shot = (surface: string) => capture(page, info, surface, locale, width);
				const retry = () =>
					page
						.getByRole("button", { name: /^(Try again|حاول مرة أخرى)$/u })
						.first()
						.click();
				const dialog = page.getByRole("dialog");
				await page.route("**/api/rpc/**", (route) =>
					route.request().url().includes("/flags/get") ? route.continue() : route.abort(),
				);
				await page.goto("/dashboard/settings/account");
				await expect(page.getByRole("alert")).toBeVisible();
				await page.getByRole("button", { name: /Change email address|تغيير البريد الإلكتروني/u }).click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("email-methods-unavailable");
				await dialog.getByRole("button", { name: /^(Cancel|إلغاء)$/u }).click();
				await page.goto("/dashboard/settings/privacy");
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("export-status-unavailable");
				await page.unroute("**/api/rpc/**");
				await retry();
				await expect(
					page.getByRole("button", { name: /^(Request a copy of my data|طلب نسخة من بياناتي)$/u }),
				).toBeVisible();
				await page.route("**/api/rpc/**", (route) =>
					route.request().url().includes("/flags/get") ? route.continue() : route.abort(),
				);
				await page.getByRole("button", { name: /^(Request a copy of my data|طلب نسخة من بياناتي)$/u }).click();
				await expect(dialog.getByRole("alert")).toBeVisible();
				await shot("proof-challenge-unavailable");
				await page.unroute("**/api/rpc/**");
				await dialog.getByRole("button", { name: /^(Try again|حاول مرة أخرى)$/u }).click();
				await expect(dialog.locator('input[type="password"]')).toBeVisible();
				await page.route("**/api/rpc/privacy/requestExport", (route) =>
					route.request().url().includes("/flags/get") ? route.continue() : route.abort(),
				);
				await dialog.locator('input[type="password"]').fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog).toHaveCount(0);
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("export-request-unconfirmed");
				await page.unroute("**/api/rpc/privacy/requestExport");
				await page.route("**/api/rpc/**", (route) =>
					route.request().url().includes("/flags/get") ? route.continue() : route.abort(),
				);
				await page.goto("/dashboard/settings/delete-account");
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("deletion-counts-unavailable");
				await page.goto("/dashboard/trash");
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("trash-load-error");
				await page.unroute("**/api/rpc/**");
				await retry();
				await expect(page.getByRole("alert")).toHaveCount(0);
				await shot("trash-load-recovered");
			});

			test(`${locale} ${width} account action feedback inventory`, async ({
				authPage: page,
				account,
				baseURL,
				browser,
			}, info) => {
				test.setTimeout(120000);
				if (!baseURL) throw new Error("Missing synthetic runner URL");
				await page.setViewportSize({ width, height: 1024 });
				await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
				const shot = (surface: string) => capture(page, info, surface, locale, width);
				await page.goto("/dashboard/settings/account");
				const name = page.getByRole("textbox", { name: locale === "en-US" ? "Name" : "الاسم", exact: true });
				await name.fill("Synthetic updated name");
				await name.blur();
				await expect(name).toHaveValue("Synthetic updated name");
				await expect(page.locator('[data-slot="form-item"]').filter({ has: name }).getByRole("status")).toBeVisible();
				await shot("profile-field-saved");
				await page.route("**/api/auth/update-user", (route) => route.abort());
				await name.fill("Unsent synthetic name");
				await name.blur();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("profile-field-save-error");
				await page.unroute("**/api/auth/update-user");
				await page.reload();
				await page.locator('input[type="file"]').setInputFiles({
					name: "invalid-synthetic.png",
					mimeType: "image/png",
					buffer: Buffer.from("Synthetic invalid image fixture"),
				});
				await expect(page.locator('[data-slot="toast"]')).toBeVisible();
				await shot("profile-picture-error");
				const other = await browser.newContext({ userAgent: "Synthetic audit device" });
				await expect(
					await other.request.post(`${baseURL}/api/auth/sign-in/email`, {
						headers: { origin: baseURL },
						data: { email: account.email, password: account.password },
					}),
				).toBeOK();
				await other.close();
				await page.reload();
				await page.route("**/api/rpc/privacy/revokeSessions", (route) => route.abort());
				await page
					.getByRole("button", { name: /^(Sign out of all other devices|تسجيل الخروج من جميع الأجهزة الأخرى)$/u })
					.click();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("device-signout-error");
				await page.unroute("**/api/rpc/privacy/revokeSessions");
				await page.getByRole("button", { name: /^(Try again|حاول مرة أخرى)$/u }).click();
				await page
					.getByRole("button", { name: /^(Sign out of all other devices|تسجيل الخروج من جميع الأجهزة الأخرى)$/u })
					.click();
				await expect(page.getByText(/^(Other device|جهاز آخر)$/u)).toHaveCount(0);
				await shot("devices-signed-out");
				await page.route("**/api/auth/passkey/list-user-passkeys", (route) => route.abort());
				await page.reload();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("passkeys-unavailable");
				await page.unroute("**/api/auth/passkey/list-user-passkeys");
				await page.reload();
				await page.getByRole("button", { name: /Change email address|تغيير البريد الإلكتروني/u }).click();
				const dialog = page.getByRole("dialog");
				await dialog.locator('input[type="email"]').fill(account.email.replace("@", "_pending@"));
				await dialog.locator('input[type="password"]').fill(account.password);
				await dialog.locator('button[type="submit"]').click();
				await expect(dialog).toHaveCount(0);
				await page.route("**/api/rpc/privacy/resendEmailChange", (route) => route.abort());
				await page.getByRole("button", { name: /^(Resend|إعادة الإرسال)$/u }).click();
				await expect(page.getByRole("alert")).toBeVisible();
				await shot("email-resend-error");
			});
		});
