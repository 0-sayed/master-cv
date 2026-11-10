import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("registration navigation keeps readable text and a touch target", async ({ page }) => {
	await page.goto("/auth/login");
	const link = page.getByRole("link", { name: "Create an account", exact: true });
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute("href", /\/auth\/register/);
	await expect(link).toHaveCSS("font-size", "14px");
	expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(48);
});

test("native selects match the standard text field height", async ({ page: login, authPage: page }, testInfo) => {
	await login.goto("/auth/login");
	const authHeight = (await login.getByLabel(/^Email address$/i).boundingBox())?.height;
	expect(authHeight).toBe(48);
	const height = 44;
	await createSampleResumeFromDashboard(page, testInfo);
	await page.goto("/dashboard");
	const searchGroup = page
		.locator('[data-slot="input-group"]')
		.filter({ has: page.getByRole("searchbox", { name: "Search documents", exact: true }) });
	expect((await searchGroup.boundingBox())?.height).toBe(height);
	await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toBeVisible();
	expect((await page.getByRole("combobox", { name: "Sort", exact: true }).boundingBox())?.height).toBe(height);
});
