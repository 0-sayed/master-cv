import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test(`${locale} ${width} content scrolling, centered welcome and viewport editors`, async ({
			authPage: page,
			baseURL,
		}, info) => {
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			await page.goto("/dashboard/welcome");
			await settleScreen(page);
			const content = page.locator('[data-slot="dashboard-content"]');
			const column = await content.boundingBox();
			if (!column) throw new Error("Welcome column missing");
			const canvasWidth = await page.evaluate(() => document.documentElement.clientWidth);
			expect(Math.abs(column.x + column.width / 2 - canvasWidth / 2)).toBeLessThanOrEqual(1);
			expect(
				await page.locator("html").evaluate((root) => ({
					overflow: getComputedStyle(root).overflowY,
					gutter: getComputedStyle(root).scrollbarGutter,
				})),
			).toEqual({ overflow: "auto", gutter: "auto" });
			if (width === 1440)
				expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
			await page.screenshot({ path: info.outputPath("welcome.png"), fullPage: true });

			await page.goto("/dashboard/career/information");
			await expect(page.locator('[data-slot="section-card"]')).toHaveCount(5);
			await expect(page.locator('[data-slot="skeleton-region"]')).toHaveCount(0);
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath("career-empty.png"), fullPage: true });

			// Dashboard overflow belongs to main; chrome and the document stay at the viewport origin.
			await page.setViewportSize({ width, height: 480 });
			await page.goto("/dashboard/settings/account");
			await settleScreen(page);
			await page.locator("main").evaluate((main) => main.scrollTo(0, main.scrollHeight));
			await expect.poll(() => page.locator("main").evaluate((main) => main.scrollTop)).toBeGreaterThan(0);
			expect(await page.evaluate(() => scrollY)).toBe(0);
			const header = await page.locator("main > header").boundingBox();
			expect(header?.y).toBe(0);
			if (width === 1440) {
				const sidebar = await page.getByRole("complementary").boundingBox();
				expect(sidebar?.y).toBe(0);
				expect(sidebar?.width).toBe(236);
			}
			const savedScroll = await page.locator("main").evaluate((main) => main.scrollTop);
			await page.screenshot({ path: info.outputPath("dashboard-scrolled.png"), fullPage: false });
			await page.locator('a[href="/dashboard/career/information"]').filter({ visible: true }).first().click();
			await settleScreen(page);
			await expect.poll(() => page.locator("main").evaluate((main) => main.scrollTop)).toBe(0);
			await page.goBack();
			await expect
				.poll(() => page.locator("main").evaluate((main, offset) => Math.abs(main.scrollTop - offset), savedScroll))
				.toBeLessThanOrEqual(1);

			await page.setViewportSize({ width, height: 900 });
			const resume = await page.request.post("/api/openapi/resumes", {
				data: { name: "Synthetic layout CV", tags: [], withSampleData: false },
			});
			await expect(resume).toBeOK();
			const letter = await page.request.post("/api/openapi/cover-letters", {
				data: { name: "Synthetic layout letter" },
			});
			await expect(letter).toBeOK();
			for (const [name, path] of [
				["cv-editor", `/builder/${await resume.json()}`],
				["letter-editor", `/builder/letter/${((await letter.json()) as { id: string }).id}`],
			] as const) {
				await page.goto(path);
				await settleScreen(page);
				await expect(page.getByRole("banner")).toBeVisible();
				await expect(page.locator("main")).toBeAttached();
				if (width === 1440) await expect(page.locator("main")).toBeVisible();
				else await expect(page.getByRole("tabpanel")).toBeVisible();
				expect(
					await page.evaluate(() => ({
						height: document.documentElement.scrollHeight,
						viewport: innerHeight,
						scroll: scrollY,
					})),
				).toEqual({ height: 900, viewport: 900, scroll: 0 });
				await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: false });
			}
		});

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 1780, 390])
		test(`${locale} ${width} settings preserve dashboard chrome without document scrolling`, async ({
			authPage: page,
			baseURL,
		}, info) => {
			test.setTimeout(90_000);
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			let baseline: unknown;
			for (const route of [
				"/dashboard/applications",
				"/dashboard/settings",
				"/dashboard/settings/account",
				"/dashboard/settings/preferences",
			]) {
				await page.goto(`${route}?locale=${locale}`);
				await expect(page.locator("main h1").first()).toBeVisible();
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				await settleScreen(page);
				const geometry = await page.evaluate(() => {
					const box = (selector: string) => {
						const element = document.querySelector(selector);
						if (!element) return null;
						const { x, y, width, height } = element.getBoundingClientRect();
						return { x, y, width, height };
					};
					return {
						header: box("main > header"),
						actions: [...document.querySelectorAll('[data-slot="dashboard-header-controls"] button')].map((button) => {
							const { x, y, width, height } = button.getBoundingClientRect();
							return { x, y, width, height };
						}),
						search: box('[data-slot="dashboard-header-search"]'),
						sidebar: box("aside"),
						bottom: box('[data-slot="app-bottom-nav"]'),
					};
				});
				baseline ??= geometry;
				expect.soft(geometry, route).toEqual(baseline);
				expect.soft(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), route).toBe(true);
				expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
				await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
				expect.soft(await page.evaluate(() => scrollY), route).toBe(0);
				await page.screenshot({ path: info.outputPath(`${route.split("/").at(-1)}.png`) });
			}
		});
