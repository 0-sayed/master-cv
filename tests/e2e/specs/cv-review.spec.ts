import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { seedReview, openReview } from "../fixtures/reviewable-ai";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390])
		test(`review preserves saved content and separates destinations ${locale} ${width}`, async ({
			authPage: page,
		}, testInfo) => {
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
			const id = await seedReview(page, testInfo, locale);
			const read = async () =>
				(await (await page.request.get(`/api/openapi/resumes/${id}`)).json()) as {
					data: ResumeData;
					updatedAt: string;
				};
			const fixture = await read();
			fixture.data.basics.email = "";
			await expect(
				await page.request.put(`/api/openapi/resumes/${id}`, {
					data: { data: fixture.data, expectedUpdatedAt: fixture.updatedAt },
				}),
			).toBeOK();
			await page.reload();
			const before = await read();
			await openReview(page, width, "ats");
			await expect(page.getByRole("tablist", { name: ar ? "أقسام المراجعة" : "Review sections" })).toBeVisible();
			await expect(page.locator("main")).toHaveCount(1);
			await expect(page.locator(".editor-standard-layout > h1")).toHaveCount(1);
			await expect(page.locator(".editor-standard-layout > h1")).toHaveText(
				ar ? "راجع سيرتك الذاتية" : "Review your CV",
			);
			await openReview(page, width, "writing");
			const help = page.getByRole("button", { name: ar ? "لماذا يهم" : "Why it matters", exact: true }).first();
			await help.focus();
			await page.keyboard.press("Enter");
			await expect(help).toHaveAttribute("aria-expanded", "true");
			const guide = page.getByRole("link", { name: ar ? "تعرّف على هذا الفحص" : "Learn more about this check" }).first();
			await expect(guide).toHaveAttribute("href", /\/dashboard\/review-guide.*#rule-/u);
			const guideUrl = await guide.getAttribute("href");
			expect(guideUrl).toBeTruthy();
			await openReview(page, width, "ai");
			await expect(page.getByRole("tab", { name: ar ? /^الذكاء الاصطناعي /u : /^AI /u })).toHaveAttribute(
				"aria-selected",
				"true",
			);
			const after = await read();
			expect(after.data).toEqual(before.data);
			expect(after.updatedAt).toEqual(before.updatedAt);
			await page.goto(guideUrl ?? "");
			await expect(page.locator(new URL(page.url()).hash)).toBeInViewport();
		});

test("phone returns from selected evidence to the same filtered finding", async ({ authPage: page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await seedReview(page, testInfo);
	await openReview(page, 390, "writing");
	const show = page.getByRole("button", { name: "Show location", exact: true }).first();
	await show.scrollIntoViewIfNeeded();
	const card = show.locator("xpath=ancestor::*[@data-issue-card]");
	const key = await card.getAttribute("data-issue-card");
	await show.click();
	await expect(page.locator("main")).not.toHaveAttribute("inert");
	await page.getByRole("button", { name: "Back to findings", exact: true }).click();
	await expect(page.locator("main")).toHaveAttribute("inert");
	await expect(
		page
			.locator(`[data-issue-card=${JSON.stringify(key)}]`)
			.getByRole("button", { name: "Show location", exact: true }),
	).toBeFocused();
});
