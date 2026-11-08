import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("inline registration links keep the surrounding line compact", async ({ page }) => {
	await page.goto("/auth/login");
	const link = page.getByRole("button", { name: "Create one now" });
	await expect(link).toBeVisible();
	expect((await link.boundingBox())?.height).toBeLessThan(30);
});

test("native selects match the standard text field height", async ({ page: login, authPage: page }, testInfo) => {
	await login.goto("/auth/login");
	const height = (await login.getByLabel("Email Address", { exact: true }).boundingBox())?.height;
	expect(height).toBe(44);
	await createSampleResumeFromDashboard(page, testInfo);
	await page.goto("/dashboard");
	const searchGroup = page
		.locator('[data-slot="input-group"]')
		.filter({ has: page.getByRole("searchbox", { name: "Search documents" }) });
	expect((await searchGroup.boundingBox())?.height).toBe(height);
	await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toBeVisible();
	expect((await page.getByRole("combobox", { name: "Sort", exact: true }).boundingBox())?.height).toBe(height);
});
