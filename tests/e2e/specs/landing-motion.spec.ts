import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

// Decorative landing motion may only move or fade layers; it must never animate layout.
const compositorProperties = new Set([
	"translate",
	"scale",
	"rotate",
	"transform",
	"opacity",
	"strokeDasharray",
	"strokeDashoffset",
	"offset",
	"composite",
	"easing",
	"computedOffset",
]);

const heroAnimations = () =>
	document
		.getAnimations()
		.filter(
			(animation) =>
				animation.playState === "running" &&
				(animation.effect as KeyframeEffect | null)?.target?.closest?.("[data-landing-hero]"),
		)
		.map((animation) => ({
			name: (animation as CSSAnimation).animationName,
			properties: [
				...new Set(((animation.effect as KeyframeEffect).getKeyframes() ?? []).flatMap((frame) => Object.keys(frame))),
			],
		}));

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`landing hero drifts with compositor-only motion ${locale}`, async ({ page }) => {
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		const animations = await page.evaluate(heroAnimations);
		expect(animations.some((animation) => animation.name === "landing-drift")).toBe(true);
		for (const animation of animations)
			for (const property of animation.properties)
				expect(compositorProperties, `${animation.name}: ${property}`).toContain(property);
	});

	test(`landing hero is fully static under reduced motion ${locale}`, async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		expect(await page.evaluate(heroAnimations)).toEqual([]);
		const hero = page.locator("[data-landing-hero]");
		await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
		// Entrance layers rest at their final, visible state instead of waiting for an animation.
		for (const opacity of await hero
			.locator(".landing-rise")
			.evaluateAll((layers) => layers.map((layer) => getComputedStyle(layer).opacity)))
			expect(opacity).toBe("1");
		await expect(hero.locator(".landing-stroke path")).toHaveCSS("animation-name", "none");
		// Scroll reveal is never armed, so every section is readable without scrolling it into view.
		expect(await page.evaluate(() => document.documentElement.classList.contains("landing-reveal-armed"))).toBe(false);
		for (const opacity of await page
			.locator("main [data-reveal]")
			.evaluateAll((blocks) => blocks.map((block) => getComputedStyle(block).opacity)))
			expect(opacity).toBe("1");
	});

	for (const [width, height] of [
		[1440, 900],
		[390, 844],
	] as const)
		test(`landing hero fills the first screen without the next section peeking ${locale} ${width}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height });
			await page.goto(`/?locale=${locale}`);
			await settleScreen(page);
			const bottom = await page.locator("[data-landing-hero]").evaluate((hero) => hero.getBoundingClientRect().bottom);
			expect(bottom).toBeGreaterThanOrEqual(height);
		});
}

test("landing header narrows into a floating bar on scroll without moving the page", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/?locale=ar-SA");
	await settleScreen(page);
	const header = page.getByRole("banner");
	const before = await header.evaluate((element) => element.getBoundingClientRect().height);
	await expect(header).not.toHaveAttribute("data-scrolled");
	await page.mouse.wheel(0, 600);
	await expect(header).toHaveAttribute("data-scrolled", "true");
	expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBe(before);
	await expect(header).toBeInViewport();
});

for (const reducedMotion of ["no-preference", "reduce"] as const)
	test(`landing anchors scroll ${reducedMotion === "reduce" ? "instantly" : "smoothly"} below the sticky header (${reducedMotion})`, async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion });
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/?locale=en-US");
		await settleScreen(page);
		expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
			reducedMotion === "reduce" ? "auto" : "smooth",
		);
		await page.getByRole("banner").getByRole("link", { name: "Pricing", exact: true }).click();
		await expect(page.locator("#pricing-title")).toBeInViewport();
		const headerBottom = await page.getByRole("banner").evaluate((element) => element.getBoundingClientRect().bottom);
		await expect
			.poll(() => page.locator("#pricing").evaluate((element) => element.getBoundingClientRect().top))
			.toBeGreaterThanOrEqual(headerBottom - 1);
	});

test("job evidence threads join each supported requirement to its CV line and follow the chosen job", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	const section = page.locator('section[aria-labelledby="tailor-title"]');
	await section.scrollIntoViewIfNeeded();
	// Senior Accountant: two requirements with evidence, one without; only supported ones get a thread.
	await expect(section.locator("svg.landing-thread path")).toHaveCount(2);
	await section.getByRole("radio", { name: "Sales Supervisor", exact: true }).click();
	await expect(section.getByRole("radio", { name: "Sales Supervisor", exact: true })).toBeChecked();
	await expect(section.locator("svg.landing-thread path")).toHaveCount(2);
	const ends = await section.locator("svg.landing-thread circle").evaluateAll((dots) => dots.length);
	expect(ends).toBe(4);
});
