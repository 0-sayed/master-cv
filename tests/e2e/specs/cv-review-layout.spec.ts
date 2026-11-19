import { detectReviewPage } from "../fixtures/review-detector";
import { seedReview, openReview } from "../fixtures/reviewable-ai";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`review layout ${locale} ${width}`, async ({ authPage: page }, testInfo) => {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
			await seedReview(page, testInfo, locale);
			for (const tab of ["ats", "writing", "ai"] as const) {
				await openReview(page, width, tab);
				await settleScreen(page);
				const panel = page.getByRole("region", { name: locale === "ar-SA" ? "ملاحظات المراجعة" : "Review findings" });
				await expect(panel).toBeVisible();
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
				const tabs = panel.getByRole("tablist").first();
				await expect(tabs.getByRole("tab").nth(0)).toContainText(locale === "ar-SA" ? "فحص ATS" : "ATS check");
				await expect(tabs.getByRole("tab").nth(1)).toContainText(locale === "ar-SA" ? "فحص البيانات" : "Data check");
				const bounds = await tabs.boundingBox();
				if (!bounds) throw new Error("Review tabs have no bounds");
				for (const trigger of await tabs.getByRole("tab").all()) {
					const box = await trigger.boundingBox();
					if (!box) throw new Error("Review tab has no bounds");
					expect(box.y).toBeCloseTo(bounds.y, 0);
					expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
					expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
				}
				expect(await tabs.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
				for (const trigger of await tabs.getByRole("tab").all()) {
					expect(await trigger.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
				}
				await page.screenshot({ path: testInfo.outputPath(`review-${locale}-${width}-${tab}.png`) });
			}
			await page.emulateMedia({ colorScheme: "dark" });
			await openReview(page, width, "ats");
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath(`review-dark-${locale}-${width}.png`) });
		});

// This separate target requires an explicit deep browser run. The unattended speed tier does not run it.
test("authenticated review overlay evidence", async ({ authPage: page }, testInfo) => {
	await seedReview(page, testInfo);
	await openReview(page, 1440, "ats");
	await detectReviewPage(page, testInfo);
});
