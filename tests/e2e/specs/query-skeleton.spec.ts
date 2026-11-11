import { createSampleCareer } from "../fixtures/career";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 1920, 390]) {
		for (const { path, populated } of [
			{ path: "/dashboard", populated: false },
			{ path: "/dashboard?view=list", populated: false },
			{ path: "/dashboard/career/information", populated: false },
			{ path: "/dashboard/career/information", populated: true },
		]) {
			test(`${locale} ${width} ${path} ${populated ? "populated" : "empty"} query skeleton preserves content anchors`, async ({
				authPage: page,
				baseURL,
			}) => {
				if (!baseURL) throw new Error("Browser baseURL missing");
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
				if (populated) await createSampleCareer(page);
				if (path === "/dashboard" || path === "/dashboard?view=list") {
					await expect(
						await page.request.post("/api/openapi/resumes", {
							data: { name: "Skeleton geometry", tags: [], withSampleData: false },
						}),
					).toBeOK();
				}
				await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } });
				await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
				let release!: () => void;
				const hold = new Promise<void>((resolve) => {
					release = resolve;
				});
				await page.route("**/api/rpc/**", async (route) => {
					if (!/\/(flags|get-session|personalWorkspace)\//.test(route.request().url())) await hold;
					await route.continue();
				});
				try {
					await page.goto(`${path}${path.includes("?") ? "&" : "?"}locale=${locale}`);
					const region = page.locator('main [data-slot="skeleton-region"]').first();
					await expect(region.locator('[data-visible="true"]')).toBeVisible();
					await expect(region).toHaveAttribute("aria-busy", "true");
					await expect(region.locator(':scope > [role="status"]')).toHaveCount(1);
					await expect(region.locator('[data-slot="skeleton"]').first()).toHaveAttribute("aria-hidden", "true");
					expect(
						await region
							.locator('[data-slot="skeleton"]')
							.evaluateAll((blocks) => blocks.every((block) => block.getBoundingClientRect().width > 0)),
					).toBe(true);
					await page.evaluate(() => document.fonts.ready);
					const anchors = () =>
						page.evaluate(() =>
							[
								...document.querySelectorAll(
									'[data-slot="dashboard-header-content"], [data-slot="dashboard-content"], main h1',
								),
							]
								.filter((el) => el.getBoundingClientRect().width > 1 && el.getBoundingClientRect().height > 1)
								.map((el) => {
									const r = el.getBoundingClientRect();
									return [r.x, r.y, r.width, innerWidth - document.documentElement.clientWidth] as const;
								}),
						);
					expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
					const before = await anchors();
					const sectionBoxes = () =>
						page.locator('main [data-slot="section-card"]').evaluateAll((cards) =>
							cards.map((card) => {
								const box = card.getBoundingClientRect();
								return { x: box.x, y: box.y, width: box.width, height: box.height };
							}),
						);
					const pendingSections = path === "/dashboard/career/information" ? await sectionBoxes() : [];
					const cardSelector =
						path === "/dashboard"
							? 'main [data-slot="collection-grid"] > :first-child'
							: path === "/dashboard?view=list"
								? "main table tbody tr:first-child"
								: null;
					const pendingCard = cardSelector ? await page.locator(cardSelector).boundingBox() : null;
					release();
					await expect(page.locator('main [data-slot="skeleton-region"]')).toHaveCount(0);
					const after = await anchors();
					expect(after).toHaveLength(before.length);
					for (const [index, ready] of after.entries()) {
						const pending = before[index];
						if (!pending) throw new Error("Missing pending content anchor");
						// Native scrollbars may appear as unknown content arrives. Only that inline reflow is allowed.
						const gutterChange = Math.abs(ready[3] - pending[3]);
						expect(Math.abs(ready[0] - pending[0])).toBeLessThanOrEqual(gutterChange + 1);
						expect(Math.abs(ready[2] - pending[2])).toBeLessThanOrEqual(gutterChange + 1);
						expect(Math.abs(ready[1] - pending[1])).toBeLessThanOrEqual(1);
					}
					if (pendingSections.length) {
						const readySections = await sectionBoxes();
						await test.info().attach("career-card-geometry", {
							body: JSON.stringify({ locale, width, populated, pending: pendingSections, ready: readySections }),
							contentType: "application/json",
						});
						expect(readySections).toHaveLength(pendingSections.length);
						for (const [index, ready] of readySections.entries()) {
							const pending = pendingSections[index];
							if (!pending) throw new Error("Missing pending career card");
							// Initial reads cannot know the number of saved entries. Empty cards match the skeleton;
							// populated cards grow naturally instead of retaining a fictitious capacity.
							if (!populated)
								for (const key of ["x", "y", "width", "height"] as const)
									expect(Math.abs(ready[key] - pending[key]), `Empty career card ${index} ${key}`).toBeLessThanOrEqual(
										1,
									);
						}
						expect(
							await page.locator('main [data-slot="section-card"]').evaluateAll((cards) =>
								cards.map((card) => {
									const style = getComputedStyle(card);
									const children = [...card.children];
									const content = children.reduce((height, child) => height + child.getBoundingClientRect().height, 0);
									const edges = [
										style.paddingTop,
										style.paddingBottom,
										style.borderTopWidth,
										style.borderBottomWidth,
									].reduce((sum, value) => sum + Number.parseFloat(value), 0);
									return (
										Math.abs(
											card.getBoundingClientRect().height -
												content -
												edges -
												Number.parseFloat(style.rowGap) * (children.length - 1),
										) <= 1
									);
								}),
							),
						).toEqual([true, true, true, true, true]);
					}
					if (pendingCard && cardSelector) {
						const readyCard = await page.locator(cardSelector).boundingBox();
						if (!readyCard) throw new Error("Loaded document card is missing");
						expect(Math.abs(readyCard.width - pendingCard.width)).toBeLessThanOrEqual(1);
						expect(Math.abs(readyCard.height - pendingCard.height)).toBeLessThanOrEqual(1);
					}
					expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				} finally {
					release();
				}
			});
		}
	}
}

test("reduced motion makes query placeholders static", async ({ authPage: page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	let release!: () => void;
	const hold = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/rpc/**", async (route) => {
		if (!/\/(flags|get-session|personalWorkspace)\//.test(route.request().url())) await hold;
		await route.continue();
	});
	try {
		await page.goto("/dashboard/career/information");
		const block = page.locator('main [data-visible="true"] [data-slot="skeleton"]').first();
		await expect(block).toBeVisible();
		expect(await block.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
	} finally {
		release();
	}
});

test("related Today reads arrive together without moving sibling content", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		(globalThis as typeof globalThis & { queryCLS: number }).queryCLS = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
				if (!shift.hadRecentInput) (globalThis as typeof globalThis & { queryCLS: number }).queryCLS += shift.value;
			}
		}).observe({ type: "layout-shift", buffered: true });
	});
	let release!: () => void;
	const hold = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/rpc/**", async (route) => {
		if (!/\/(flags|personalWorkspace)\//.test(route.request().url())) await hold;
		await route.continue();
	});
	try {
		await page.goto("/dashboard/career");
		await expect(page.locator('main [data-visible="true"] [data-slot="skeleton"]').first()).toBeVisible();
		await page.evaluate(() => {
			(globalThis as typeof globalThis & { queryCLS: number }).queryCLS = 0;
		});
		release();
		await expect(page.locator('main [data-slot="skeleton-region"]')).toHaveCount(0);
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		expect(await page.evaluate(() => (globalThis as typeof globalThis & { queryCLS: number }).queryCLS)).toBeLessThan(
			0.01,
		);
	} finally {
		release();
	}
});
