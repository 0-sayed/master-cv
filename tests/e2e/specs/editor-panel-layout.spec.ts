import type { Page } from "@playwright/test";
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

async function expectCenteredGrip(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const panel = document.querySelector(".editor-standard-layout > .editor-panel-container");
				const grip = document.querySelector(".editor-panel-grip");
				if (!panel || !grip) throw new Error("The editor panel is missing");
				const p = panel.getBoundingClientRect();
				const g = grip.getBoundingClientRect();
				const style = getComputedStyle(panel);
				const border = Number.parseFloat(style.borderInlineEndWidth);
				const line = style.direction === "rtl" ? p.left + border / 2 : p.right - border / 2;
				return Math.abs(line - (g.left + g.width / 2));
			}),
		)
		.toBeLessThanOrEqual(0.5);
}

for (const locale of ["ar-SA", "en-US"]) {
	test(`editor grip stays centered before and after a drag in ${locale}`, async ({ authPage: page, baseURL }, info) => {
		if (!baseURL) throw new Error("The browser base URL is missing");
		await page.setViewportSize({ width: 1440, height: 1024 });
		await createSampleResumeFromDashboard(page, info);
		const path = new URL(page.url()).pathname;
		await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } });
		await page.goto(`${path}?locale=${locale}`);
		const handle = page.locator(".editor-panel-resizer");
		await handle.dblclick();
		await expectCenteredGrip(page);
		const before = Number(await handle.getAttribute("aria-valuenow"));
		const box = await handle.boundingBox();
		if (!box) throw new Error("The resize handle is missing");
		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + (locale === "ar-SA" ? -96 : 96), y, { steps: 8 });
		await page.mouse.up();
		await expect(handle).toHaveAttribute("aria-valuenow", String(before + 96));
		await expectCenteredGrip(page);
		await handle.focus();
		await page.keyboard.press("End");
		const wide = page.locator(".editor-panel-fields .editor-panel-short-field.col-span-full").first();
		await expect(wide).toBeVisible();
		await expect(wide).toHaveCSS("grid-column-start", "1");
		await expect(wide).toHaveCSS("grid-column-end", "-1");
	});
}
