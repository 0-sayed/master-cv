import type { Page } from "@playwright/test";

export async function navigateDashboard(page: Page, path: string) {
	if (path === "/dashboard/settings") {
		await page.locator('aside [data-slot="sidebar-account"]').click();
		await page.locator(`[role="menuitem"][href="${path}"]`).click();
	} else {
		await page.locator(`aside a[href="${path}"]`).click();
	}
}
