import { expect, test } from "../fixtures/test";

for (const width of [1440, 390]) {
	test(`unapproved personal tools stay unreachable at ${width}px`, async ({ authPage: page }) => {
		await page.setViewportSize({ width, height: 900 });
		const toolRequests: string[] = [];
		page.on("request", (request) => {
			if (/\/api\/rpc\/(applications|coverLetters)\//u.test(new URL(request.url()).pathname)) {
				toolRequests.push(request.url());
			}
		});
		await page.goto("/dashboard");
		await expect(page.locator('a[href="/dashboard/applications"]')).toHaveCount(0);
		await expect(page.getByRole("tab", { name: /Cover letters|Letters|خطابات/u })).toHaveCount(0);
		for (const path of [
			"/dashboard/applications",
			"/dashboard/applications/unavailable",
			"/dashboard/cover-letters",
			"/builder/letter/unavailable",
		]) {
			await page.goto(path);
			await expect(page).toHaveURL(/\/dashboard$/u);
		}
		// Interview workspaces are withheld independently of the personal-tools release gate.
		for (const tab of ["prepare", "practise", "debrief", "messages"]) {
			const path = `/dashboard/applications/unavailable/${tab}`;
			await page.goto(path);
			await expect(page).toHaveURL(new URL(path, page.url()).href);
			await expect(page.getByText("Not available", { exact: true })).toBeVisible();
			await page.getByRole("link", { name: "Back to documents" }).click();
			await expect(page).toHaveURL(/\/dashboard$/u);
		}
		expect(toolRequests).toEqual([]);
	});
}
