import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("built shell and install manifest use Master CV and inline loader mark", async ({ request }) => {
	const index = await readFile(resolve("apps/web/dist/index.html"), "utf8");
	const manifestFile = await readFile(resolve("apps/web/dist/manifest.webmanifest"), "utf8");
	for (const content of [index, manifestFile]) {
		expect.soft(content).not.toMatch(/Reactive Resume|\/icon\/light\.svg/i);
	}
	expect(index).toMatch(/<title>Master CV/);
	expect(index).toContain('class="initial-loader__mark"');
	expect(index).toContain('mask="url(#boot-tick)"');
	const manifest = JSON.parse(manifestFile);
	expect(manifest.name).toBe("Master CV");
	expect(manifest.short_name).toBe("Master CV");
	for (const icon of manifest.icons) await expect(await request.get(`/${icon.src}`)).toBeOK();
	const served = await request.get("/auth/login");
	const html = await served.text();
	expect(html).not.toMatch(/Reactive Resume|\/icon\/light\.svg/i);
	expect(html).toContain('name="application-name" content="Master CV"');
	expect(html).toContain('name="apple-mobile-web-app-title" content="Master CV"');
});

for (const theme of ["light", "dark"] as const) {
	test(`${theme} first paint displays the square Master CV mark before the application loads`, async ({
		browser,
		baseURL,
	}, testInfo) => {
		const context = await browser.newContext({ baseURL, colorScheme: theme });
		const page = await context.newPage();
		try {
			// Keep the inline theme bootstrap; hold the app bundle to capture the real startup screen.
			await page.route(/\/assets\/.*\.js(?:\?.*)?$/, (route) => route.abort());
			await page.goto("/auth/login");
			const mark = page.locator("#initial-loader svg.initial-loader__mark");
			await expect(mark).toBeVisible();
			const box = await mark.boundingBox();
			expect(box?.width).toBe(48);
			expect(box?.height).toBe(48);
			await page.screenshot({ path: testInfo.outputPath(`startup-${theme}.png`) });
		} finally {
			await context.close();
		}
	});
}

for (const locale of ["ar-SA", "en-US"]) {
	test(`${locale} homepage and browser metadata identify Master CV with an explicit upstream credit`, async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(`/?locale=${locale}`);
		await expect(page).toHaveTitle(/Master CV/);
		await expect(page.locator("html")).toHaveAttribute("lang", locale);
		await settleScreen(page);
		await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Master CV");
		await expect(page.locator("[data-upstream-credit]")).toContainText("Reactive Resume");
		expect(
			await page.locator("body").evaluate((body) => {
				const copy = body.cloneNode(true) as HTMLElement;
				copy.querySelectorAll("[data-upstream-credit], script").forEach((node) => node.remove());
				return copy.textContent;
			}),
		).not.toMatch(/Reactive Resume|REACTIVE RESUME/);
		expect(await page.locator('img[src^="/icon/"], img[src^="/logo/"]').count()).toBe(0);
	});
}

test("not-found browser shell and public text metadata use Master CV", async ({ request }) => {
	const error = await request.get("/missing-brand-audit-page");
	expect(error.status()).toBe(404);
	expect(await error.text()).not.toContain("Reactive Resume");
	const llms = await request.get("/llms.txt");
	expect(await llms.text()).toMatch(/^# Master CV/);
});
