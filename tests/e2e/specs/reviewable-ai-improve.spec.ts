import { seedReview } from "../fixtures/reviewable-ai";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`${locale} ${width} Improve uses platform review without a personal provider`, async ({
			authPage: page,
		}, info) => {
			await page.setViewportSize({ width, height: 900 });
			await seedReview(page, info, locale);
			const ar = locale === "ar-SA";
			if (width >= 768) await page.getByRole("tab", { name: ar ? "كتابة" : "Write", exact: true }).click();
			else
				await page
					.getByRole("navigation", { name: /Editor views|طرق عرض المحرر/u })
					.getByRole("button", { name: ar ? "كتابة" : "Write", exact: true })
					.click();
			await page
				.locator('[data-section-id="summary"]')
				.getByRole("button", { name: ar ? "الملخّص" : "Summary", exact: true })
				.click();
			const summary = page.getByRole("textbox", { name: ar ? "الملخّص" : "Summary", exact: true });
			await summary.click();
			await page.getByRole("button", { name: ar ? "تحسين" : "Improve", exact: true }).click();
			await page.getByRole("button", { name: ar ? "فعل أقوى" : "Stronger verb", exact: true }).click();
			await page.getByRole("button", { name: /^(Review wording|مراجعة الصياغة)$/u }).click();
			await page
				.getByRole("dialog")
				.getByRole("button", { name: /^(Start review|بدء المراجعة)$/u })
				.click();
			await expect(page.getByTestId("durable-review")).toBeVisible({ timeout: 25_000 });
			await expect(page.getByRole("button", { name: /^(Accept|قبول)$/u })).toBeVisible();
			await page.screenshot({ path: info.outputPath("platform-improve.png") });
		});
