import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Capture the rendered page after fonts and finite page/dialog transitions settle. */
export async function settleScreen(page: Page) {
	// A document load event and idle CSS animations do not mean the async router has committed its destination.
	await page.waitForFunction(() => {
		const state = (
			window as unknown as {
				__TSR_ROUTER__?: { state: { status: string; resolvedLocation?: { href: string }; location: { href: string } } };
			}
		).__TSR_ROUTER__?.state;
		return state?.status === "idle" && state.resolvedLocation?.href === state.location.href;
	});
	await expect(page.locator('[data-slot="loading-screen"]')).toHaveCount(0);
	await page.evaluate(() => document.fonts.ready);
	await expect
		.poll(() =>
			page.evaluate(() =>
				document
					.getAnimations()
					.every(
						(animation) =>
							animation.effect?.getComputedTiming().iterations === Infinity || animation.playState === "finished",
					),
			),
		)
		.toBe(true);
}
