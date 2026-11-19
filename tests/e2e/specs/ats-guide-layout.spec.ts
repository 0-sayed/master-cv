import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

async function expectMapLayout(page: Page, width: number) {
	const layout = await page.evaluate(() => {
		const paper = document.querySelector(".guide-paper")?.getBoundingClientRect();
		const stage = document.querySelector(".guide-map-stage")?.getBoundingClientRect();
		if (!paper || !stage) throw new Error("The CV map is missing");
		return {
			paper: paper.toJSON(),
			stage: stage.toJSON(),
			branches: Array.from(document.querySelectorAll<SVGPathElement>("[data-guide-branch]"), (branch) => {
				const length = branch.getTotalLength();
				const card = document
					.querySelector(`[data-guide-area="${branch.dataset.guideBranch}"]`)
					?.getBoundingClientRect();
				return {
					length,
					gap: card ? (card.left < paper.left ? paper.left - card.right : card.left - paper.right) : 0,
					points: Array.from({ length: 81 }, (_, i) => {
						const point = branch.getPointAtLength((length * i) / 80);
						return { x: point.x, y: point.y };
					}),
				};
			}),
			pins: Array.from(document.querySelectorAll("[data-guide-pin]"), (pin) => ({
				x: Number(pin.getAttribute("cx")),
				y: Number(pin.getAttribute("cy")),
			})),
			parts: Array.from(document.querySelectorAll(".guide-path-part"), (part) => ({
				top: part.getBoundingClientRect().top,
				separatorTop: part.querySelector("[data-guide-separator]")?.getBoundingClientRect().top,
				height: part.getBoundingClientRect().height,
			})),
		};
	});
	expect(layout.paper.width / layout.paper.height).toBeCloseTo(210 / 297, 3);
	expect(layout.paper.x + layout.paper.width / 2).toBeCloseTo(layout.stage.x + layout.stage.width / 2, 0);
	expect(layout.paper.width).toBeCloseTo(width === 390 ? 255 : 300, 0);
	expect(layout.paper.width).toBeLessThanOrEqual(layout.stage.width);
	for (const part of layout.parts) {
		if (part.separatorTop !== undefined) {
			expect(part.separatorTop).toBeGreaterThanOrEqual(part.top);
			expect(part.separatorTop).toBeLessThan(part.top + part.height);
		}
	}
	if (width !== 390) {
		expect(new Set(layout.pins.map((pin) => `${pin.x}:${pin.y}`)).size).toBe(layout.pins.length);
		const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
			(b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
		const crossings: string[] = [];
		for (const [index, branch] of layout.branches.entries()) {
			expect(branch.gap).toBeGreaterThanOrEqual(63.5);
			expect(branch.gap).toBeLessThanOrEqual(96.5);
			expect(branch.length).toBeGreaterThan(64);
			for (const other of layout.branches.slice(index + 1)) {
				for (let i = 1; i < branch.points.length; i++) {
					for (let j = 1; j < other.points.length; j++) {
						const a = branch.points[i - 1];
						const b = branch.points[i];
						const c = other.points[j - 1];
						const d = other.points[j];
						if (!a || !b || !c || !d) throw new Error("Missing branch sample");
						if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
							crossings.push(`${index}:${i}:${j}`);
					}
				}
			}
		}
		expect(crossings).toEqual([]);
		for (const x of [0, 244]) {
			const edge = layout.pins.filter((pin) => pin.x === x).map((pin) => pin.y);
			expect(new Set(edge).size).toBe(edge.length);
			expect(edge).toEqual([...edge].sort((a, b) => a - b));
		}
	}
}

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 1676, 1920, 390])
		for (const theme of ["light", "dark"] as const) {
			test(`Review guide ${locale} ${width} ${theme}`, async ({ browser, authPage }, testInfo) => {
				test.setTimeout(120_000);
				const context = await browser.newContext({
					baseURL: String(testInfo.project.use.baseURL),
					storageState: await authPage.context().storageState(),
					viewport: { width, height: width === 390 ? 844 : 1024 },
					hasTouch: width === 390,
					reducedMotion: "reduce",
				});
				try {
					await context.addCookies([{ name: "theme", value: theme, url: String(testInfo.project.use.baseURL) }]);
					const page = await context.newPage();
					await page.request.post("/api/auth/update-user", {
						headers: { origin: String(testInfo.project.use.baseURL) },
						data: { uiLocale: locale },
					});
					await page.goto(`/dashboard/review-guide?locale=${locale}`);
					await settleScreen(page);
					await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
					const tabs = page.getByRole("tablist");
					await expect(tabs).toHaveAttribute("data-size", "page");
					await expect(tabs).toHaveAttribute("data-variant", "default");
					await expect(tabs.locator('[data-slot="tabs-count"]')).toHaveText(["77", "22", "9"]);
					await expect(page.locator("[data-guide-area]")).toHaveCount(6);
					for (const branch of await page.locator("[data-guide-area]").all()) await expect(branch).toBeVisible();
					const metrics = await page.evaluate(() => {
						const header = document.querySelector('[data-slot="dashboard-header-content"]')?.getBoundingClientRect();
						const body = document.querySelector('[data-slot="dashboard-content"]')?.getBoundingClientRect();
						const aside = document.querySelector("aside")?.getBoundingClientRect();
						const toolbar = document.querySelector(".shell-toolbar")?.getBoundingClientRect();
						const filter = document.querySelector('[data-slot="filter-chips"]');
						const avatar = document.querySelector('[data-slot="sidebar-account"]')?.getBoundingClientRect();
						return {
							viewport: innerWidth,
							scrollWidth: document.documentElement.scrollWidth,
							header: header?.toJSON(),
							body: body?.toJSON(),
							sidebar: aside?.width,
							toolbar: toolbar?.height,
							avatar: avatar?.toJSON(),
							filterWidth: filter?.clientWidth,
							filterScroll: filter?.scrollWidth,
							chips: Array.from(filter?.querySelectorAll('[role="radio"]') ?? []).map((chip) => ({
								width: chip.clientWidth,
								scroll: chip.scrollWidth,
							})),
							tabLabels: Array.from(document.querySelectorAll<HTMLElement>('[role="tab"] > span'))
								.filter((label) => getComputedStyle(label).display !== "none")
								.map((label) => ({ client: label.clientWidth, scroll: label.scrollWidth })),
						};
					});
					expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
					for (const label of metrics.tabLabels) expect(label.scroll).toBeLessThanOrEqual(label.client + 1);
					expect(metrics.filterScroll).toBeLessThanOrEqual(metrics.filterWidth ?? 0);
					expect(metrics.chips).toHaveLength(4);
					for (const chip of metrics.chips) expect(chip.scroll).toBeLessThanOrEqual(chip.width);
					if (width === 1440) {
						expect(metrics.sidebar).toBe(236);
						expect(metrics.toolbar).toBe(64);
						expect(metrics.header?.x).toBeCloseTo(metrics.body?.x ?? 0, 0);
						expect(metrics.avatar?.x).toBeGreaterThanOrEqual(0);
					}
					if (width === 390) await expect(page.locator('[data-slot="app-bottom-nav"]')).toBeVisible();
					const capture = async (name: string) => {
						await settleScreen(page);
						await testInfo.attach(name, {
							body: JSON.stringify(await page.locator("main").boundingBox()),
							contentType: "application/json",
						});
					};
					await expectMapLayout(page, width);
					await capture("overview");
					await page.goto(`/dashboard/review-guide?locale=${locale}&tab=data`);
					await settleScreen(page);
					await expectMapLayout(page, width);
					await expect(page.locator("[data-guide-area]")).toHaveCount(5);
					await page.goto(`/dashboard/review-guide?locale=${locale}&tab=ats`);
					await settleScreen(page);
					await page.locator('[data-guide-area="contact"]').click();
					await capture("branch");
					for (const code of ["NO_EMAIL", "MISSING_EMAIL"]) {
						await page.goto(`/dashboard/review-guide?locale=${locale}#rule-${code}`);
						await expect(page.locator(`#rule-${code}`)).toHaveAttribute("open", "");
						await capture(code);
					}
					await page.getByRole("button", { name: locale === "ar-SA" ? "عرض كجدول" : "Show as table" }).click();
					await capture("table");
					await page.getByRole("searchbox").fill("does-not-exist-xyz");
					await capture("empty");
					await page.getByRole("tab", { name: locale === "ar-SA" ? "الذكاء الاصطناعي" : "AI", exact: true }).click();
					await expect(page.locator('[data-guide-area^="review."]')).toHaveCount(9);
					await expectMapLayout(page, width);
					await capture("ai");
					await page.goto(`/dashboard/review-guide?locale=${locale}#rule-UNKNOWN`);
					await expect(page.getByRole("alert")).toBeVisible();
					await capture("unknown");
					expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
					await writeFile(testInfo.outputPath("geometry.json"), JSON.stringify(metrics, null, 2));
				} finally {
					await context.close();
				}
			});
		}
