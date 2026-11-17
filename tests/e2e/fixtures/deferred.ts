import type { Page } from "@playwright/test";
import { deferredRoute, isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { expect } from "./test";

/** Assert the release boundary instead of expecting controls from a withheld workspace. */
export async function expectDeferredRoute(page: Page, path: string): Promise<boolean> {
	const feature = deferredRoute(new URL(path, "http://localhost").pathname);
	if (!feature || isFeatureAvailable(feature)) return false;
	const notice = page.locator('[data-slot="alert"][data-variant="info"]');
	await expect(notice).toHaveCount(1);
	await expect(notice.locator('[data-slot="alert-title"]')).toHaveText(/^(Not available|غير متاح)$/u);
	await expect(notice.getByRole("link", { name: /^(Back to documents|العودة إلى المستندات)$/u })).toBeVisible();
	await expect(page.getByRole("textbox")).toHaveCount(0);
	return true;
}
