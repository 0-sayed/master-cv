import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { openReview } from "../fixtures/reviewable-ai";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`check panel ${locale} ${width}`, async ({ authPage: page }, testInfo) => {
			test.setTimeout(120_000);
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 900 });
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: String(testInfo.project.use.baseURL) },
			});
			await createSampleResumeFromDashboard(page, testInfo);
			const id = new URL(page.url()).pathname.split("/").at(-1);
			const current = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
			current.data.basics.email = "";
			current.data.basics.phone = "";
			current.data.summary.content = "";
			current.data.metadata.page.locale = ar ? "en-US" : "ar-SA";
			await expect(
				await page.request.put(`/api/openapi/resumes/${id}`, {
					data: { data: current.data, expectedUpdatedAt: current.updatedAt },
				}),
			).toBeOK();
			await page.reload();
			await openReview(page, width, "ats");
			const pdf = page.locator("[data-pdf-bytes-hash]");
			await expect(pdf).toBeVisible({ timeout: 75_000 });
			await expect(
				page.getByRole("region", { name: ar ? "ملاحظات المراجعة" : "Review findings", exact: true }),
			).toBeVisible();
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			expect(await page.locator("html").getAttribute("dir")).toBe(ar ? "rtl" : "ltr");
			expect(
				await page.evaluate(
					(family) => document.fonts.check(`14px "${family}"`),
					ar ? "Noto Sans Arabic" : "Noto Sans",
				),
			).toBe(true);
			const cards = pdf.locator("[data-issue-card]");
			await expect(cards.locator('[data-slot="alert"]')).toHaveCount(0);
			await page.screenshot({ path: testInfo.outputPath("findings.png") });
			const keep = pdf.getByRole("button", { name: ar ? "إبقاء كما هو" : "Keep as is", exact: true }).first();
			await keep.scrollIntoViewIfNeeded();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("findings.png") });
			await keep.click();
			await expect
				.poll(async () => {
					const saved = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
					return saved.data.metadata.check?.ignored?.some((key: string) => key.startsWith("pdf:"));
				})
				.toBe(true);
			await page.reload();
			await openReview(page, width, "ats");

			const showAgain = page.getByRole("button", { name: /Show again|اعرض مرة أخرى/u });
			await expect(showAgain).toBeVisible();
			await showAgain.scrollIntoViewIfNeeded();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("kept.png") });
			await showAgain.click();
			await expect
				.poll(async () => {
					const saved = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
					return saved.data.metadata.check?.ignored?.length ?? 0;
				})
				.toBe(0);
			await openReview(page, width, "writing");
			const fix = page.getByRole("button", { name: ar ? "إصلاح" : "Fix", exact: true }).first();
			await fix.click();
			const preview = page.getByRole("dialog");
			const comparison = preview.locator('[data-review-diff] [data-slot="rule-comparison"]').first();
			await expect(comparison.locator('[data-layout="inline"]')).toBeVisible();
			await expect(comparison.locator(".sr-only")).toContainText(ar ? "قبل:" : "Before:");
			await expect(comparison.locator(".sr-only")).toContainText(ar ? "بعد:" : "After:");
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("fix-preview.png") });
			await preview.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await expect(
				page.getByRole("region", { name: ar ? "ملاحظات المراجعة" : "Review findings", exact: true }),
			).toBeVisible();
			await page
				.getByRole("button", {
					name:
						width < 768 ? (ar ? "تنزيل PDF" : "Download PDF") : ar ? "المزيد من صيغ التحميل" : "More download formats",
					exact: true,
				})
				.click();
			const sheet = page
				.getByRole("dialog", { name: ar ? "التصدير والسجل" : "Export and history" })
				.or(page.getByRole("complementary", { name: ar ? "التصدير والسجل" : "Export and history" }));
			await expect(
				sheet.getByText(ar ? "توجد مشكلة قد تمنع قراءة الملف" : "There is an issue that may block reading", {
					exact: true,
				}),
			).toBeVisible();
			const download = sheet.getByRole("button", { name: ar ? "تحميل PDF" : "Download PDF", exact: true });
			await expect(download).toBeEnabled();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("export-blockers.png") });
			const downloadEvent = page.waitForEvent("download");
			await download.click();
			expect(await (await downloadEvent).failure()).toBeNull();
			await sheet.getByRole("button", { name: ar ? "مراجعة" : "Review", exact: true }).click();
			await expect(sheet).toHaveCount(0);
			await expect(
				page.getByRole("heading", { name: ar ? "راجع سيرتك الذاتية" : "Review your CV", exact: true, level: 2 }),
			).toBeVisible();
			await openReview(page, width, "writing");
			await fix.click();
			await page
				.getByRole("dialog")
				.getByRole("button", { name: ar ? "قبول التغيير" : "Accept change", exact: true })
				.click();
			const fixed = page.getByRole("button", { name: /1 fixed|تم إصلاح 1|1 تم إصلاحها|1 تم إصلاحه|1 أُصلح/u });
			await expect(fixed).toBeVisible();
			await fixed.scrollIntoViewIfNeeded();
			// Finish the closing transition without waiting past the automatic recheck.
			await page.screenshot({ path: testInfo.outputPath("fixed.png"), animations: "disabled" });
		});
	}
