import { expect, test } from "../fixtures/test";

test("form controls keep long labels visible at 320px and use mobile-sized targets", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto("/auth/login");
	await page.getByRole("button", { name: "Sign in", exact: true }).evaluate((element) => {
		element.setAttribute("data-control-stress", "");
		element.textContent = "تأكيد الدخول ومتابعة تحرير السيرة الذاتية بأمان";
	});
	const button = page.locator("[data-control-stress]");
	const box = await button.boundingBox();
	expect(box?.height).toBeGreaterThanOrEqual(44);
	const labelFits = await button.evaluate(
		(element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
	);
	expect(labelFits).toBe(true);
	expect(
		await page.getByLabel("Email address", { exact: true }).evaluate((element) => getComputedStyle(element).fontSize),
	).toBe("16px");
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a portalled document sheet traps focus, closes on Escape and restores its trigger", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard");
	const trigger = page.getByRole("button", { name: /^(New CV|New)$/, exact: true }).first();
	await trigger.click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	for (let index = 0; index < 18; index++) {
		await page.keyboard.press("Tab");
		await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
	}
	await page.keyboard.press("Escape");
	await expect(dialog).not.toBeVisible();
	await expect(trigger).toBeFocused();
});
