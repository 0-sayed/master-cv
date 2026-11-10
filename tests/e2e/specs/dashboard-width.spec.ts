import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"]) {
	test(`${locale} application boards retain card widths and pending insights are bounded`, async ({
		authPage: page,
	}) => {
		test.setTimeout(60_000);
		await expect(
			await page.request.post("/api/openapi/applications", {
				data: { company: "Width fixture", role: "Engineer", status: "saved" },
			}),
		).toBeOK();
		for (const width of [1280, 1440, 1920]) {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard/applications?view=board&locale=${locale}`);
			await expect(page.locator("main section[aria-label]").first()).toBeVisible();
			for (let state = 0; state < 2; state++) {
				await settleScreen(page);
				const widths = await page
					.locator("main section[aria-label]")
					.evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
				expect(widths.length).toBeGreaterThan(1);
				for (const column of widths) expect(column).toBe(272);
				await page.locator('[data-slot="sidebar-toggle"]').click();
			}
			await page.goto(`/dashboard/applications?view=insights&locale=${locale}`);
			await expect(page.locator('[data-slot="empty-state"]')).toHaveCSS("border-style", "dashed");
		}
	});
}

for (const locale of ["ar-SA", "en-US"]) {
	test(`${locale} collections expand without stretching cards or forms`, async ({ authPage: page }) => {
		test.setTimeout(120_000);
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Width guard", tags: [], withSampleData: true },
			}),
		).toBeOK();
		for (const width of [1920, 1440, 1280]) {
			await page.setViewportSize({ width, height: 1024 });
			for (const collapsed of [false, true]) {
				for (const route of [
					"/dashboard",
					"/dashboard/applications",
					"/dashboard/career/information",
					"/dashboard/trash",
					"/dashboard/settings/account",
				]) {
					await page.goto(`${route}?locale=${locale}`);
					await expect(page.locator("main h1")).toBeVisible();
					const aside = page.locator("aside");
					const asideBox = await aside.boundingBox();
					if (!asideBox) throw new Error("Sidebar missing");
					if (asideBox.width < 100 !== collapsed) await page.locator('[data-slot="sidebar-toggle"]').click();
					await settleScreen(page);
					const geometry = await page.evaluate(() => {
						const rect = (selector: string) => {
							const element = document.querySelector(selector);
							if (!element) throw new Error(`Missing layout element: ${selector}`);
							return element.getBoundingClientRect();
						};
						const header = rect('[data-slot="dashboard-header-content"]');
						const body = rect('[data-slot="dashboard-content"]');
						const main = rect("main");
						const grid = document.querySelector('[data-slot="collection-grid"]');
						return {
							header: { left: header.left, right: header.right, width: header.width },
							body: { left: body.left, right: body.right, width: body.width },
							available: main.width - 80,
							columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").map(Number.parseFloat) : [],
							cards: [...document.querySelectorAll("main article")].map((card) => card.getBoundingClientRect().width),
							forms: [...document.querySelectorAll(".form-content")].map((form) => form.getBoundingClientRect().width),
							headerHeight: rect("main > header").height,
							overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
						};
					});
					const settings = route.includes("settings");
					const canvasWidth = Math.min(geometry.available, width >= 1600 && !settings ? 1360 : 1120);
					expect(geometry.header.width, route).toBe(canvasWidth);
					expect(geometry.body.width, route).toBe(settings ? Math.min(canvasWidth, 720) : canvasWidth);
					const rtl = locale === "ar-SA";
					expect(
						Math.abs(
							(rtl ? geometry.header.right : geometry.header.left) - (rtl ? geometry.body.right : geometry.body.left),
						),
						route,
					).toBeLessThanOrEqual(1);
					if (!settings) expect(Math.abs(geometry.header.right - geometry.body.right), route).toBeLessThanOrEqual(1);
					expect(geometry.overflow, route).toBe(false);
					expect(geometry.headerHeight, route).toBe(64);
					for (const form of geometry.forms) expect(form, route).toBeLessThanOrEqual(640);
					if (route === "/dashboard") {
						expect(geometry.columns).toHaveLength(width >= 1600 ? 5 : 4);
						expect(geometry.cards).toHaveLength(1);
						expect(Math.max(...geometry.cards)).toBeLessThanOrEqual(262);
					}
					if (route.endsWith("applications") || route.endsWith("trash")) {
						await expect(page.locator('[data-slot="empty-state"]')).toHaveCSS("border-style", "dashed");
					}
					if (route.endsWith("information")) {
						expect(geometry.columns).toHaveLength(width >= 1600 ? 3 : 2);
						expect(Math.max(...geometry.columns)).toBeLessThanOrEqual(552);
					}
				}
			}
		}
	});
}
