import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} shell brand shares navigation column and toolbar centre`, async ({
			authPage: page,
			baseURL,
		}, info) => {
			test.setTimeout(120_000);
			await expect(
				await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
			).toBeOK();
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.goto("/dashboard");
			await settleScreen(page);
			for (const collapsed of width === 1440 ? [false, true] : [false]) {
				for (const theme of ["light", "dark"]) {
					await page.context().addCookies([{ name: "theme", value: theme, url: baseURL ?? "http://localhost:3030" }]);
					for (const route of ["/dashboard", "/dashboard/career/information"]) {
						await page.goto(route);
						await settleScreen(page);
						const sidebar = page.getByRole("complementary");
						const header = page.locator('header:has(> [data-slot="dashboard-header-content"])');
						const mark = (width === 1440 ? sidebar : header).locator('[data-slot="brand-mark"]');
						const nav =
							width === 1440
								? sidebar.locator('a[href="/dashboard"] svg')
								: page.locator('[data-slot="app-bottom-nav"] a[href="/dashboard/career/information"] svg').first();
						const markBox = await mark.boundingBox();
						const navBox = await nav.boundingBox();
						if (!markBox || !navBox) throw new Error("Missing shell brand or navigation icon");
						if (width === 1440 && !collapsed) {
							const row = await sidebar.locator(".shell-brand-row").boundingBox();
							const toggle = await sidebar.locator('[data-slot="sidebar-toggle"]').boundingBox();
							if (!row || !toggle) throw new Error("Missing sidebar brand row or panel toggle");
							expect.soft(markBox.x).toBeGreaterThanOrEqual(row.x);
							expect.soft(markBox.x + markBox.width).toBeLessThanOrEqual(row.x + row.width);
							expect
								.soft(locale === "ar-SA" ? toggle.x + toggle.width <= markBox.x : markBox.x + markBox.width <= toggle.x)
								.toBe(true);
						} else {
							expect
								.soft(Math.abs(markBox.x + markBox.width / 2 - navBox.x - navBox.width / 2))
								.toBeLessThanOrEqual(0.5);
						}
						for (const control of await header.locator("button:visible").all()) {
							const box = await control.boundingBox();
							if (!box) throw new Error("Missing header control");
							expect.soft(Math.abs(markBox.y + markBox.height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(0.5);
						}
						expect(markBox.width).toBe(markBox.height);
						expect(await page.locator("html").evaluate((element) => element.scrollWidth <= innerWidth)).toBe(true);
						await page.screenshot({
							path: info.outputPath(
								`${route.endsWith("information") ? "career" : "documents"}-${theme}-${collapsed ? "rail" : "expanded"}.png`,
							),
						});
					}
				}
				if (width === 1440 && !collapsed) await page.locator('[data-slot="sidebar-toggle"]').click();
			}
		});
	}

	test(`${locale} public and auth brand slots share their controls' centre`, async ({ page, context, baseURL }) => {
		await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 844 });
			for (const path of ["/", "/auth/login"]) {
				await page.goto(path);
				await settleScreen(page);
				const header = page.locator("header").first();
				const brand = header.locator('a:has([data-slot="brand-mark"]:visible)').first();
				const mark = brand.locator('[data-slot="brand-mark"]:visible');
				const brandBox = await brand.boundingBox();
				const markBox = await mark.boundingBox();
				if (!brandBox || !markBox) throw new Error("Missing public/auth brand");
				for (const control of await header.locator("button:visible").all()) {
					const bounds = await control.boundingBox();
					if (!bounds) throw new Error("Missing public/auth control");
					expect(Math.abs(brandBox.y + brandBox.height / 2 - bounds.y - bounds.height / 2)).toBeLessThanOrEqual(0.5);
				}
				await expect(mark).toHaveAttribute("data-once", "true");
				await expect(mark).toHaveAttribute("data-playing", "false");
				await mark.hover();
				await expect(mark).toHaveAttribute("data-playing", "false");
				expect(await mark.boundingBox()).toEqual(markBox);
				await expect(mark).toHaveAttribute("data-playing", "false");
				expect(await mark.boundingBox()).toEqual(markBox);
			}
		}
	});
}
