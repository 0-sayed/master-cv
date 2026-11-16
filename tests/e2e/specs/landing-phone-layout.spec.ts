import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) =>
	a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
const box = (element: Element): Box => {
	const rect = element.getBoundingClientRect();
	return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
};

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [320, 390])
		test(`landing keeps a one-row header, readable job rows and separate hero chips on phones ${locale} ${width}`, async ({
			page,
		}) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.setViewportSize({ width, height: 844 });
			await page.goto(`/?locale=${locale}`);
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			// One header row: no second line of controls eating the first screen.
			expect(
				await page.locator("header > div").evaluate((element) => element.getBoundingClientRect().height),
			).toBeLessThanOrEqual(80);
			// Job rows: the status sits under its requirement, never on top of it.
			for (const row of await page.locator('section[aria-labelledby="tailor-title"] ul.divide-y > li').all()) {
				const [title, badge] = await Promise.all([
					row.locator("p.type-section").evaluate(box),
					row.locator('[data-slot="badge"]').evaluate(box),
				]);
				expect(overlaps(title, badge)).toBe(false);
			}
			// Hero status chips at rest (reduced motion): none covers another or the CV's skills.
			const { chips, skills } = await page.evaluate(() => ({
				chips: [...document.querySelectorAll("[data-live-cv] span.rounded-full.shadow-e2")].map((element) => {
					const rect = element.getBoundingClientRect();
					return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
				}),
				skills: [...document.querySelectorAll("[data-live-cv] ul.flex li")].map((element) => {
					const rect = element.getBoundingClientRect();
					return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
				}),
			}));
			for (const [index, chip] of chips.entries()) {
				for (const other of chips.slice(index + 1)) expect(overlaps(chip, other)).toBe(false);
				for (const skill of skills) expect(overlaps(chip, skill)).toBe(false);
			}
		});

test("help header stays on one row on a 320px phone", async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 844 });
	await page.goto("/help?locale=ar-SA");
	await settleScreen(page);
	expect(
		await page.locator("header > div").evaluate((element) => element.getBoundingClientRect().height),
	).toBeLessThanOrEqual(80);
});
