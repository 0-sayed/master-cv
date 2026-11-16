import type { TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

type LabWindow = typeof globalThis & { publicLab: { lcp: number; cls: number; logoPlays: number } };
async function evidencePath(info: TestInfo, name: string) {
	const directory = process.env.E2E_PUBLIC_EVIDENCE_DIR ?? info.outputDir;
	await mkdir(directory, { recursive: true });
	return resolve(directory, name);
}
const pages = [
	["home", "/"],
	["privacy", "/privacy-and-terms?tab=privacy"],
	["terms", "/privacy-and-terms?tab=terms"],
	["help", "/help"],
] as const;
for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		for (const [name, path] of pages) {
			test(`public pages fit both directions and retain shared shell geometry ${name} ${locale} ${width}`, async ({
				page,
				baseURL,
			}, info) => {
				await page.context().clearCookies();
				await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
				await page.emulateMedia({ colorScheme: "light" });
				await page.addInitScript(() => {
					const lab = { lcp: 0, cls: 0, logoPlays: 0 };
					(globalThis as LabWindow).publicLab = lab;
					new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) lab.lcp = entry.startTime;
					}).observe({ type: "largest-contentful-paint", buffered: true });
					new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) {
							const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
							if (!shift.hadRecentInput) lab.cls += shift.value;
						}
					}).observe({ type: "layout-shift", buffered: true });
					document.addEventListener("animationstart", (event) => {
						if (
							event.animationName === "brand-approved" &&
							(event.target as Element).closest('header [data-slot="brand-mark"]')
						)
							lab.logoPlays++;
					});
				});
				const external: string[] = [];
				page.on("request", (request) => {
					const url = new URL(request.url());
					if (url.protocol.startsWith("http") && url.origin !== baseURL) external.push(url.href);
				});
				// Cookie-free Arabic uses the actual default, not a query override.
				await page.goto(locale === "ar-SA" ? path : `${path}${path.includes("?") ? "&" : "?"}locale=en-US`);
				await settleScreen(page);
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				const geometry = await page.evaluate(() => {
					// The landing's sections are full-bleed; their content container carries the body edges.
					const main = document.querySelector("main .landing-container") ?? document.querySelector("main");
					const header = document.querySelector("header > div");
					if (!main || !header) throw new Error("Missing public shell");
					const box = (element: Element) => {
						const r = element.getBoundingClientRect();
						const style = getComputedStyle(element);
						return {
							x: r.x,
							width: r.width,
							start: r.x + Number.parseFloat(style.paddingLeft),
							end: r.right - Number.parseFloat(style.paddingRight),
						};
					};
					return {
						main: box(main),
						header: box(header),
						width: innerWidth,
						headerTop: header.getBoundingClientRect().top,
						bodyChildren: [...document.body.children].map((el) => ({
							tag: el.tagName,
							id: el.id,
							top: el.getBoundingClientRect().top,
							height: el.getBoundingClientRect().height,
						})),
						scrollWidth: document.documentElement.scrollWidth,
						font: getComputedStyle(main).fontFamily,
						fonts: {
							arabic: document.fonts.check('16px "Noto Sans Arabic"'),
							english: document.fonts.check('16px "Noto Sans"'),
						},
						controls: [...document.querySelectorAll('header a, header button, main [role="tab"], main a')]
							.filter((el) => el.getBoundingClientRect().width)
							.map((el) => ({
								label: el.textContent,
								width: el.getBoundingClientRect().width,
								height: el.getBoundingClientRect().height,
								fits: el.scrollWidth <= el.clientWidth + 1,
							})),
						lab: (globalThis as LabWindow).publicLab,
						resources: (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).map(
							({ name, transferSize, initiatorType }) => ({ name, transferSize, initiatorType }),
						),
					};
				});
				const prefix = `${name}-${locale}-${width}`;
				await page.screenshot({ path: await evidencePath(info, `${prefix}.png`), fullPage: true });
				await writeFile(
					await evidencePath(info, `${prefix}.json`),
					JSON.stringify(
						{
							profile: "Local Chromium, no network or CPU throttling; viewport only. Lab values, not field INP.",
							...geometry,
							external,
						},
						null,
						2,
					),
				);
				expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
				expect(geometry.headerTop).toBe(0);
				expect(geometry.header.start).toBeCloseTo(geometry.main.start, 0);
				expect(geometry.header.end).toBeCloseTo(geometry.main.end, 0);
				expect(geometry.fonts).toEqual({ arabic: true, english: true });
				for (const control of geometry.controls) {
					expect(control.height, control.label ?? "control").toBeGreaterThanOrEqual(44);
					expect(control.fits, control.label ?? "control").toBe(true);
				}
				expect(external).toEqual([]);
				expect(geometry.resources.some((resource) => resource.initiatorType === "video")).toBe(false);
				expect(geometry.lab.lcp).toBeGreaterThan(0);
				expect(geometry.lab.lcp).toBeLessThanOrEqual(2500);
				expect(geometry.lab.cls).toBeLessThanOrEqual(0.1);
				if (name === "home") {
					expect(geometry.lab.logoPlays).toBe(1);
					await page.keyboard.press("Tab");
					await expect(page.locator('a[href="#main-content"]')).toBeFocused();
					await page.screenshot({ path: await evidencePath(info, `${prefix}-focus.png`) });
					await page.keyboard.press("Enter");
					await expect(page.locator("main")).toBeFocused();
					// The bilingual example always opens on Arabic, whatever the interface language.
					await expect(page.locator('[data-example-language="ar"]')).toContainText("عبدالله القحطاني");
					const question = page.getByRole("button", {
						name: locale === "ar-SA" ? "هل يمكنني استيراد سيرتي الحالية؟" : "Can I import my current CV?",
						exact: true,
					});
					await question.scrollIntoViewIfNeeded();
					const start = await page.evaluate(() => performance.now());
					await question.click();
					const latency = await page.evaluate(
						() => new Promise<number>((resolveFrame) => requestAnimationFrame(() => resolveFrame(performance.now()))),
					);
					await expect(question).toHaveAttribute("aria-expanded", "true");
					expect(latency - start).toBeLessThanOrEqual(200);
					await writeFile(
						await evidencePath(info, `${prefix}-interaction.json`),
						JSON.stringify({ scriptedClickToFrameMs: latency - start, fieldINP: false }),
					);
					await settleScreen(page);
					await page.screenshot({ path: await evidencePath(info, `${prefix}-faq-open.png`), fullPage: true });
					await page.getByRole("link", { name: "Master CV", exact: true }).hover();
					expect(await page.evaluate(() => (globalThis as LabWindow).publicLab.logoPlays)).toBe(1);
					await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL ?? "http://localhost:3000" }]);
					await page.reload();
					await settleScreen(page);
					await page.screenshot({ path: await evidencePath(info, `${prefix}-dark.png`), fullPage: true });
				}
			});
		}
test("reduced motion and interface switching preserve public content and saved facts", async ({
	authPage: page,
}, info) => {
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: "Synthetic language isolation", tags: [], withSampleData: true },
	});
	await expect(created).toBeOK();
	const id = await created.json();
	const before = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await settleScreen(page);
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
	await expect(page.locator('[data-slot="loading-screen"]')).toHaveCount(0);
	const after = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
	expect(after.data).toEqual(before.data);
	expect(after.updatedAt).toEqual(before.updatedAt);
	await page.screenshot({ path: await evidencePath(info, "home-reduced-motion.png"), fullPage: true });
});
