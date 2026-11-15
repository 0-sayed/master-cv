import { expect, test } from "../fixtures/test";

for (const width of [320, 1440]) {
	test(`Arabic navigation and account menu use approved shared wording at ${width}px`, async ({ authPage: page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/dashboard/settings/preferences?locale=ar-SA");
		const navigation = page.locator('nav:has(a[href="/dashboard/career/information"])');
		await expect(
			navigation.getByRole("link", { name: width === 1440 ? "مستنداتي" : "المستندات", exact: true }),
		).toBeVisible();
		await expect(navigation.getByRole("link", { name: "طلبات التقديم", exact: true })).toBeVisible();
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
			await expect(page.getByText(arabic ? "المظهر" : "Appearance", { exact: true })).toBeVisible();
			await expect(page.getByRole("radio", { name: arabic ? "فاتح" : "Light", exact: true })).toBeAttached();
			await expect(page.getByRole("radio", { name: arabic ? "داكن" : "Dark", exact: true })).toBeAttached();
			const system = page.getByRole("radio", { name: arabic ? "النظام" : "System", exact: true });
			await expect(system).toBeAttached();
			await expect(page.getByText(arabic ? "لغة الواجهة" : "Interface language", { exact: true })).toBeVisible();
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
			for (const radio of await page.getByRole("radio").all()) {
				const fit = await radio.evaluate((label) => {
					const control = label.closest('[data-slot="segmented-control"]');
					if (!control) throw new Error("Theme segmented control missing");
					const surface = control.getBoundingClientRect();
					const option = label.getBoundingClientRect();
					const range = document.createRange();
					range.selectNodeContents(label);
					// Arabic glyphs extend beyond the line box into the shared track's reserved inset.
					return [...range.getClientRects()].every(
						(text) =>
							text.left >= option.left &&
							text.right <= option.right &&
							text.top >= surface.top &&
							text.bottom <= surface.bottom,
					);
				});
				expect(fit, await radio.innerText()).toBe(true);
			}
			const deviceTimezone = page.getByRole("button", {
				name: /Use this device's timezone|استخدم المنطقة الزمنية لهذا الجهاز/u,
			});
			expect(
				await deviceTimezone.evaluate((button) => {
					const card = button.closest("section");
					if (!card) throw new Error("Preferences card missing");
					const bounds = card.getBoundingClientRect();
					const range = document.createRange();
					range.selectNodeContents(button);
					return [...range.getClientRects()].every((text) => text.left >= bounds.left && text.right <= bounds.right);
				}),
			).toBe(true);
		});
	}
}
