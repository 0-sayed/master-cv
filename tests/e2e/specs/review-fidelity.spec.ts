import type { Locator } from "@playwright/test";
import phosphor from "../fixtures/phosphor-regular.json";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

async function expectMarkBeforeWordmark(container: Locator) {
	const mark = container.locator('img[src^="/master-cv/"]:visible');
	const wordmark = container.getByText("Master CV", { exact: true });
	await expect(mark).toBeVisible();
	await expect(wordmark).toBeVisible();
	const markBox = await mark.boundingBox();
	const wordBox = await wordmark.boundingBox();
	if (!markBox || !wordBox) throw new Error("Brand lockup has no rendered boxes");
	expect(markBox.x + markBox.width).toBeLessThanOrEqual(wordBox.x);
}

async function expectGlyph(svg: Locator, name: keyof typeof phosphor.paths) {
	await expect(svg).toBeVisible();
	expect(await svg.locator("path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d")))).toEqual(
		phosphor.paths[name],
	);
}

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`career section and shell glyphs match the regular master in ${locale}`, async ({ authPage: page, baseURL }) => {
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
		await page.setViewportSize({ width: 1440, height: 1024 });
		await page.goto("/dashboard/career/information");
		const names =
			locale === "ar-SA"
				? ["الخبرة المهنية", "التعليم", "المهارات", "اللغات", "الشهادات"]
				: ["Experience", "Education", "Skills", "Languages", "Certificates"];
		const glyphs = ["briefcase", "graduation-cap", "star", "translate", "certificate"] as const;
		for (const [index, name] of names.entries()) {
			const svg = page.getByRole("heading", { name, exact: true }).locator("..").locator("svg");
			const glyph = glyphs[index];
			if (!glyph) throw new Error(`Missing glyph expectation for ${name}`);
			await expectGlyph(svg, glyph);
		}
	});

	test(`sidebar and mobile navigation use regular master glyphs in ${locale}`, async ({ authPage: page, baseURL }) => {
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
		await page.setViewportSize({ width: 1440, height: 1024 });
		for (const path of ["/dashboard", "/dashboard/career/information"]) {
			await page.goto(path);
			const sidebar = page.getByRole("complementary");
			for (const [href, name] of [
				["/dashboard", "files"],
				["/dashboard/career/information", "user"],
				["/dashboard/applications", "briefcase"],
				["/dashboard/settings", "gear-six"],
			] as const)
				await expectGlyph(sidebar.locator(`a[href="${href}"] svg`), name);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await page.reload();
		for (const [href, name] of [
			["/dashboard", "files"],
			["/dashboard/career/information", "user"],
			["/dashboard/applications", "briefcase"],
			["/dashboard/settings", "gear-six"],
		] as const)
			await expectGlyph(page.getByRole("navigation").locator(`a[href="${href}"] svg`), name);
	});
}

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`brand lockups keep the mark physically left in ${locale}`, async ({ page, authPage, baseURL }) => {
		const cookie = { name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" };
		await page.context().addCookies([cookie]);
		await authPage.context().addCookies([cookie]);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto("/auth/login");
			await settleScreen(page);
			await expectMarkBeforeWordmark(page.locator("header"));
		}
		await authPage.setViewportSize({ width: 1440, height: 1024 });
		await authPage.goto("/dashboard");
		await settleScreen(authPage);
		await expectMarkBeforeWordmark(authPage.getByRole("complementary").getByRole("link").first());
	});

	test(`document titles truncate in their own direction in ${locale}`, async ({ authPage: page, baseURL }) => {
		const ar = locale === "ar-SA";
		const title = ar
			? "Software engineer — Example 3 — long synthetic document title for independent content direction"
			: "مهندسة برمجيات — مثال تجريبي طويل لاختبار اتجاه عنوان المستند بصورة مستقلة عن لغة الواجهة";
		const created = await page.request.post("/api/openapi/resumes", {
			data: { name: title, tags: [], withSampleData: false },
		});
		expect(created.ok()).toBe(true);
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto("/dashboard");
			const heading = page.getByRole("heading", { name: title, exact: true });
			await expect(heading).toBeVisible();
			await expect(heading).toHaveCSS("direction", ar ? "ltr" : "rtl");
			await expect(heading).toHaveCSS("text-overflow", "ellipsis");
			const geometry = await heading.evaluate((element) => {
				const text = element.firstChild;
				if (!text) throw new Error("Document title has no text");
				const range = document.createRange();
				range.setStart(text, 0);
				range.setEnd(text, 1);
				const first = range.getBoundingClientRect();
				const box = element.getBoundingClientRect();
				return {
					overflow: element.scrollWidth > element.clientWidth,
					firstLeft: first.left,
					firstRight: first.right,
					left: box.left,
					right: box.right,
				};
			});
			expect(geometry.overflow).toBe(true);
			expect(geometry.firstLeft).toBeGreaterThanOrEqual(geometry.left - 1);
			expect(geometry.firstRight).toBeLessThanOrEqual(geometry.right + 1);
		}
	});

	test(`welcome shows the current three-step journey in ${locale}`, async ({ authPage: page, baseURL }) => {
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
		await page.goto("/dashboard/welcome");
		const titles =
			locale === "ar-SA"
				? ["1. اجمع خبرتك", "2. راجع كل معلومة", "3. نزّل سيرتك"]
				: ["1. Gather your experience", "2. Review every detail", "3. Download your CV"];
		for (const title of titles) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
		await expect(
			page.getByText(
				"Start by adding your career information yourself. File import and AI assistance are not enabled yet.",
				{ exact: true },
			),
		).toHaveCount(0);
	});
}

test("Arabic login actions use the indexed S14 copy", async ({ page, baseURL }) => {
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3000" }]);
	await page.goto("/auth/login");
	await expect.soft(page.locator('button[type="submit"]')).toHaveText("تسجيل الدخول");
	await expect(page.locator('a[href="/auth/forgot-password"]')).toHaveText("نسيت كلمة المرور؟");
});

test("Arabic desktop career heading and document tab use their indexed copy", async ({ authPage: page, baseURL }) => {
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3000" }]);
	await page.setViewportSize({ width: 1440, height: 1024 });
	await page.goto("/dashboard/career/information");
	await expect.soft(page.getByRole("heading", { level: 1 })).toHaveText("المعلومات المهنية");
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: "Synthetic copy binding check", tags: [], withSampleData: false },
	});
	expect(created.ok()).toBe(true);
	await page.goto("/dashboard");
	await expect(page.getByRole("tab", { name: /خطابات التقديم/ })).toBeVisible();
});
