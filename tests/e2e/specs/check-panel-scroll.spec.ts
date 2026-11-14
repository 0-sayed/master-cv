import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { openWriting } from "../fixtures/reviewable-ai";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`Check retains lower finding ${locale} ${width}`, async ({ authPage: page }, testInfo) => {
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
			for (const item of current.data.sections.experience.items) item.period = "";
			await expect(
				await page.request.put(`/api/openapi/resumes/${id}`, {
					data: { data: current.data, expectedUpdatedAt: current.updatedAt },
				}),
			).toBeOK();
			await page.reload();
			await openWriting(page, width);
			const go = page.getByRole("button", { name: ar ? "الانتقال إلى الحقل" : "Go to field", exact: true }).last();
			await go.scrollIntoViewIfNeeded();
			const card = go.locator("xpath=ancestor::*[@data-issue-card]");
			const key = await card.getAttribute("data-issue-card");
			const panel = page.locator('[data-slot="tabs-content"]').filter({ has: go });
			const top = await panel.evaluate((element) => element.scrollTop);
			expect(top).toBeGreaterThan(300);
			await go.click();
			await expect(go).toHaveCount(0);
			await openWriting(page, width);
			const restored = page.locator(`[data-issue-card=${JSON.stringify(key)}]`);
			await expect(restored).toHaveAttribute("data-check-return", "true");
			await expect(restored).toBeInViewport({ ratio: 1 });
			await expect(restored).toBeFocused();
			await page.screenshot({ path: testInfo.outputPath("return-finding.png") });
			await expect(restored).not.toHaveAttribute("data-check-return", "true");
			// Same recovery from the page view, including the phone's unmounted Check panel.
			await restored.getByRole("button", { name: ar ? "عرض على الصفحة" : "Show on page", exact: true }).click();
			if (width >= 768) {
				await page.getByRole("tab", { name: /^(Write|كتابة)/u }).click();
			}
			await page.emulateMedia({ reducedMotion: "reduce" });
			await openWriting(page, width);
			await expect(restored).toHaveAttribute("data-check-return", "true");
			await expect(restored).toBeInViewport({ ratio: 1 });
			await expect(restored).toBeFocused();
			expect(await restored.evaluate((element) => getComputedStyle(element, "::after").animationName)).toBe("none");
			await page.screenshot({ path: testInfo.outputPath("return-page-reduced-motion.png") });
		});
