import { writeFile } from "node:fs/promises";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

type LandingWindow = typeof globalThis & {
	landingFrames: { mains: number; snapshot: boolean }[];
	landingSnapshots: number;
};

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} the landing hero CTA and history never overlap shells in either theme`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.addInitScript(() => {
			const w = globalThis as LandingWindow;
			w.landingFrames = [];
			w.landingSnapshots = 0;
			const start = document.startViewTransition.bind(document);
			document.startViewTransition = (...args: Parameters<typeof start>) => {
				w.landingSnapshots++;
				return start(...args);
			};
			const sample = () => {
				w.landingFrames.push({
					mains: [...document.querySelectorAll("main")].filter((el) => el.getBoundingClientRect().width).length,
					snapshot: document.documentElement.matches(":active-view-transition"),
				});
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		});
		for (const theme of ["light", "dark"]) {
			await page.context().addCookies([{ name: "theme", value: theme, url: baseURL }]);
			await page.goto("/");
			await settleScreen(page);
			const documentId = await page.evaluate(() => performance.timeOrigin);
			// Click the hero itself, rather than the header's CTA with the same destination.
			const cta = page
				.locator("main")
				.getByRole("link", {
					name: locale === "ar-SA" ? "قم ببناء سيرتك الذاتية" : "Build your resume",
					exact: true,
				})
				.first();
			await expect(cta).toBeVisible();
			await cta.click();
			await expect(page).toHaveURL(/\/dashboard$/u);
			await expect(page.locator("main h1")).toBeVisible();
			await settleScreen(page);
			await page.goBack();
			await expect(page).toHaveURL(`${baseURL}/`);
			await expect(cta).toBeVisible();
			await settleScreen(page);
			await page.goForward();
			await expect(page).toHaveURL(/\/dashboard$/u);
			await expect(page.locator("main h1")).toBeVisible();
			await settleScreen(page);
			expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
			const record = await page.evaluate(() => ({
				frames: (globalThis as LandingWindow).landingFrames,
				snapshots: (globalThis as LandingWindow).landingSnapshots,
			}));
			expect(record.snapshots).toBe(0);
			expect(record.frames.length).toBeGreaterThan(5);
			expect(record.frames.every((frame) => frame.mains <= 1 && !frame.snapshot)).toBe(true);
			await writeFile(info.outputPath(`hero-${theme}-frames.json`), JSON.stringify(record));
		}
	});
}
