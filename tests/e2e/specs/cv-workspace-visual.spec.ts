import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390, 320]) {
		test(`CV workspace ${locale} at ${width}px`, async ({ authPage: page, baseURL }, testInfo) => {
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 900 });
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			await page.goto(`/dashboard?locale=${locale}`);
			await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
			await page.getByRole("button", { name: ar ? "سيرة ذاتية جديدة" : "New CV", exact: true }).click();
			await expect(
				page.getByRole("heading", { name: ar ? "كيف تحب أن تبدأ؟" : "How would you like to start?", exact: true }),
			).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("start.png") });
			await page.getByRole("button", { name: ar ? /^رفع سيرة ذاتية موجودة/ : /^Upload an existing CV/ }).click();
			await page.locator('input[type="file"]').setInputFiles("tooling/document-qualification/native/en.pdf");
			await expect(page).toHaveURL(/\/dashboard\/import\//, { timeout: 30000 });
			await expect(
				page.getByRole("heading", {
					name: ar ? "راجع المعلومات المستوردة" : "Review imported information",
					exact: true,
				}),
			).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("import-review.png") });
			if (width < 1024) {
				await page.getByRole("tab", { name: ar ? "ملف PDF الأصلي" : "Original PDF", exact: true }).click();
				await settleScreen(page);
				await page.screenshot({ path: testInfo.outputPath("import-source.png") });
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
			await page.getByRole("button", { name: ar ? "سيرة ذاتية جديدة" : "New CV", exact: true }).click();
			await page.getByRole("button", { name: ar ? /^الكتابة من الصفر/u : /^Write from scratch/u }).click();
			await expect(page).toHaveURL(/\/builder\//);
			await expect(page.getByRole("dialog")).not.toBeVisible();
			await page
				.getByLabel(ar ? "الاسم الكامل" : "Full name", { exact: true })
				.fill(ar ? "سارة الاختبار" : "Synthetic visual author");
			await expect(page.getByLabel(ar ? "الاسم الكامل" : "Full name", { exact: true })).toBeVisible();
			if (width === 1440)
				await expect
					.poll(() =>
						page
							.locator("canvas")
							.first()
							.evaluate((canvas) => (canvas as HTMLCanvasElement).width),
					)
					.toBeGreaterThan(0);
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("write.png") });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			if (width === 1440) await page.getByRole("tab", { name: /^(Check|فحص|مراجعة)/u }).click();
			else await page.getByRole("button", { name: /^(Check|فحص|مراجعة)/u }).click();
			await expect(page.locator("[data-pdf-bytes-hash]")).toBeVisible({ timeout: 60000 });
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("check.png") });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			if (width === 1440) {
				await page
					.getByRole("button", { name: ar ? "المزيد من صيغ التحميل" : "More download formats", exact: true })
					.click();
			} else await page.getByRole("button", { name: ar ? "تنزيل PDF" : "Download PDF", exact: true }).click();
			await expect(page.getByRole("tab", { name: ar ? "سجل النسخ" : "History", exact: true })).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("export.png") });
		});
	}
