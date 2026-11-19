import type { Page, Response, TestInfo } from "@playwright/test";
import { rpcRequestPaths } from "./rpc-failure";
import { settleScreen } from "./screen";
import { expect } from "./test";

/** Audit the actual authenticated page without a proxy, external CLI, or another browser. */
export async function detectAuthenticatedPage(
	page: Page,
	baseURL: string,
	testInfo: TestInfo,
	target: { name: string; pathname: string; readPath: string },
) {
	const evidence = [];
	for (const locale of ["ar-SA", "en-US"] as const)
		for (const width of [1440, 390]) {
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.setViewportSize({ width, height: 950 });
			let reads = 0;
			const onResponse = (response: Response) => {
				if (rpcRequestPaths(response.request()).some((path) => path.includes(target.readPath)) && response.ok())
					reads++;
			};
			page.on("response", onResponse);
			try {
				await page.goto(`${target.pathname}${target.pathname.includes("?") ? "&" : "?"}locale=${locale}`);
				await settleScreen(page);
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				await expect(page.locator("#main-content")).toBeVisible();
				await expect.poll(() => reads, "The actual page must read its authenticated data").toBeGreaterThan(0);
				const metrics = await page.evaluate(() => ({
					width: innerWidth,
					scrollWidth: document.documentElement.scrollWidth,
					mainCount: document.querySelectorAll("main").length,
				}));
				expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
				expect(metrics.mainCount).toBe(1);
				evidence.push({ locale, ...metrics, authenticatedReads: reads });
			} finally {
				page.off("response", onResponse);
			}
		}
	await testInfo.attach(`${target.name}-authenticated-layout`, {
		body: JSON.stringify(evidence),
		contentType: "application/json",
	});
}
