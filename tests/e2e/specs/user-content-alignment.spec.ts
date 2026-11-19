import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test(`user content follows the ${locale} interface start edge at ${width}`, async ({ page }) => {
			await page.setViewportSize({ width, height: 950 });
			await page.goto(`/?locale=${locale}`);
			const direction = locale === "ar-SA" ? "rtl" : "ltr";
			await expect(page.locator("html")).toHaveAttribute("dir", direction);
			await page.evaluate(() => document.fonts.ready);
			// Exercise the shared CSS on headings, descriptions, and logical-start links.
			// These are UI specimens only; no saved career or document data changes.
			const measurements = await page.evaluate(
				({ direction }) => {
					const host = document.createElement("section");
					host.dir = direction;
					host.style.width = "280px";
					host.style.textAlign = "start";
					document.body.append(host);
					try {
						return ["h3", "p", "a"].map((tag) => {
							const block = document.createElement(tag);
							block.dir = "auto";
							block.style.display = "block";
							if (tag === "a") block.className = "text-start";
							block.textContent = direction === "rtl" ? "SQL" : "العربية";
							host.append(block);
							const range = document.createRange();
							range.selectNodeContents(block);
							const text = range.getBoundingClientRect();
							const box = block.getBoundingClientRect();
							return {
								dir: block.dir,
								distance: direction === "rtl" ? box.right - text.right : text.left - box.left,
							};
						});
					} finally {
						host.remove();
					}
				},
				{ direction },
			);
			for (const { dir, distance } of measurements) {
				expect(dir).toBe("auto");
				expect(Math.abs(distance)).toBeLessThan(1);
			}
		});
