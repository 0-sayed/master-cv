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
		.filter((animation) => (animation.effect as KeyframeEffect | null)?.target?.closest?.("[data-landing-hero]"))
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
		// Filled entrance effects remain inspectable after settling; do not filter them out by play state.
		expect(animations.some((animation) => animation.name === "signature-draw")).toBe(true);
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
	const initialPaths = await section
		.locator("svg.landing-thread path")
		.evaluateAll((paths) => paths.map((path) => path.getAttribute("d")));
	await section.getByRole("radio", { name: "Sales Supervisor", exact: true }).click();
	await expect(section.getByRole("radio", { name: "Sales Supervisor", exact: true })).toBeChecked();
	await expect(section.locator("svg.landing-thread path")).toHaveCount(2);
	const ends = await section.locator("svg.landing-thread circle").evaluateAll((dots) => dots.length);
	expect(ends).toBe(4);
	await expect
		.poll(() =>
			section.locator("svg.landing-thread path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
		)
		.not.toEqual(initialPaths);
	// Sales teamwork must point to the skills fact, rather than the accountant's second experience bullet.
	await expect
		.poll(async () => {
			const dot = await section.locator("svg.landing-thread circle").last().boundingBox();
			const fact = await section.locator('[data-thread-to="skills"]').boundingBox();
			if (!dot || !fact) throw new Error("Missing evidence endpoint");
			return Math.abs(dot.y + dot.height / 2 - fact.y - fact.height / 2);
		})
		.toBeLessThan(2);
});

test("landing demo stays readable without the optional visibility observer", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.addInitScript(() => {
		Object.defineProperty(globalThis, "IntersectionObserver", { value: undefined, configurable: true });
	});
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	await expect(page.locator("[data-live-cv]")).toHaveAttribute("data-step", "5");
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	expect(errors).toEqual([]);
});
