import { seedReview } from "../fixtures/reviewable-ai";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { seedTailoringReview, launchTailoringReview, variantClient } from "../fixtures/variants";
for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test(`job and language surfaces ${locale} ${width}`, async ({ authPage: page }, info) => {
			const id = await seedReview(page, info, locale, locale === "ar-SA" ? "en-US" : "ar-SA");
			await page.setViewportSize({ width, height: 900 });
			for (const screen of ["job", "languages"]) {
				await page.goto(`/dashboard/resumes/${id}/${screen}`);
				await settleScreen(page);
				await expect(page.locator("h1")).toBeVisible();
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				expect(
					await page.evaluate(
						(family) => document.fonts.check(`14px "${family}"`),
						locale === "ar-SA" ? "Noto Sans Arabic" : "Noto Sans",
					),
				).toBe(true);
				await page.screenshot({ path: info.outputPath(`${screen}.png`), fullPage: true });
			}
		});

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`tailoring decisions and failed-review notice ${locale} ${width}`, async ({ authPage: page }, info) => {
			const { copyId, sourceId, original } = await seedTailoringReview(page, info);
			const api = variantClient(page);
			await page.setViewportSize({ width, height: 900 });
			await expect(
				await page.request.post("/api/auth/update-user", {
					data: { uiLocale: locale },
					headers: { origin: String(info.project.use.baseURL) },
				}),
			).toBeOK();
			await launchTailoringReview(page, copyId);
			const proposals = page.locator("[data-proposal-index]");
			await expect(proposals).toHaveCount(3, { timeout: 30000 });
			await settleScreen(page);
			await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			expect(
				await page.evaluate(
					(family) => document.fonts.check(`14px "${family}"`),
					locale === "ar-SA" ? "Noto Sans Arabic" : "Noto Sans",
				),
			).toBe(true);
			await page.screenshot({ path: info.outputPath("tailoring-proposals.png"), fullPage: true });
			await proposals
				.first()
				.getByRole("button", { name: /^(Accept|قبول)$/u })
				.click();
			await expect
				.poll(async () => (await api.resume.getById({ id: copyId })).data.summary.content)
				.toBe("<p>Developed TypeScript services. Did not manage a budget.</p>");
			await page.reload();
			await expect(proposals).toHaveCount(3);
			await expect(proposals.first().getByRole("button", { name: /^(Accept|قبول)$/u })).toHaveCount(0);
			const cv = await api.resume.getById({ id: copyId });
			const selected = (await api.career.jobTargets.evidence({ resumeId: copyId })).selection;
			if (!selected) throw new Error("Expected selected job");
			const job = await api.career.jobTargets.save({
				role: "Synthetic recovery",
				employer: "",
				text: "Synthetic provider failure",
			});
			await api.career.jobTargets.select({
				resumeId: copyId,
				expectedUpdatedAt: cv.updatedAt.toISOString(),
				jobId: job.jobId,
				jobRevision: job.revision,
				expectedSelectionRevision: selected.revision,
			});
			await launchTailoringReview(page, copyId);
			const notice = page.locator('[data-slot="alert"]').filter({ hasText: /No review was delivered|لم تُسلّم مراجعة/u });
			await expect(notice).toBeVisible({ timeout: 30000 });
			await expect(notice.locator('[data-slot="icon"]')).toBeVisible();
			await expect(notice.locator('[data-slot="alert-title"]')).not.toBeEmpty();
			await expect(notice.locator('[data-slot="alert-description"]')).not.toBeEmpty();
			await expect(notice.getByRole("button", { name: /^(Retry|إعادة المحاولة)$/u })).toBeEnabled();
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.screenshot({ path: info.outputPath("failed-review.png"), fullPage: true });
			await notice.getByRole("button", { name: /^(Retry|إعادة المحاولة)$/u }).click();
			expect((await api.ai.usage.get()).operations).toMatchObject({ used: 1, reserved: 0 });
			expect((await api.resume.getById({ id: sourceId })).data).toEqual(original.data);
		});
