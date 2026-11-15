import type { Page } from "@playwright/test";
import { expect } from "./test";

export async function expectSettingsColumn(page: Page) {
	const column = page.locator(".settings-content");
	const geometry = await column.evaluate((element) => {
		const column = element.getBoundingClientRect();
		const canvas = element.closest('[data-slot="dashboard-content"]')?.getBoundingClientRect();
		const title = element.querySelector("h1")?.getBoundingClientRect();
		const nav = element.querySelector("nav")?.getBoundingClientRect();
		if (!canvas || !title || !nav) throw new Error("Settings layout missing");
		return {
			width: column.width,
			expected: Math.min(720, canvas.width),
			center: column.left + column.width / 2 - canvas.left - canvas.width / 2,
			title: document.dir === "rtl" ? column.right - title.right : title.left - column.left,
			nav: nav.width ? { left: nav.left - column.left, width: nav.width - column.width } : null,
		};
	});
	expect(geometry.width).toBe(geometry.expected);
	expect(Math.abs(geometry.center)).toBeLessThanOrEqual(1);
	expect(Math.abs(geometry.title)).toBeLessThanOrEqual(1);
	if (geometry.nav) expect(geometry.nav).toEqual({ left: 0, width: 0 });
}
