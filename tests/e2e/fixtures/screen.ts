import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Capture the rendered page after fonts and finite page/dialog transitions settle. */
export async function settleScreen(page: Page) {
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
