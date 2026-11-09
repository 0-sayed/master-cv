import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const windowWidth of [780, 1440]) {
		test(`${locale} shell remains operable at real 200% browser zoom in a ${windowWidth}px window`, async ({
			authPage,
			baseURL,
		}, testInfo) => {
			const profile = await mkdtemp(join(tmpdir(), "master-cv-zoom-"));
			const context = await chromium.launchPersistentContext(profile, {
				// Browser settings require full Chromium; the headless shell has no settings page.
				channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium",
				headless: true,
				viewport: null,
				// Clear the test runner's desktop preset so it cannot mask Chrome's real zoom ratio.
				deviceScaleFactor: undefined,
				args: [`--window-size=${windowWidth},1100`],
			});
			try {
				await context.addCookies(await authPage.context().cookies());
				const page = await context.newPage();
				// Change Chrome's browser zoom through its settings API, not CSS zoom or pinch emulation.
				await page.goto("chrome://settings/appearance");
				await page.evaluate(async () => {
					const settings = (
						globalThis as typeof globalThis & {
							chrome: { settingsPrivate: { setDefaultZoom: (zoom: number, done: () => void) => void } };
						}
					).chrome.settingsPrivate;
					await new Promise<void>((resolve) => settings.setDefaultZoom(2, resolve));
				});
				await page.goto(`${baseURL}/dashboard/settings/preferences?locale=${locale}`);
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await page.evaluate(() => document.fonts.ready);
				const metrics = await page.evaluate(() => ({
					width: innerWidth,
					outerWidth,
					dpr: devicePixelRatio,
					cssZoom: getComputedStyle(document.body).zoom,
					pinchScale: visualViewport?.scale,
					overflows: document.documentElement.scrollWidth > innerWidth,
				}));
				expect(metrics.width).toBe(windowWidth / 2);
				expect(metrics.outerWidth).toBe(windowWidth);
				expect(metrics.dpr).toBe(2);
				expect(metrics.cssZoom).toBe("1");
				expect(metrics.pinchScale).toBe(1);
				expect(metrics.overflows).toBe(false);
				const navigation = page.locator('nav:has(a[href="/dashboard/career/information"])');
				await expect(navigation.locator("a")).toHaveCount(4);
				if (windowWidth === 780) {
					const labelsFit = await navigation.locator("a").evaluateAll((links) =>
						links.every((link) => {
							const label = link.querySelector("span.type-mobile-nav");
							if (!label) return false;
							return label.getBoundingClientRect().width <= link.getBoundingClientRect().width;
						}),
					);
					expect(labelsFit).toBe(true);
				}
				await page.keyboard.press("Tab");
				await expect(page.locator('a[href="#main-content"]')).toBeFocused();
				await page.keyboard.press("Enter");
				await expect(page.locator("#main-content")).toBeInViewport();
				const dark = page.getByRole("radio", { name: locale === "ar-SA" ? "داكن" : "Dark", exact: true });
				await dark.focus();
				await page.keyboard.press("Space");
				await expect(dark).toBeChecked();
				await expect(page.locator("html")).toHaveClass(/dark/);
				// Playwright's CSS-sized screenshot clips real browser-zoom output; capture the physical viewport.
				const cdp = await context.newCDPSession(page);
				const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
				await writeFile(testInfo.outputPath("browser-zoom-200.png"), Buffer.from(screenshot.data, "base64"));
			} finally {
				await context.close();
				await rm(profile, { recursive: true, force: true });
			}
		});
	}
}
