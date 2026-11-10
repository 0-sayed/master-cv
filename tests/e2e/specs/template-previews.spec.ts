import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} template picker loads all localized sample previews`, async ({
			authPage: page,
			baseURL,
		}, info) => {
			test.setTimeout(90_000);
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			const created = await page.request.post("/api/openapi/resumes", {
				data: { name: `Template samples ${locale} ${width}`, tags: [], withSampleData: false },
			});
			expect(created.ok()).toBe(true);
			await page.goto(`/builder/${await created.json()}`);
			await page
				.getByRole(width === 390 ? "button" : "tab", { name: locale === "ar-SA" ? "التصميم" : "Design", exact: true })
				.click();
			const images = page.locator('[data-slot="template-thumbnail"] .template-current');
			await expect(images).toHaveCount(18);
			const expectedPrefix = `/templates/thumb/${locale === "ar-SA" ? "" : "en-US/"}`;
			const sources = await images.evaluateAll(async (elements) => {
				return Promise.all(
					elements.map(async (element) => {
						const image = element as HTMLImageElement;
						await image.decode();
						return { src: image.getAttribute("src"), width: image.naturalWidth, height: image.naturalHeight };
					}),
				);
			});
			for (const image of sources) {
				expect(image.src).toMatch(new RegExp(`^${expectedPrefix}[a-z]+\\.webp$`));
				expect(image.width).toBe(344);
				expect(image.height).toBeGreaterThan(400);
			}
			const alternates = page.locator('[data-slot="template-thumbnail"] .template-alternate');
			await expect(alternates).toHaveCount(18);
			const otherPrefix = `/templates/thumb/${locale === "ar-SA" ? "en-US/" : ""}`;
			for (let index = 0; index < 18; index++) {
				const alternate = alternates.nth(index);
				await expect(alternate).toHaveAttribute("data-ready", "true");
				expect(await alternate.getAttribute("src")).toBe(otherPrefix + sources[index]?.src?.split("/").at(-1));
			}
			await page.evaluate(() => document.fonts.ready);
			await page.screenshot({ path: info.outputPath(`picker-${locale}-${width}.png`) });
		});
	}
}
