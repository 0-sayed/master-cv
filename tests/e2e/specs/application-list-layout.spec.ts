import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { demoAccountName, demoCredentials } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { detectAuthenticatedPage } from "../fixtures/design-detector";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("dense grouped applications keep columns stable in Arabic and English on desktop and phone", async ({
	page,
	baseURL,
}, info) => {
	test.setTimeout(300_000);
	if (!baseURL) throw new Error("The isolated browser server URL is required.");
	const seed = execFileSync(process.execPath, ["tooling/local/demo-seed.mjs"], {
		encoding: "utf8",
		env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
	});
	expect(seed).toMatch(/Demo (created|skipped):/);
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	const metrics: unknown[] = [];
	const touch = await page.context().newCDPSession(page);
	for (const locale of ["ar-SA", "en-US"])
		for (const width of [1440, 640, 390]) {
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.setViewportSize({ width, height: 950 });
			await touch.send("Emulation.setTouchEmulationEnabled", { enabled: width === 390 });
			await page.goto(`/dashboard/applications?view=list&closed=true&locale=${locale}`);
			await settleScreen(page);
			await page.evaluate(() => document.fonts.ready);
			const table = page.getByRole("table");
			await expect(table.locator("tbody tr[aria-selected]")).toHaveCount(20);
			const applicationCount = await table.locator("tbody tr[aria-selected]").count();
			await expect(page.getByRole("columnheader", { name: /^(Stage|المرحلة)$/ })).toHaveCount(0);
			await page.locator("#main-content").evaluate((element) => {
				element.scrollTop = 0;
			});
			const before = await table
				.locator("col")
				.evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
			if (width !== 390) {
				expect(before).toHaveLength(width === 640 ? 4 : 5);
				const headerGeometry = await table.locator("thead th").evaluateAll((headers) =>
					headers.map((header) => ({
						text: header.textContent,
						width: header.getBoundingClientRect().width,
						x: header.getBoundingClientRect().x,
						display: getComputedStyle(header).display,
						table: header.closest("table")?.outerHTML.slice(0, 500),
					})),
				);
				await writeFile(info.outputPath(`headers-${locale}-${width}.json`), JSON.stringify(headerGeometry, null, 2));
				headerGeometry.forEach((header, index) => expect(Math.abs(header.width - before[index])).toBeLessThan(1));
				const cells = await table
					.locator("tbody tr[aria-selected]")
					.first()
					.locator("td")
					.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
				cells.forEach((width, index) => expect(Math.abs(width - before[index])).toBeLessThan(1));
				const headers = await table
					.locator("thead th")
					.evaluateAll((headers) => headers.map((header) => getComputedStyle(header).whiteSpace));
				expect(headers.every((value) => value === "nowrap")).toBe(true);
				const sent = table.getByRole("link", { name: /^(Sent CV:|السيرة المرسلة:)/u }).first();
				await sent.focus();
				await page.keyboard.press("Shift+Tab");
				await page.keyboard.press("Tab");
				await expect(sent).toBeFocused();
				await expect(page.getByRole("tooltip")).toBeVisible();
				await expect(page.getByRole("tooltip")).toHaveText((await sent.getAttribute("aria-label")) ?? "");
				await page.keyboard.press("Escape");
				await page.locator("h1").click();
			}
			const englishTitle = table
				.locator('button > span[dir="auto"][title]')
				.filter({ hasText: /^[A-Za-z]/ })
				.first();
			await expect(englishTitle).toHaveCSS("direction", "ltr");
			await expect(englishTitle).toHaveCSS("text-overflow", "ellipsis");
			await expect(englishTitle).toHaveCSS("white-space", "nowrap");
			await page.locator("#main-content").evaluate((element) => {
				element.scrollTop = 0;
			});
			await settleScreen(page);
			await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
			await page.screenshot({ path: info.outputPath(`applications-${locale}-${width}-open.png`) });
			await table.getByRole("button", { expanded: true }).first().click();
			const after = await table
				.locator("col")
				.evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
			after.forEach((width, index) => expect(Math.abs(width - before[index])).toBeLessThan(1));
			while (await table.getByRole("button", { expanded: true }).count())
				await table.getByRole("button", { expanded: true }).first().click();
			await expect(table.locator("thead")).toHaveCount(width === 390 ? 0 : 1);
			await expect(table.locator("tbody tr[aria-selected]")).toHaveCount(0);
			const groupCount = await table.locator("tbody tr").count();
			await expect(table.locator("td")).toHaveCount(width === 390 ? 0 : groupCount * (before.length - 2));
			if (width !== 390) {
				const summary = await table
					.locator("tbody tr")
					.first()
					.locator("th, td")
					.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
				expect(Math.abs((summary[0] ?? 0) - (before[0] ?? 0) - (before[1] ?? 0))).toBeLessThan(1);
				summary.slice(1).forEach((size, index) => expect(Math.abs(size - before[index + 2])).toBeLessThan(1));
			}
			const geometry = await table.evaluate((table) => ({
				height: table.getBoundingClientRect().height,
				width: table.getBoundingClientRect().width,
				overflow: document.documentElement.scrollWidth > innerWidth,
			}));
			expect(geometry.height).toBeLessThan(400);
			expect(geometry.overflow).toBe(false);
			await page.locator("#main-content").evaluate((element) => {
				element.scrollTop = 0;
			});
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath(`applications-${locale}-${width}-collapsed.png`) });
			await table.getByRole("button", { expanded: false }).first().click();
			if (width !== 390) await expect(table.locator("thead")).toBeVisible();
			while (await table.getByRole("button", { expanded: false }).count())
				await table.getByRole("button", { expanded: false }).first().click();
			await expect(table.locator("tbody tr[aria-selected]")).toHaveCount(20);
			metrics.push({ locale, width, applications: applicationCount, before, after, geometry });
		}
	await touch.detach();
	await writeFile(info.outputPath("applications-layout-metrics.json"), JSON.stringify(metrics, null, 2));
	await detectAuthenticatedPage(page, baseURL, info, {
		name: "applications",
		pathname: "/dashboard/applications?view=list&closed=true",
		readPath: "/applications/list",
	});
});
