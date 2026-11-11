import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("language editing remains discoverable on a touch screen", async ({ authPage, browser, baseURL }) => {
	const context = await browser.newContext({
		baseURL,
		storageState: await authPage.context().storageState(),
		hasTouch: true,
		viewport: { width: 390, height: 844 },
	});
	try {
		const page = await context.newPage();
		const entityId = crypto.randomUUID();
		const facts = [];
		for (const [field, value] of Object.entries({ language: "العربية", fluency: "اللغة الأم" })) {
			const response = await page.request.post("/api/openapi/career/master/draft", {
				data: {
					fact: {
						section: "languages",
						entityId,
						field,
						value,
						source: { kind: "manual", id: entityId, quote: "Synthetic touch fixture" },
					},
				},
			});
			await expect(response).toBeOK();
			const fact = await response.json();
			facts.push({ id: fact.id, expectedRevision: fact.revision, expectedDraftRevision: fact.draftRevision });
		}
		const master = await (await page.request.get("/api/openapi/career/master")).json();
		await expect(
			await page.request.post("/api/openapi/career/master/confirm", {
				data: { facts, expectedProfileRevision: master.profileRevision },
			}),
		).toBeOK();
		await page.goto("/dashboard/career/information?locale=ar-SA");
		const edit = page.getByRole("button", { name: "تحرير الإدخال", exact: true }).filter({ hasText: "العربية" });
		await expect(edit).toBeEnabled();
		await expect(edit).toHaveCSS("opacity", "1");
		await edit.scrollIntoViewIfNeeded();
		await settleScreen(page);
		await edit.tap();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.locator('input[name="language"]')).toHaveValue("العربية");
	} finally {
		await context.close();
	}
});

test("mobile settings and applications do not advertise unrelated document creation", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	for (const route of ["/dashboard/settings/account", "/dashboard/applications"]) {
		await page.goto(`${route}?locale=ar-SA`);
		await expect(page.locator("main h1")).toBeVisible();
		await expect(page.locator('main > header [aria-keyshortcuts="N"]')).toHaveCount(0);
	}
});

test("settings actions use the shared trailing column with readable compact controls", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 1920, height: 900 });
	await page.goto("/dashboard/settings/account?locale=ar-SA");
	const section = page
		.locator("section")
		.filter({ has: page.getByRole("heading", { name: "تسجيل الدخول والأمن", exact: true }) });
	const change = section.getByRole("button", { name: "تغيير", exact: true });
	await expect(change).toBeVisible();
	await settleScreen(page);
	const alignment = await change.evaluate((button) => {
		const parent = button.closest('[data-slot="settings-row"]');
		const group = parent?.firstElementChild;
		if (!parent || !group) throw new Error("Setting row or label group missing");
		const label = group.getBoundingClientRect();
		const action = button.getBoundingClientRect();
		const row = parent.getBoundingClientRect();
		return { endDelta: action.left - row.left, gap: label.left - action.right, rowWidth: row.width };
	});
	expect(alignment.endDelta).toBe(0);
	expect(alignment.gap).toBeGreaterThanOrEqual(12);
	expect(alignment.rowWidth).toBeLessThanOrEqual(640);
	await expect(change).toHaveCSS("font-size", "16px");
	await expect(change).toHaveCSS("font-weight", "600");
	const box = await change.boundingBox();
	if (!box) throw new Error("Settings action missing");
	expect(box.height).toBe(36);
});

for (const locale of ["ar-SA", "en-US"]) {
	test(`${locale} wide shell controls and body occupy the same bounded band`, async ({ authPage: page }) => {
		await page.setViewportSize({ width: 1920, height: 900 });
		for (const route of [
			"/dashboard",
			"/dashboard/career/information",
			"/dashboard/applications",
			"/dashboard/settings/account",
		]) {
			await page.goto(`${route}?locale=${locale}`);
			const band = page.locator('[data-slot="dashboard-header-content"]');
			await expect(band).toBeVisible();
			const measured = await band.evaluate((element) => {
				const band = element.getBoundingClientRect();
				const frame = document.querySelector('[data-slot="dashboard-page"]');
				if (!frame) throw new Error("Dashboard frame missing");
				const content = frame.getBoundingClientRect();
				const style = getComputedStyle(frame);
				return {
					left: band.left - content.left - Number.parseFloat(style.paddingLeft),
					right: content.right - Number.parseFloat(style.paddingRight) - band.right,
				};
			});
			expect(Math.abs(measured.left)).toBeLessThanOrEqual(1);
			expect(Math.abs(measured.right)).toBeLessThanOrEqual(1);
		}
	});
}

test("Arabic form helper and validation messages use the shared readable metadata role", async ({ page }) => {
	await page.goto("/auth/login?locale=ar-SA");
	const helper = page.locator('[data-slot="form-description"]').first();
	await expect(helper).toBeVisible();
	await expect(helper).toHaveCSS("font-size", "14px");
	await expect(helper).toHaveCSS("line-height", "24px");
	await expect(helper).toHaveCSS("font-weight", "500");
	await page.locator('input[name="identifier"]').fill("synthetic-validation-only");
	await page.locator('form button[type="submit"]').click();
	const message = page.locator('[data-slot="form-message"]').first();
	await expect(message).toBeVisible();
	await expect(message).toHaveCSS("font-size", "14px");
	await expect(message).toHaveCSS("line-height", "24px");
});

test("document cards follow the page heading without skipping a level", async ({ authPage: page }, testInfo) => {
	const name = await createSampleResumeFromDashboard(page, testInfo);
	await page.goto("/dashboard?locale=ar-SA");
	await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
});

test("document metadata gives full Arabic relative time its own wrapping line", async ({
	authPage: page,
}, testInfo) => {
	const name = await createSampleResumeFromDashboard(page, testInfo);
	await page.clock.setFixedTime(new Date(Date.now() + 3 * 60 * 60 * 1000));
	for (const width of [1280, 1440, 1920, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/dashboard?locale=ar-SA");
		const meta = page
			.getByRole("heading", { level: 2, name, exact: true })
			.locator("..")
			.locator('[data-slot="document-meta"]');
		await expect(meta).toContainText("3");
		await settleScreen(page);
		await expect(meta).toHaveCSS("white-space", "normal");
		const fullText = await meta.textContent();
		expect(fullText).toMatch(/3 ساعات/);
		expect(fullText).not.toMatch(/سيرة ذاتية/);
		await expect(meta).not.toHaveCSS("text-overflow", "ellipsis");
		const heading = page.getByRole("heading", { level: 2, name, exact: true });
		const [titleBox, timeBox] = await Promise.all([heading.boundingBox(), meta.boundingBox()]);
		expect(timeBox?.y).toBeGreaterThanOrEqual((titleBox?.y ?? 0) + (titleBox?.height ?? 0));
	}
});
