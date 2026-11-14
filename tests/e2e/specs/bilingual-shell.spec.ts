import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [320, 390, 768, 1440]) {
		for (const theme of ["light", "dark"] as const) {
			test(`${locale} ${theme} shell at ${width}px`, async ({ authPage, baseURL }, testInfo) => {
				await authPage.context().addCookies([{ name: "theme", value: theme, url: baseURL ?? "http://localhost:3000" }]);
				await authPage.setViewportSize({ width, height: 900 });
				await authPage.goto(`/dashboard/settings/preferences?locale=${locale}`);
				await expect(authPage.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				await expect(authPage.locator("main")).toBeVisible();
				await authPage.evaluate(async () => {
					await document.fonts.ready;
				});
				await expect(authPage.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/);
				expect(await authPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				if (width < 640) {
					const nav = authPage.locator('nav:has(a[href="/dashboard/career/information"])');
					await expect(nav.locator("a")).toHaveCount(4);
					await expect(nav.locator("button")).toHaveCount(0);
					await expect(authPage.locator('button[aria-keyshortcuts="N"]')).toHaveCount(0);
					// Creation stays available through the shortcut, without an unrelated settings action.
					await authPage.keyboard.press("n");
					await expect(authPage.getByRole("dialog")).toBeVisible();
					await authPage.keyboard.press("Escape");
					await expect(authPage.getByRole("dialog")).not.toBeVisible();
				} else if (width >= 1024) {
					const aside = await authPage.getByRole("complementary").boundingBox();
					const canvas = await authPage.locator(".dashboard-shell").boundingBox();
					if (!aside || !canvas) throw new Error("Dashboard navigation or canvas missing");
					expect(aside?.width).toBe(236);
					// Navigation stays on the canvas edge with normal browser scrolling.
					expect(aside.x).toBe(locale === "ar-SA" ? canvas.x + canvas.width - aside.width : canvas.x);
				}
				const family = locale === "ar-SA" ? "Noto Sans Arabic" : "Noto Sans";
				expect(
					await authPage.evaluate(
						async (family) =>
							(await document.fonts.load(`400 16px "${family}"`, family === "Noto Sans Arabic" ? "سيرة" : "Resume"))
								.length,
						family,
					),
				).toBeGreaterThan(0);
				await authPage.screenshot({ path: testInfo.outputPath("shell.png"), fullPage: true });
			});
		}
	}
}
