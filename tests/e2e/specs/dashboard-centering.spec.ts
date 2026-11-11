import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

const routes = [
	"/dashboard",
	"/dashboard/career/information",
	"/dashboard/applications",
	"/dashboard/settings/account",
];

for (const locale of ["ar-SA", "en-US"]) {
	test(`${locale} wide dashboard canvas is centered and header controls reach its end`, async ({ authPage: page }) => {
		await page.setViewportSize({ width: 1920, height: 900 });
		for (const route of routes) {
			await page.goto(`${route}?locale=${locale}`);
			await expect(page.locator("main h1")).toBeVisible();
			await settleScreen(page);
			const geometry = await page.evaluate(() => {
				const main = document.querySelector("main");
				const band = main?.querySelector('[data-slot="dashboard-header-content"]');
				const title = main?.querySelector("h1");
				const frame = main?.querySelector('[data-slot="dashboard-page"]');
				if (!main || !band || !title || !frame) throw new Error("Dashboard layout missing");
				const m = main.getBoundingClientRect();
				const b = band.getBoundingClientRect();
				const t = title.getBoundingClientRect();
				const f = frame.getBoundingClientRect();
				const style = getComputedStyle(frame);
				const rtl = document.documentElement.dir === "rtl";
				const left = f.left + Number.parseFloat(style.paddingLeft);
				const right = f.right - Number.parseFloat(style.paddingRight);
				const controls = [...band.querySelectorAll("button")].map((el) => el.getBoundingClientRect());
				return {
					gapDifference: left - m.left - (m.right - right),
					width: right - left,
					titleStart: rtl ? t.right : t.left,
					headerStart: rtl ? b.right : b.left,
					headerEnd: rtl ? b.left : b.right,
					contentEnd: rtl ? left : right,
					controlsEnd: rtl ? Math.min(...controls.map((r) => r.left)) : Math.max(...controls.map((r) => r.right)),
				};
			});
			expect.soft(Math.abs(geometry.gapDifference), route).toBeLessThanOrEqual(2);
			expect.soft(geometry.width, route).toBe(1360);
			expect.soft(Math.abs(geometry.titleStart - geometry.headerStart), route).toBeLessThanOrEqual(1);
			expect.soft(Math.abs(geometry.headerEnd - geometry.contentEnd), route).toBeLessThanOrEqual(1);
			expect.soft(Math.abs(geometry.controlsEnd - geometry.contentEnd), route).toBeLessThanOrEqual(1);
		}
	});
}

test("Arabic reachable action labels use action wording", async ({ authPage: page }) => {
	for (const route of [...routes, "/dashboard/settings/preferences", "/dashboard/trash"]) {
		await page.goto(`${route}?locale=ar-SA`);
		await expect(page.locator("main h1")).toBeVisible();
		const labels = await page.getByRole("button").allTextContents();
		expect
			.soft(
				labels.filter((label) =>
					/^(يتغير|يمسح|يصدر|يحفظ|يضيف|يحرر|يزيل|يعيد|يبحث|يرسل|يشارك|يترجم|يقبل|يغلق)(?:\s|…|$)/u.test(label.trim()),
				),
				route,
			)
			.toEqual([]);
		expect
			.soft(
				labels.filter((label) => /\bCheck\b/u.test(label)),
				route,
			)
			.toEqual([]);
		if (route.endsWith("account")) {
			await expect.soft(page.getByRole("button", { name: "تغيير", exact: true })).toBeVisible();
			await expect.soft(page.getByRole("button", { name: "حذف…", exact: true })).toBeVisible();
		}
	}
	await page.goto("/dashboard/applications?locale=ar-SA");
	await expect(page.locator("main")).not.toContainText("Check");
	await expect(page.locator("main")).toContainText("الفحص");
});
