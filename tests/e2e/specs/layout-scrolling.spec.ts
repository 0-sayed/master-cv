import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test(`${locale} ${width} native scrolling, centered welcome and viewport editors`, async ({
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

			// The existing settings surface scrolls the document, so sticky chrome and history use that same owner.
			await page.goto("/dashboard/settings");
			await settleScreen(page);
			await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
			await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
			const header = await page.locator("main > header").boundingBox();
			expect(header?.y).toBe(0);
			if (width === 1440) {
				const sidebar = await page.getByRole("complementary").boundingBox();
				expect(sidebar?.y).toBe(0);
				expect(sidebar?.width).toBe(236);
			}
			const savedScroll = await page.evaluate(() => scrollY);
			await page.screenshot({ path: info.outputPath("dashboard-scrolled.png"), fullPage: false });
			await page.locator('a[href="/dashboard/career/information"]').filter({ visible: true }).first().click();
			await settleScreen(page);
			await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
			await page.goBack();
			await expect.poll(() => page.evaluate(() => Math.abs(scrollY - savedScroll))).toBeLessThanOrEqual(1);

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
				await expect(page.locator("main")).toBeVisible();
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
