import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const width of [1280, 1440]) {
	test(`approved Arabic navigation, actions and toolbar labels fit at ${width}px`, async ({
		authPage: page,
		baseURL,
	}) => {
		await page.setViewportSize({ width, height: 1024 });
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3000" },
				data: { uiLocale: "ar-SA" },
			}),
		).toBeOK();
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Arabic wording fit", tags: [], withSampleData: false },
			}),
		).toBeOK();
		for (const route of [
			"/dashboard",
			"/dashboard/applications",
			"/dashboard/career/information",
			"/dashboard/settings",
		]) {
			await page.goto(`${route}?locale=ar-SA`);
			await settleScreen(page);
			await expect(page.locator('aside a[href="/dashboard/applications"]')).toHaveAccessibleName("طلبات التقديم");
			if (route === "/dashboard/applications") {
				await expect(page.locator("main h1")).toHaveText("طلبات التقديم");
				await expect(page).toHaveTitle("طلبات التقديم — Master CV");
			}
			await expect(
				page.getByRole("button", { name: /^(?:يشارك|يتجاهل|يحسن|يرفض|يستبدل|يعرض|يتغير|يمسح|يصدر|يحفظ|يضيف)$/u }),
			).toHaveCount(0);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			const clipped = await page
				.locator('[data-slot="page-toolbar"]')
				.evaluateAll((toolbars) =>
					toolbars.flatMap((toolbar) =>
						[...toolbar.querySelectorAll("button, select")]
							.filter(
								(element) => element.getBoundingClientRect().width > 0 && element.scrollWidth > element.clientWidth,
							)
							.map((element) => element.textContent),
					),
				);
			expect(clipped).toEqual([]);
		}
		await page.goto("/dashboard?locale=ar-SA");
		await page.getByRole("button", { name: "جديد", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("button", { name: /^البدء بسيرة فارغة/u })).toBeVisible();
		expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	});
}
