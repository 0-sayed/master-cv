import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

const evidence = process.env.E2E_PUBLIC_EVIDENCE_DIR;

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width}: parent navigation mirrors once and board selection stays usable`, async ({
			authPage: page,
		}, info) => {
			const origin = "http://localhost:3030";
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.context().addCookies([{ name: "locale", value: locale, url: origin }]);
			await page.goto("/dashboard/applications");
			const session = await (await page.request.get("/api/auth/get-session")).json();
			const originalLocale = session.user.uiLocale;
			await expect(
				await page.request.post("/api/auth/update-user", { headers: { origin }, data: { uiLocale: locale } }),
			).toBeOK();
			const api = variantClient(page);
			const id = await api.applications.create({
				company: `Synthetic Navigation ${locale} ${width}`,
				role: "Navigation Engineer",
				notes: "ملاحظة يدوية / Manual note",
			});
			const folder = evidence ?? info.outputDir;
			const boardFolder = join(folder, "board-ux");
			const backFolder = join(folder, "back-nav");
			await mkdir(boardFolder, { recursive: true });
			await mkdir(backFolder, { recursive: true });
			const capture = async (name: string, back = false) => {
				await settleScreen(page);
				await page.screenshot({
					path: join(back ? backFolder : boardFolder, `${name}-${locale}-${width}.png`),
					fullPage: true,
				});
			};
			try {
				await page.goto("/dashboard/applications?view=board");
				const card = page.getByRole("button", {
					name: new RegExp(`^Navigation Engineer.*Synthetic Navigation ${locale} ${width}`, "u"),
				});
				await expect(card).toBeVisible();
				await capture("board");
				await card.click();
				await expect(page).toHaveURL(new RegExp(`/dashboard/applications/${id}$`, "u"));
				await page.reload();
				await expect(page.getByRole("heading", { name: "Navigation Engineer", exact: true })).toBeVisible();
				await expect(page.getByRole("dialog")).toHaveCount(0);
				await expect(page.locator("#application-activity")).toBeVisible();
				const columns = page.locator('[data-slot="application-detail-columns"]');
				expect(await columns.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(
					width === 390 ? 1 : 2,
				);
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
				const back = page.getByRole("link", {
					name: locale === "ar-SA" ? "العودة إلى الطلبات" : "Back to applications",
				});
				await expect(back).toHaveAttribute("href", "/dashboard/applications");
				const icon = back.locator('[data-slot="icon"]');
				const geometry = await back.evaluate((el) => {
					const glyph = el.querySelector('[data-slot="icon"]');
					const text = el.querySelector("span:not([data-slot])");
					if (!glyph || !text) throw new Error("Back navigation needs an icon and a label");
					return {
						scale: getComputedStyle(glyph).scale,
						rotate: getComputedStyle(glyph).rotate,
						icon: glyph.getBoundingClientRect().x,
						text: text.getBoundingClientRect().x,
						height: el.getBoundingClientRect().height,
					};
				});
				expect(geometry.scale).toBe(locale === "ar-SA" ? "-1 1" : "none");
				expect(geometry.rotate).toBe("none");
				expect(locale === "ar-SA" ? geometry.icon > geometry.text : geometry.icon < geometry.text).toBe(true);
				expect(geometry.height).toBeGreaterThanOrEqual(44);
				await expect(icon).toHaveAttribute("aria-hidden", "true");
				await capture("details");
				if (width === 390) {
					await page.locator("#application-activity").scrollIntoViewIfNeeded();
					await capture("details-continuation");
				}
				await page.keyboard.press("Tab");
				await back.focus();
				await expect(back).toBeFocused();
				expect(await back.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
				await capture("details-focus", true);
				await page.keyboard.press("Enter");
				await expect(page).toHaveURL(/\/dashboard\/applications$/u);
				await page
					.getByRole("checkbox", {
						name: new RegExp(`Navigation Engineer.*Synthetic Navigation ${locale} ${width}`, "u"),
					})
					.click();
				const toolbar = page.getByRole("toolbar", {
					name: locale === "ar-SA" ? "الطلبات المحددة" : "Selected applications",
				});
				await expect(toolbar).toHaveCSS("position", "fixed");
				const bounds = await toolbar.boundingBox();
				expect(bounds).not.toBeNull();
				if (!bounds) throw new Error("Selection toolbar needs visible bounds");
				expect(bounds.x).toBeGreaterThanOrEqual(0);
				expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
				expect(bounds.y + bounds.height).toBeLessThan(width === 390 ? 780 : 1024);
				await capture("selection");
				const clear = toolbar.getByRole("button", { name: locale === "ar-SA" ? "إلغاء التحديد" : "Clear selection" });
				await clear.focus();
				await page.keyboard.press("Enter");
				await expect(toolbar).toHaveCount(0);
				await page.goto(`/dashboard/applications?applicationId=${id}`);
				await expect(page).toHaveURL(new RegExp(`/dashboard/applications/${id}$`, "u"));
				await page.goto("/dashboard/applications/missing-navigation-record");
				await expect(page.getByRole("alert")).toBeVisible();
				await expect(back).toHaveAttribute("href", "/dashboard/applications");
				await capture("details-recovery", true);
				await page.goto("/dashboard/trash");
				const documentsBack = page.locator('[data-slot="back-navigation"]');
				await expect(documentsBack).toHaveAttribute("href", "/dashboard");
				await capture("trash", true);
				await page.goto("/auth/forgot-password");
				await expect(page.locator('[data-slot="back-navigation"]')).toHaveAttribute("href", "/auth/login");
				await capture("password-recovery", true);
			} finally {
				await api.applications.delete({ id });
				await page.request.post("/api/auth/update-user", { headers: { origin }, data: { uiLocale: originalLocale } });
			}
		});
	}
}
