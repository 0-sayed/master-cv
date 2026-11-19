import type { Page, TestInfo } from "@playwright/test";
import { settleScreen } from "./screen";
import { expect } from "./test";

/** Inspect real review controls without a live detector or another browser. */
export async function detectReviewPage(page: Page, testInfo: TestInfo): Promise<void> {
	await settleScreen(page);
	const panel = page.locator('[data-slot="editor-panel"]');
	await expect(panel).toBeVisible();
	await expect(panel.getByRole("tablist", { name: "Review sections", exact: true })).toBeVisible();
	await expect(panel.getByRole("tab")).toHaveCount(3);
	const title = await page.title();
	const metrics = await panel.evaluate((element) => ({
		width: element.clientWidth,
		scrollWidth: element.scrollWidth,
		viewport: innerWidth,
		pageWidth: document.documentElement.scrollWidth,
	}));
	expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
	expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewport);
	const tabs = panel.getByRole("tab");
	await tabs.first().focus();
	await expect(tabs.first()).toBeFocused();
	await page.keyboard.press("End");
	await expect(tabs.last()).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
	await expect(page).toHaveTitle(title);
	await testInfo.attach("review-layout", { body: JSON.stringify(metrics), contentType: "application/json" });
}
