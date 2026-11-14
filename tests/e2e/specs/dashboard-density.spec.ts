import type { Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createSampleCareer } from "../fixtures/career";
import { createSampleResumeFromDashboard, openSidebarSection } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

const evidence = process.env.DENSITY_EVIDENCE_DIRECTORY;

async function bounds(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error("Expected a rendered element");
	return box;
}

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} dashboard widths remain bounded and anchored through narrow and wide layouts`, async ({
		authPage: page,
		baseURL,
	}) => {
		test.setTimeout(120_000);
		await page.context().addCookies([{ name: "theme", value: "light", url: baseURL ?? "http://localhost:3000" }]);
		await createSampleCareer(page);
		if (evidence) await mkdir(evidence, { recursive: true });
		const measurements = [];
		for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
			await page.setViewportSize({ width, height: 900 });
			for (const route of [
				"/dashboard/career/information",
				"/dashboard/settings/account",
				"/dashboard",
				"/dashboard/applications",
				"/dashboard/settings/preferences",
				"/dashboard/trash",
			]) {
				await page.goto(`${route}?locale=${locale}`);
				await expect(page.locator("main h1")).toBeAttached();
				await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
				await settleScreen(page);
				const measured = await page.evaluate(() => {
					const main = document.querySelector("main");
					if (!main) throw new Error("Dashboard main missing");
					const bar = document.querySelector(".shell-toolbar");
					const frame = main.querySelector('[data-slot="dashboard-page"]');
					const heading = main.querySelector("h1");
					if (!bar || !frame || !heading) throw new Error("Dashboard frame or header missing");
					const band = document.querySelector('[data-slot="dashboard-header-content"]');
					const body = main.querySelector('[data-slot="dashboard-content"]');
					if (!band || !body) throw new Error("Dashboard bands missing");
					const headerBox = band.getBoundingClientRect();
					const content = body.getBoundingClientRect();
					const frameBox = frame.getBoundingClientRect();
					const frameStyle = getComputedStyle(frame);
					const rtl = document.documentElement.dir === "rtl";
					const titleBox = heading.getBoundingClientRect();
					return {
						contentWidth: content.width,
						edge: rtl
							? frameBox.right - Number.parseFloat(frameStyle.paddingRight)
							: frameBox.left + Number.parseFloat(frameStyle.paddingLeft),
						headerEdge: rtl ? headerBox.right : headerBox.left,
						titleEdge: rtl ? titleBox.right : titleBox.left,
						body: getComputedStyle(frame).fontSize,
						overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
					};
				});
				measurements.push({ route, width, ...measured });
				if (
					evidence &&
					locale === "ar-SA" &&
					[1280, 1440, 1920].includes(width) &&
					!["/dashboard/settings/preferences", "/dashboard/trash"].includes(route)
				) {
					const name = route.replace("/dashboard", "dashboard").replaceAll("/", "-");
					await page.screenshot({
						path: `${evidence}/${process.env.DENSITY_CAPTURE_PHASE ?? "after"}-${name}-${width}.png`,
					});
				}
				expect.soft(measured.contentWidth, `${route} at ${width}`).toBeLessThanOrEqual(width >= 1600 ? 1360 : 1120);
				expect.soft(Math.abs(measured.edge - measured.headerEdge), route).toBeLessThanOrEqual(1);
				if (width >= 640) expect.soft(Math.abs(measured.titleEdge - measured.headerEdge), route).toBeLessThanOrEqual(1);
				expect.soft(measured.body, route).toBe(locale === "ar-SA" ? "16px" : "14px");
				expect.soft(measured.overflow, route).toBe(false);
				if (route.endsWith("account")) {
					for (const input of await page.locator("main input:not([type=file])").all())
						expect.soft((await bounds(input)).width).toBeLessThanOrEqual(640);
				}
			}
		}
		if (evidence) await writeFile(`${evidence}/measurements-${locale}.json`, JSON.stringify(measurements, null, 2));
		await test
			.info()
			.attach("density-measurements", { body: JSON.stringify(measurements), contentType: "application/json" });
	});
}

test("compact career controls retain 44px touch hit areas without inflating rows", async ({ authPage: page }) => {
	await createSampleCareer(page);
	await page.setViewportSize({ width: 390, height: 844 });
	const session = await page.context().newCDPSession(page);
	await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
	await page.goto("/dashboard/career/information?locale=ar-SA");
	const skills = page.locator("section").filter({ has: page.getByRole("heading", { name: "المهارات", exact: true }) });
	await expect(skills.getByRole("button", { name: "تحرير الإدخال", exact: true })).toHaveCount(5);
	const chip = skills.getByRole("button", { name: "تحرير الإدخال", exact: true }).first();
	expect.soft((await bounds(chip)).height).toBeLessThanOrEqual(32);
	const language = page.locator('[data-slot="fact-chip"]').filter({ has: page.getByText("العربية", { exact: true }) });
	expect.soft((await bounds(language)).height).toBeLessThanOrEqual(60);
	for (const control of [chip, skills.getByRole("button", { name: "إضافة مهارة", exact: true }), language]) {
		const hit = await control.evaluate((element) => {
			const box = element.getBoundingClientRect();
			const after = getComputedStyle(element, "::after");
			return {
				width: Math.max(box.width, Number.parseFloat(after.width) || 0),
				height: Math.max(box.height, Number.parseFloat(after.height) || 0),
			};
		});
		expect(hit.width).toBeGreaterThanOrEqual(44);
		expect(hit.height).toBeGreaterThanOrEqual(44);
	}
});

for (const locale of ["ar-SA", "en-US"] as const)
	test(`${locale} compact skills grow for long user content without overlap`, async ({ authPage: page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/dashboard/career/information?locale=${locale}`);
		const ar = locale === "ar-SA";
		for (const value of [
			"تصميم وتطوير الأنظمة البرمجية المتكاملة وقواعد البيانات",
			"SyntheticTechnicalSkill".repeat(5),
		]) {
			await page.getByRole("button", { name: ar ? "إضافة مهارة" : "Add skill", exact: true }).click();
			await page.locator('input[name="name"]').fill(value);
			await page.getByRole("button", { name: ar ? "مراجعة التغييرات" : "Review changes", exact: true }).click();
			await page.getByRole("button", { name: ar ? "تأكيد التغييرات" : "Confirm changes", exact: true }).click();
			await expect(page.getByRole("dialog")).not.toBeVisible();
			const chip = page
				.getByRole("button", { name: ar ? "تحرير الإدخال" : "Edit entry", exact: true })
				.filter({ hasText: value });
			const geometry = await chip.evaluate((element) => {
				const box = element.getBoundingClientRect();
				const text = element.querySelector("bdi");
				if (!text) throw new Error("Skill content missing");
				// The bdi is a flex item: its box measures the actual wrapped line layout.
				// Range includes Noto Arabic's font em overhang even when the lines fit.
				const value = text.getBoundingClientRect();
				return {
					top: value.top - box.top,
					bottom: box.bottom - value.bottom,
					left: value.left - box.left,
					right: box.right - value.right,
				};
			});
			for (const inset of Object.values(geometry)) expect.soft(inset).toBeGreaterThanOrEqual(0);
		}
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
		).toBe(true);
	});

