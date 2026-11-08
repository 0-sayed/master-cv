import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("Arabic back arrows point right and the tablet home link names Master CV", async ({
	authPage: page,
}, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await createSampleResumeFromDashboard(page, testInfo);
	await page.goto(`${new URL(page.url()).pathname}?locale=ar-SA`);
	const back = page.locator('a[href="/dashboard"][aria-label] [data-slot="icon"]').first();
	const horizontalDirection = (element: Element) => {
		const style = getComputedStyle(element);
		return (Number.parseFloat(style.scale) || 1) * Math.cos(((Number.parseFloat(style.rotate) || 0) * Math.PI) / 180);
	};
	await expect(back).toBeVisible();
	expect.soft(await back.evaluate(horizontalDirection)).toBeCloseTo(-1);
	await page.goto("/dashboard/settings/preferences?locale=ar-SA");
	const settingsBack = page.locator('main a[href="/dashboard/settings"] [data-slot="icon"]');
	await expect(settingsBack).toBeVisible();
	expect.soft(await settingsBack.evaluate(horizontalDirection)).toBeCloseTo(-1);
	await page.setViewportSize({ width: 768, height: 900 });
	await expect(page.getByRole("complementary").getByRole("link", { name: "Master CV", exact: true })).toBeVisible();
});

test("the mobile application workspace starts with its own header", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const response = await page.request.post("/api/openapi/applications", {
		data: { company: "Synthetic workspace", role: "Engineer", status: "saved" },
	});
	await expect(response).toBeOK();
	const id = (await response.json()) as string;
	await page.goto(`/dashboard/applications/${id}`);
	await expect(page.getByRole("heading", { name: "Engineer · Synthetic workspace" })).toBeVisible();
	const header = page
		.getByRole("heading", { name: "Engineer · Synthetic workspace" })
		.locator("xpath=ancestor::header");
	expect((await header.boundingBox())?.y).toBe(0);
});
