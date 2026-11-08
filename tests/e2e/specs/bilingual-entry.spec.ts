import { expect, test } from "../fixtures/test";

for (const path of ["/", "/auth/login"]) {
	for (const locale of ["ar-SA", "en-US"] as const) {
		for (const width of [390, 1440]) {
			for (const theme of ["light", "dark"] as const) {
				test(`${path} ${locale} ${theme} at ${width}px`, async ({ page, baseURL }, testInfo) => {
					await page.context().addCookies([{ name: "theme", value: theme, url: baseURL ?? "http://localhost:3000" }]);
					await page.emulateMedia({ reducedMotion: "reduce" });
					await page.setViewportSize({ width, height: 900 });
					await page.goto(`${path}?locale=${locale}`);
					await expect(page.locator("html")).toHaveAttribute("lang", locale);
					await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
					await expect(page.getByRole("heading").first()).toBeVisible();
					const family = locale === "ar-SA" ? "Noto Sans Arabic" : "Noto Sans";
					expect(
						await page.evaluate(
							async (family) =>
								(await document.fonts.load(`400 16px "${family}"`, family === "Noto Sans Arabic" ? "سيرة" : "Resume"))
									.length,
							family,
						),
					).toBeGreaterThan(0);
					expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
					const trigger = page
						.getByRole("button", {
							name: locale === "ar-SA" ? "تغيير الواجهة إلى الإنجليزية" : "Switch interface to Arabic",
						})
						.first();
					await expect(trigger).toBeVisible();
					expect(
						await trigger.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration)),
					).toBeLessThanOrEqual(0.001);
					await page.screenshot({ path: testInfo.outputPath("entry.png"), fullPage: true });
				});
			}
		}
	}
}
