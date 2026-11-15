import type { Page, TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { expect } from "./test";

/** Capture real rendered layout separately from the functional assertions. */
export async function captureUiEvidence(page: Page, info: TestInfo, name: string, locale: "ar-SA" | "en-US") {
	await expect(page.locator('[data-slot="dashboard-content"]')).toBeVisible();
	await expect(page.locator("main h1")).toBeVisible();
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
	await expect(page.locator("html")).toHaveAttribute("lang", locale);
	await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
	const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog"));
	const dialogOpen = (await dialog.count()) > 0;
	if (dialogOpen) {
		await expect(dialog).toBeVisible();
		await expect(dialog).not.toHaveAttribute("data-starting-style");
		await expect(dialog).toHaveCSS("opacity", "1");
	} else
		await page.locator("main").evaluate((main) => {
			main.scrollTop = 0;
		});
	const evidence = await page.evaluate(() => {
		const rect = (selector: string) => {
			const el = document.querySelector(selector);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, width: r.width, height: r.height, end: r.right };
		};
		return {
			viewport: window.innerWidth,
			scrollWidth: document.documentElement.scrollWidth,
			fonts: [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family),
			header: rect('[data-slot="dashboard-header-content"]'),
			content: rect('[data-slot="dashboard-content"]'),
			sidebar: rect("aside"),
			heading: rect("main h1"),
			card: rect("main section"),
		};
	});
	expect(evidence.scrollWidth).toBeLessThanOrEqual(evidence.viewport);
	expect(evidence.fonts.some((font) => font.includes("Noto"))).toBe(true);
	await writeFile(info.outputPath(`${name}.json`), JSON.stringify(evidence, null, 2));
	await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
	// The dashboard scrolls its main panel; fullPage alone cannot show the lower mobile cards.
	if (!dialogOpen && evidence.viewport === 390) {
		const overflow = await page.locator("main").evaluate((main) => main.scrollHeight > main.clientHeight);
		if (overflow) {
			await page.locator("main").evaluate((main) => {
				main.scrollTop = main.scrollHeight;
			});
			await page.screenshot({ path: info.outputPath(`${name}-bottom.png`), fullPage: true, animations: "disabled" });
			await page.locator("main").evaluate((main) => {
				main.scrollTop = 0;
			});
		}
	}
	return evidence;
}
