import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { openWriting } from "../fixtures/reviewable-ai";
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
			await openWriting(page, width);
			const pdf = page.locator("[data-pdf-bytes-hash]");
			await expect(pdf).toBeVisible({ timeout: 75_000 });
			const summary = page.getByRole("region", { name: ar ? "نتائج الفحص" : "Check summary", exact: true });
			await expect(summary).toBeVisible();
			const dismiss = page.getByRole("button", { name: ar ? "فهمت" : "Got it", exact: true });
			const intro = dismiss.locator('xpath=ancestor::*[@data-slot="alert"]');
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("intro.png") });
			const action = intro.locator('[data-slot="alert-actions"]');
			await expect(action).toContainText(ar ? "فهمت" : "Got it");
			expect(await dismiss.evaluate((button) => getComputedStyle(button).borderTopStyle)).toBe("solid");
			expect(await dismiss.evaluate((button) => getComputedStyle(button).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
			await dismiss.click();
			await summary.scrollIntoViewIfNeeded();
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			expect(await page.locator("html").getAttribute("dir")).toBe(ar ? "rtl" : "ltr");
			expect(
				await page.evaluate(
					(family) => document.fonts.check(`14px "${family}"`),
					ar ? "Noto Sans Arabic" : "Noto Sans",
				),
			).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("summary.png") });
			const warning = pdf.getByRole("button", { name: /(?:Warning|تحذير).*\(/u });
			await expect(warning).toHaveAttribute("aria-expanded", "true");
			const tips = pdf.getByRole("button", { name: /(?:Tip|نصيحة).*\(/u });
			await expect(tips).toHaveAttribute("aria-expanded", "false");
			const cards = pdf.locator("[data-issue-card]");
			await expect(cards.locator('[data-slot="alert"]')).toHaveCount(0);
			for (const severity of ["danger", "warn", "info"]) {
				if (severity === "info") await tips.click();
				const badge = cards.locator(`[data-slot="badge"][data-variant="${severity}"]`).first();
				await badge.scrollIntoViewIfNeeded();
				await settleScreen(page);
				await page.screenshot({ path: testInfo.outputPath(`${severity}-finding.png`) });
			}
			await tips.click();
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
			await openWriting(page, width);
			await expect(dismiss).toHaveCount(0);
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
			const fix = page.getByRole("button", { name: ar ? "إصلاح" : "Fix", exact: true }).first();
			await fix.click();
			const preview = page.getByRole("dialog");
			await expect(preview.getByText(ar ? "قبل" : "Before", { exact: true }).first()).toBeVisible();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("fix-preview.png") });
			await preview.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await expect(pdf).toBeVisible({ timeout: 75_000 });
			await page
				.getByRole("button", {
					name:
						width < 768 ? (ar ? "تنزيل PDF" : "Download PDF") : ar ? "المزيد من صيغ التحميل" : "More download formats",
					exact: true,
				})
				.click();
			const sheet = page.getByRole("dialog");
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
			await sheet.getByRole("button", { name: ar ? "عرض المشكلات" : "View issues", exact: true }).click();
			await expect(sheet).toHaveCount(0);
			await expect(
				page.getByRole("heading", { name: ar ? "راجع سيرتك الذاتية" : "Review your CV", exact: true }),
			).toBeVisible();
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
