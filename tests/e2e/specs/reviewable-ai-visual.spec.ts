import { openPdfReview } from "../fixtures/import-review";
import { openWriting, seedReview, seedReviewBudget, startReview } from "../fixtures/reviewable-ai";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`review states ${locale} ${width}`, async ({ authPage: page }, testInfo) => {
			test.setTimeout(120_000);
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 900 });
			const resumeId = await seedReview(page, testInfo, locale, ar ? "en-US" : "ar-SA");
			await openWriting(page, width);
			await startReview(page);
			const review = page.getByTestId("durable-review");
			await expect(review.locator("mark.wording-added")).toHaveText(ar ? "Developed" : "طورت");
			await expect(
				review.getByText(ar ? "صياغة جديدة — تحقق من صحتها" : "New wording — check it is true"),
			).toBeVisible();
			await review.getByText(ar ? "المصدر" : "Evidence", { exact: true }).click();
			await review.scrollIntoViewIfNeeded();
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			expect(
				await page.evaluate(
					(family) => document.fonts.check(`14px "${family}"`),
					ar ? "Noto Sans Arabic" : "Noto Sans",
				),
			).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("review.png") });
			await review.getByRole("button", { name: ar ? "تعديل" : "Edit", exact: true }).click();
			const dialog = page.getByRole("dialog");
			await dialog.getByRole("textbox").fill(ar ? "My supplied wording." : "صياغتي التي أضفتها بنفسي.");
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("editing.png") });
			await dialog.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await review.getByRole("button", { name: ar ? "إضافة معلومة" : "Add information", exact: true }).click();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("add-information.png") });
			await dialog.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await review.getByRole("button", { name: ar ? "قبول" : "Accept", exact: true }).click();
			const undo = review.getByRole("button", { name: ar ? "تراجع" : "Undo", exact: true });
			await expect(undo).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath("accept-card-frame.png") });
			if (width === 390)
				await page
					.getByRole("navigation", { name: /Editor views|طرق عرض المحرر/u })
					.getByRole("button", { name: /^(Page|صفحة)$/u })
					.click();
			const pulse = page.locator('[data-slot="preview-edit-highlight"][data-review-action="accept"]');
			await expect(pulse).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath("accept-preview-frame.png") });
			if (width === 390) await openWriting(page, width);
			await review.scrollIntoViewIfNeeded();
			await undo.scrollIntoViewIfNeeded();
			await settleScreen(page);
			await expect(review.locator(".review-wording ins")).toHaveCSS("opacity", "1");
			await page.screenshot({ path: testInfo.outputPath("accepted.png") });
			await undo.click();
			await expect(page.locator('.review-wording[data-review-action="undo"]')).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath("undo-card-frame.png") });
			if (width === 390)
				await page
					.getByRole("navigation", { name: /Editor views|طرق عرض المحرر/u })
					.getByRole("button", { name: /^(Page|صفحة)$/u })
					.click();
			await expect(page.locator('[data-slot="preview-edit-highlight"][data-review-action="undo"]')).toBeVisible();
			await page.screenshot({ path: testInfo.outputPath("undo-preview-frame.png") });
			if (width === 390) await openWriting(page, width);
			await review.getByRole("button", { name: ar ? "تعديل" : "Edit", exact: true }).click();
			// Switching mobile views remounts the review panel; supply this decision's wording explicitly.
			await dialog.getByRole("textbox").fill(ar ? "My supplied wording." : "صياغتي التي أضفتها بنفسي.");
			await dialog.getByRole("button", { name: ar ? "حفظ صياغتي" : "Save my wording", exact: true }).click();
			await expect(undo).toBeVisible();
			await review.scrollIntoViewIfNeeded();
			await undo.scrollIntoViewIfNeeded();
			await settleScreen(page);
			const ownWording = review.locator(".review-wording ins");
			await expect(ownWording).toHaveText(ar ? "My supplied wording." : "صياغتي التي أضفتها بنفسي.");
			await expect(ownWording).toHaveCSS("opacity", "1");
			await ownWording.scrollIntoViewIfNeeded();
			await expect(ownWording).toBeInViewport();
			await page.screenshot({ path: testInfo.outputPath("own-wording.png") });
			await undo.click();
			await expect(review.getByRole("button", { name: ar ? "قبول" : "Accept", exact: true })).toBeVisible();
			const current = await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json();
			current.data.summary.content = ar ? "<p>Manual correction.</p>" : "<p>تعديل يدوي.</p>";
			await expect(
				await page.request.put(`/api/openapi/resumes/${resumeId}`, {
					data: { data: current.data, expectedUpdatedAt: current.updatedAt },
				}),
			).toBeOK();
			await page.reload();
			await openWriting(page, width);
			await expect(
				review.getByText(ar ? "قديم: لقد تغير النص منذ ذلك الحين." : "Out of date: the text has changed since."),
			).toBeVisible();
			await review.scrollIntoViewIfNeeded();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("stale.png") });
			await page.setViewportSize({ width: 320, height: 900 });
			await review.scrollIntoViewIfNeeded();
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("reflow-320.png") });
		});
	}

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`native selected-text assistance ${locale} ${width} stays local until confirmation`, async ({
			authPage: page,
		}, testInfo) => {
			test.setTimeout(90_000);
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 900 });
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: String(testInfo.project.use.baseURL) },
			});
			await seedReviewBudget();
			await openPdfReview(page, locale);
			const master = await (await page.request.get("/api/openapi/career/master")).json();
			const cvs = await (await page.request.get("/api/openapi/resumes")).json();
			await page
				.getByText(ar ? "احصل على مساعدة للنص غير المؤكد" : "Get help with uncertain text", { exact: true })
				.click();
			const field = page.getByRole("textbox", {
				name: ar
					? "النص المستخرج مباشرة — حدد المقطع غير المؤكد"
					: "Native extracted text — select the uncertain passage",
				exact: true,
			});
			await field.evaluate((element: HTMLTextAreaElement) => {
				element.focus();
				const match = /Built\s+secure\s+services/u.exec(element.value);
				if (!match) throw new Error("Missing synthetic experience passage");
				element.setSelectionRange(match.index, match.index + match[0].length - 1);
			});
			await page.keyboard.press("Shift+ArrowRight");
			await expect(page.locator("blockquote")).toHaveText("Built secure services");
			await page.getByRole("button", { name: ar ? "مراجعة النص المحدد" : "Review selected text", exact: true }).click();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("import-consent.png") });
			await page
				.getByRole("dialog")
				.getByRole("button", { name: ar ? "بدء المراجعة" : "Start review", exact: true })
				.click();
			await expect(
				page.getByRole("button", { name: ar ? "استخدام في المسودة" : "Use in draft", exact: true }),
			).toBeVisible({ timeout: 25_000 });
			await page
				.getByRole("combobox", { name: ar ? "تطبيق على سجل" : "Apply to entry", exact: true })
				.selectOption("new");
			await page.getByRole("button", { name: ar ? "استخدام في المسودة" : "Use in draft", exact: true }).click();
			await expect(
				page.getByRole("button", {
					name: ar ? "أُضيف إلى المسودة المحلية — راجعه قبل التأكيد" : "Added to local draft — review before confirming",
					exact: true,
				}),
			).toBeDisabled();
			expect(await (await page.request.get("/api/openapi/career/master")).json()).toEqual(master);
			expect(await (await page.request.get("/api/openapi/resumes")).json()).toEqual(cvs);
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("import-assistance.png") });
			await page.setViewportSize({ width: 320, height: 900 });
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("import-reflow-320.png") });
			await page.setViewportSize({ width, height: 900 });
			await page.reload();
			await page
				.getByText(ar ? "احصل على مساعدة للنص غير المؤكد" : "Get help with uncertain text", { exact: true })
				.click();
			await expect(
				page.getByRole("button", {
					name: ar ? "أُضيف إلى المسودة المحلية — راجعه قبل التأكيد" : "Added to local draft — review before confirming",
					exact: true,
				}),
			).toBeDisabled();
			if (!ar && width === 1440) {
				await page.getByRole("button", { name: "Create CV and open editor", exact: true }).click();
				await expect(page).toHaveURL(/\/builder\//u);
				const id = new URL(page.url()).pathname.split("/").at(-1);
				const saved = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
				expect(saved.data.sections.experience.items.at(-1).description).toBe("Built secure services");
				expect(await (await page.request.get("/api/openapi/career/master")).json()).toEqual(master);
				expect((await (await page.request.get("/api/openapi/ai/usage")).json()).operations.used).toBe(1);
			}
		});
