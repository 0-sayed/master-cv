import { expect, test } from "../fixtures/test";

for (const width of [320, 1440]) {
	test(`Arabic navigation and account menu use approved shared wording at ${width}px`, async ({ authPage: page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/dashboard/settings/preferences?locale=ar-SA");
		const navigation = page.locator('nav:has(a[href="/dashboard/career"])');
		await expect(navigation.getByRole("link", { name: "المستندات", exact: true })).toBeVisible();
		await expect(navigation.getByRole("link", { name: "متابعة التقديمات", exact: true })).toBeVisible();
		if (width === 1440) {
			await page
				.getByRole("complementary")
				.getByRole("button", { name: /E2E Test User/ })
				.click();
			await expect(page.getByRole("menuitem", { name: "تسجيل الخروج", exact: true })).toBeVisible();
		}
	});
}

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const theme of ["light", "dark"] as const) {
		test(`${locale} ${theme} preferences use deck wording at 320px`, async ({ authPage: page, baseURL }) => {
			await page.context().addCookies([{ name: "theme", value: theme, url: baseURL ?? "http://localhost:3000" }]);
			await page.setViewportSize({ width: 320, height: 900 });
			await page.goto(`/dashboard/settings/preferences?locale=${locale}`);
			const arabic = locale === "ar-SA";
			await expect(page.getByRole("heading", { name: arabic ? "المظهر" : "Appearance", exact: true })).toBeVisible();
			await expect(page.getByRole("radio", { name: arabic ? "فاتح" : "Light", exact: true })).toBeAttached();
			await expect(page.getByRole("radio", { name: arabic ? "داكن" : "Dark", exact: true })).toBeAttached();
			const system = page.getByRole("radio", { name: arabic ? "حسب إعدادات الجهاز" : "Match my device", exact: true });
			await expect(system).toBeAttached();
			await expect(
				page.getByRole("heading", { name: arabic ? "لغة الواجهة" : "Interface language", exact: true }),
			).toBeVisible();
			await expect(
				page.getByText(
					arabic
						? "تغيير لغة الواجهة لا يترجم سيرك ولا يغيّر محتواها."
						: "Changing the interface language never translates or changes your CVs.",
					{ exact: false },
				),
			).toBeVisible();
			await page.evaluate(() => document.fonts.ready);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			const fits = await system.evaluate((input) => {
				const label = input.closest("label");
				if (!label) return false;
				return label.scrollHeight <= label.clientHeight && label.scrollWidth <= label.clientWidth;
			});
			expect(fits).toBe(true);
		});
	}
}