test("existing editor icon controls keep separate touch targets", async ({ authPage: page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 1024 });
	const session = await page.context().newCDPSession(page);
	await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
	await createSampleResumeFromDashboard(page, testInfo);
	await openSidebarSection(page, "Experience");
	await page.getByRole("button", { name: "Add experience", exact: true }).click();
	const entry = page.locator("#sidebar-experience [data-entry-id]").last();
	await entry.getByRole("button", { name: "Add role", exact: true }).click();
	await entry.getByRole("button", { name: "Add role", exact: true }).click();
	const down = entry.getByRole("button", { name: "Move role down", exact: true }).first();
	await down.scrollIntoViewIfNeeded();
	await settleScreen(page);
	const clear = await down.evaluate((element) => {
		const box = element.getBoundingClientRect();
		return document.elementFromPoint(box.right - 2, box.top + box.height / 2)?.closest("button") === element;
	});
	expect.soft(clear).toBe(true);
	const box = await bounds(down);
	await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
	await expect(entry.getByRole("button", { name: "Remove role", exact: true })).toHaveCount(2);
});

test("Arabic sample career exposes Certifications at 1440x900 and groups language values compactly", async ({
	authPage: page,
}) => {
	await createSampleCareer(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/dashboard/career/information?locale=ar-SA");
	await expect(page.getByRole("heading", { name: "اللغة الأم", exact: true })).toHaveCount(0);
	const row = page.locator('[data-slot="fact-chip"]').filter({ has: page.getByText("العربية", { exact: true }) });
	await expect(row).toBeVisible();
	await settleScreen(page);
	await expect.soft(page.getByRole("heading", { name: "الشهادات", exact: true })).toBeInViewport();
	const name = await bounds(row.getByText("العربية", { exact: true }));
	const level = await bounds(row.getByText("اللغة الأم", { exact: true }));
	if (evidence)
		await writeFile(
			`${evidence}/career-density.json`,
			JSON.stringify(
				{
					viewport: { width: 1440, height: 900 },
					certificationsHeading: await bounds(page.getByRole("heading", { name: "الشهادات", exact: true })),
					languageRow: await bounds(row),
					name,
					level,
				},
				null,
				2,
			),
		);
	expect.soft(Math.abs(name.x - level.x)).toBeLessThanOrEqual(180);
	expect.soft((await bounds(row)).height).toBeLessThanOrEqual(60);
	await page.getByRole("button", { name: "إضافة خبرة", exact: true }).click();
	const form = page.getByRole("dialog").locator("form");
	await expect(form).toBeVisible();
	expect((await bounds(form)).width).toBeLessThanOrEqual(640);
	await expect(form.locator("input").first()).toHaveCSS("font-size", "16px");
	await expect(form.locator("label").first()).toHaveCSS("font-size", "16px");
});

test("Arabic headings use the real loaded Noto Sans Arabic SemiBold face before page content appears", async ({
	authPage: page,
}) => {
	// Cold, delayed font delivery must not paint the heading in a substitute face.
	await page.route("**/fonts/noto-sans-arabic/**", async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 250));
		await route.continue();
	});
	await page.addInitScript(() => {
		const measurements: { loaded: boolean; family: string; weight: string }[] = [];
		Object.assign(window, { headingFontMeasurements: measurements });
		new MutationObserver(() => {
			const heading = document.querySelector("main h1");
			if (!heading || measurements.length) return;
			const style = getComputedStyle(heading);
			measurements.push({
				loaded: [...document.fonts].some(
					(face) => face.family.includes("Noto Sans Arabic") && face.weight === "600" && face.status === "loaded",
				),
				family: style.fontFamily,
				weight: style.fontWeight,
			});
		}).observe(document, { childList: true, subtree: true });
	});
	await page.goto("/dashboard/career/information?locale=ar-SA");
	await expect(page.locator("main h1")).toBeAttached();
	await expect(page.locator("main h1")).toHaveCSS("font-size", "32px");
	const fonts = await page.evaluate(() => {
		const measured = (window as typeof window & { headingFontMeasurements: unknown[] }).headingFontMeasurements;
		const heading = document.querySelector("main h1");
		if (!heading) throw new Error("Dashboard heading missing");
		return {
			measured,
			faces: [...document.fonts]
				.filter((face) => face.family.includes("Noto Sans Arabic") && face.weight === "600")
				.map((face) => face.status),
			synthesis: getComputedStyle(heading).fontSynthesis,
		};
	});
	expect(fonts.measured).toEqual([{ loaded: true, family: '"Noto Sans Arabic", "Noto Serif", serif', weight: "600" }]);
	expect(fonts.faces).toEqual(["loaded"]);
	expect(fonts.synthesis).toBe("none");
	const session = await page.context().newCDPSession(page);
	await session.send("DOM.enable");
	await session.send("CSS.enable");
	const documentNode = await session.send("DOM.getDocument");
	const headingNode = await session.send("DOM.querySelector", {
		nodeId: documentNode.root.nodeId,
		selector: "main h1",
	});
	const rendered = await session.send("CSS.getPlatformFontsForNode", { nodeId: headingNode.nodeId });
	expect(
		rendered.fonts.some(
			(font) => font.isCustomFont && font.postScriptName === "NotoSansArabic-SemiBold" && font.glyphCount > 0,
		),
	).toBe(true);
});
