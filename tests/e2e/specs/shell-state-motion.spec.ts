import { writeFile } from "node:fs/promises";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

type OverlayFrame = { box: number[]; viewportX: number; direction: string };

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} overlays and preference switches leave the shell stationary`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		test.setTimeout(120_000);
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		for (const width of [1440, 1920, 768, 390])
			for (const theme of ["light", "dark"]) {
				await page.context().addCookies([
					{ name: "locale", value: locale, url: baseURL },
					{ name: "theme", value: theme, url: baseURL },
				]);
				await page.setViewportSize({ width, height: 900 });
				await page.goto("/dashboard/career/information");
				await expect(
					page.getByRole("button", { name: locale === "ar-SA" ? "إضافة خبرة" : "Add experience", exact: true }),
				).toBeVisible();
				await settleScreen(page);
				await page.evaluate(() => {
					const w = globalThis as typeof globalThis & { stopOverlayFrames: () => OverlayFrame[] };
					const frames: OverlayFrame[] = [];
					let running = true;
					const sample = () => {
						const el = document.querySelector(".shell-toolbar");
						if (!el) throw new Error("Shell toolbar missing");
						if (el) {
							const r = el.getBoundingClientRect();
							const main = document.querySelector("main");
							if (!main) throw new Error("Shell main missing");
							// Switching AR/EN intentionally mirrors the sidebar. Header geometry stays fixed inside main.
							frames.push({
								box: [r.x - main.getBoundingClientRect().x, r.y, r.width, r.height],
								viewportX: r.x,
								direction: document.documentElement.dir,
							});
						}
						if (running) requestAnimationFrame(sample);
					};
					requestAnimationFrame(sample);
					w.stopOverlayFrames = () => {
						running = false;
						return frames;
					};
				});
				await page
					.getByRole("button", { name: locale === "ar-SA" ? "إضافة خبرة" : "Add experience", exact: true })
					.click();
				await expect(page.getByRole("dialog")).toHaveCount(1);
				await settleScreen(page);
				await page.keyboard.press("Escape");
				await expect(page.getByRole("dialog")).toHaveCount(0);
				await page.locator('[data-slot="shell-search"]').click();
				await expect(page.getByRole("dialog")).toHaveCount(1);
				await settleScreen(page);
				await page.keyboard.press("Escape");
				const themeButton = page
					.locator('.shell-toolbar button[data-size="header-icon"]:not([data-slot="shell-search"])')
					.filter({ visible: true });
				if (width >= 640) {
					await themeButton.click();
					if (theme === "light") await expect(page.locator("html")).toHaveClass(/dark/);
					else await expect(page.locator("html")).not.toHaveClass(/dark/);
				}
				await page.locator('.shell-toolbar button[data-size="language"]').click();
				await expect(page.locator("html")).toHaveAttribute("lang", locale === "ar-SA" ? "en-US" : "ar-SA");
				await settleScreen(page);
				await page.locator('.shell-toolbar button[data-size="language"]').click();
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await settleScreen(page);
				const frames = await page.evaluate(() =>
					(globalThis as typeof globalThis & { stopOverlayFrames: () => OverlayFrame[] }).stopOverlayFrames(),
				);
				const record = info.outputPath(`${width}-${theme}-overlay-frames.json`);
				await writeFile(record, JSON.stringify(frames));
				await info.attach(`${width}-${theme}-overlay-frames`, { path: record, contentType: "application/json" });
				expect(frames.length).toBeGreaterThan(5);
				expect(
					frames.every((frame) => JSON.stringify(frame.box) === JSON.stringify(frames[0]?.box)),
					`${width} ${theme}: header boxes inside main must have 0px delta`,
				).toBe(true);
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
				).toBe(true);
			}
	});

	test(`${locale} reduced motion has no route snapshot and Arabic actions contain no inherited verb labels`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.goto("/dashboard");
		await page.evaluate(() => {
			document.startViewTransition = () => {
				throw new Error("Reduced-motion navigation must not start a snapshot transition");
			};
		});
		for (const route of [
			"/dashboard/career/information",
			"/dashboard/applications",
			"/dashboard/settings",
			"/dashboard",
		]) {
			await page.locator(`aside a[href="${route}"]`).click();
			await settleScreen(page);
			if (locale === "ar-SA")
				for (const label of await page.getByRole("button").allTextContents())
					expect(label.trim()).not.toMatch(/^(?:يتغير|يمسح|يصدر|يحفظ|يضيف|Check)(?:…|\.\.\.)?$/u);
		}
	});
}
