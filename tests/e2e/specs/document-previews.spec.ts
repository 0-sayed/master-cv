import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} compact empty preview contains its icon and label`, async ({ authPage: page }) => {
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Compact empty CV", tags: [], withSampleData: false },
			}),
		).toBeOK();
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/dashboard?locale=${locale}`);
		const placeholder = page.locator('[data-slot="preview-placeholder"]');
		await expect(placeholder).toContainText(locale === "ar-SA" ? "سيرة فارغة" : "Empty CV");
		await settleScreen(page);
		const bounds = await placeholder.evaluate((element) => {
			const parent = element.getBoundingClientRect();
			return [...element.children].map((child) => {
				const box = child.getBoundingClientRect();
				return {
					left: box.left - parent.left,
					right: parent.right - box.right,
					top: box.top - parent.top,
					bottom: parent.bottom - box.bottom,
					fits: child.scrollWidth <= child.clientWidth,
				};
			});
		});
		for (const bound of bounds) {
			expect(bound.left).toBeGreaterThanOrEqual(0);
			expect(bound.right).toBeGreaterThanOrEqual(0);
			expect(bound.top).toBeGreaterThanOrEqual(0);
			expect(bound.bottom).toBeGreaterThanOrEqual(0);
			expect(bound.fits).toBe(true);
		}
	});
}

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 1920]) {
		test(`${locale} ${width} every CV has an honest preview and single-line metadata in grid and list`, async ({
			authPage: page,
		}) => {
			test.setTimeout(60_000);
			for (const withSampleData of [false, true])
				await expect(
					await page.request.post("/api/openapi/resumes", {
						data: { name: withSampleData ? "Sample CV" : "Empty CV", tags: [], withSampleData },
					}),
				).toBeOK();
			await expect(
				await page.request.post("/api/openapi/resumes/import", {
					data: {
						data: {
							...defaultResumeData,
							basics: { ...defaultResumeData.basics, name: "Imported CV", headline: "Software engineer" },
						},
					},
				}),
			).toBeOK();
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard?locale=${locale}`);
			await settleScreen(page);
			const cards = page.locator("main article");
			await expect(cards).toHaveCount(3);
			for (const card of await cards.all()) {
				const preview = card.locator('[data-slot="resume-thumbnail"]');
				await expect(preview).toHaveAttribute("data-state", /^(ready|empty)$/, { timeout: 30_000 });
				if ((await preview.getAttribute("data-state")) === "empty")
					await expect(preview).toContainText(locale === "ar-SA" ? "سيرة فارغة" : "Empty CV");
				else
					expect(
						await preview
							.locator("img")
							.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
					).toBe(true);
				const meta = card.locator('[data-slot="document-meta"]');
				await expect(meta).toHaveAttribute("title", await meta.innerText());
				await expect(meta).toHaveCSS("white-space", "nowrap");
				if (locale === "ar-SA") {
					await expect(meta).toContainText("عُدّلت");
					await expect(meta).not.toContainText("تم تحرير");
				}
			}
			await page.getByRole("radio", { name: locale === "ar-SA" ? "قائمة" : "List", exact: true }).click();
			await expect(page.locator("main tbody tr")).toHaveCount(3);
			for (const stamp of await page
				.locator("main tbody tr td")
				.filter({ hasText: /ago|قبل|الآن|now/ })
				.all())
				await expect(stamp).toHaveCSS("white-space", "nowrap");
			expect(
				await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
			).toBe(true);
		});
	}
