import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} removing a loaded screenshot portrait restores initials everywhere`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		const src = `${baseURL}/e2e-settings-capture.svg`;
		await page.route(src, (route) =>
			route.fulfill({
				contentType: "image/svg+xml",
				body: '<svg xmlns="http://www.w3.org/2000/svg" width="339" height="91"><rect width="339" height="91" fill="white"/><text x="20" y="45">الحساب — التفضيلات</text></svg>',
			}),
		);
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL },
				data: { uiLocale: locale, name: "سارة العتيبي", image: src },
			}),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.setViewportSize({ width: 1920, height: 1024 });
		await page.goto("/dashboard/settings/account");
		await settleScreen(page);
		await expect
			.poll(() =>
				page.locator('aside [data-slot="avatar-image"]').evaluate((img: HTMLImageElement) => img.naturalWidth),
			)
			.toBe(339);
		await expect(page.locator('aside [data-slot="avatar-fallback"]')).toBeHidden();
		await page.getByRole("button", { name: locale === "ar-SA" ? "إزالة" : "Remove", exact: true }).click();
		for (const avatar of await page.locator('[data-slot="avatar"]').filter({ visible: true }).all()) {
			await expect(avatar).toHaveText("س ع");
			await expect(avatar.locator("img")).toHaveCount(0);
		}
		await page.reload();
		await page.locator('[data-slot="sidebar-toggle"]').click();
		await expect(page.locator('aside [data-slot="avatar-fallback"]')).toHaveText("س ع");
	});

	test(`${locale} sidebar rows stay stationary and header controls form one group`, async ({
		authPage: page,
		baseURL,
	}) => {
		test.setTimeout(60_000);
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL },
				data: { uiLocale: locale, name: "سارة العتيبي", image: null },
			}),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Count guard", tags: [], withSampleData: false },
			}),
		).toBeOK();
		await page.goto("/dashboard");
		const documentsLink = page.locator('aside a[href="/dashboard"]');
		await expect(documentsLink.locator('[data-slot="badge"]')).toHaveText("1");
		expect(
			await documentsLink.locator('[data-slot="badge"]').evaluate((el) => getComputedStyle(el).backgroundColor),
		).not.toBe(await documentsLink.evaluate((el) => getComputedStyle(el).backgroundColor));
		await expect(page.locator('[data-slot="tabs-count"]').first()).toHaveCSS("font-variant-numeric", "tabular-nums");
		expect(
			await page
				.locator('[data-slot="tabs-count"]')
				.first()
				.evaluate((el) => getComputedStyle(el).backgroundColor),
		).not.toBe("rgba(0, 0, 0, 0)");
		for (const width of [1440, 1920]) {
			await page.setViewportSize({ width, height: 1024 });
			await settleScreen(page);
			const measure = () =>
				page.locator("aside").evaluate((aside) =>
					[...aside.querySelectorAll('nav a,a[href="/dashboard/settings"],button:has([data-slot="avatar"])')].map(
						(el) => ({
							key: el.getAttribute("href") ?? "account",
							y: el.getBoundingClientRect().y,
							height: el.getBoundingClientRect().height,
						}),
					),
				);
			const expanded = await measure();
			const toggle = page.locator('[data-slot="sidebar-toggle"]');
			const header = page.locator('[data-slot="dashboard-header-content"]');
			for (let state = 0; state < 2; state++) {
				const sidebar = await page.locator("aside").boundingBox();
				const box = await toggle.boundingBox();
				if (!sidebar || !box) throw new Error("Sidebar missing");
				expect(Math.abs(box.y + box.height / 2 - sidebar.y - sidebar.height / 2)).toBeLessThanOrEqual(1);
				await expect(page.locator('aside [data-slot="avatar-fallback"]')).toHaveText("س ع");
				const search = await header.locator('[data-slot="shell-search"]').boundingBox();
				expect(search?.width).toBe(640);
				const controls = header.locator('[data-slot="dashboard-header-controls"] button');
				const treatments = await controls.evaluateAll((buttons) =>
					buttons.map((button) => {
						const s = getComputedStyle(button);
						return {
							height: button.getBoundingClientRect().height,
							background: s.backgroundColor,
							border: s.borderColor,
							radius: s.borderRadius,
						};
					}),
				);
				expect(treatments).toHaveLength(2);
				expect(treatments[0]).toEqual(treatments[1]);
				if (state === 0) {
					const theme = header.locator('button[data-size="header-icon"]');
					await theme.click();
					await page.mouse.move(0, 0);
					await settleScreen(page);
					const alternate = await controls.evaluateAll((buttons) =>
						buttons.map((button) => {
							const s = getComputedStyle(button);
							return [button.getBoundingClientRect().height, s.backgroundColor, s.borderColor, s.borderRadius];
						}),
					);
					expect(alternate[0]).toEqual(alternate[1]);
					await theme.click();
					await page.mouse.move(0, 0);
					await settleScreen(page);
				}
				await page.evaluate(() => {
					const frames: { key: string; y: number; height: number }[][] = [];
					let running = true;
					const sample = () => {
						const aside = document.querySelector("aside");
						if (aside)
							frames.push(
								[...aside.querySelectorAll('nav a,a[href="/dashboard/settings"],button:has([data-slot="avatar"])')].map(
									(el) => ({
										key: el.getAttribute("href") ?? "account",
										y: el.getBoundingClientRect().y,
										height: el.getBoundingClientRect().height,
									}),
								),
							);
						if (running) requestAnimationFrame(sample);
					};
					requestAnimationFrame(sample);
					(globalThis as typeof globalThis & { stopSidebarFrames: () => typeof frames }).stopSidebarFrames = () => {
						running = false;
						return frames;
					};
				});
				await toggle.click();
				await settleScreen(page);
				await page.waitForTimeout(100);
				const frames = await page.evaluate(() =>
					(
						globalThis as typeof globalThis & {
							stopSidebarFrames: () => { key: string; y: number; height: number }[][];
						}
					).stopSidebarFrames(),
				);
				expect(frames.length).toBeGreaterThan(1);
				for (const frame of frames) expect(frame).toEqual(expanded);
				if (state === 0) expect(await measure()).toEqual(expanded);
			}
			await page.locator('aside button:has([data-slot="avatar"])').click();
			await expect(page.getByRole("menu")).toContainText("سارة العتيبي");
			await expect(page.getByRole("menu")).toContainText(/@/);
			await expect(page.getByRole("menuitem")).toHaveCount(2);
			await expect(
				page.getByRole("menuitem", { name: locale === "ar-SA" ? "الحساب" : "Account", exact: true }),
			).toHaveAttribute("href", "/dashboard/settings/account");
			await page.keyboard.press("Escape");
		}
		await page.goto("/dashboard/settings/account");
		const signOut = page
			.locator('[data-slot="settings-row-action"]')
			.getByRole("button", { name: locale === "ar-SA" ? "تسجيل الخروج" : "Sign out", exact: true });
		await expect(signOut).toBeVisible();
		const actions = await page.locator('[data-slot="settings-row-action"]').evaluateAll((els) =>
			els.map((el) => {
				const r = el.getBoundingClientRect();
				return document.dir === "rtl" ? r.left : r.right;
			}),
		);
		expect(Math.max(...actions) - Math.min(...actions)).toBeLessThanOrEqual(1);
	});

	test(`${locale} document choices use short balanced copy and equal cards`, async ({ authPage: page, baseURL }) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.setViewportSize({ width: 1440, height: 1024 });
		await page.goto("/dashboard");
		await settleScreen(page);
		await page.getByRole("button", { name: locale === "ar-SA" ? "اختر ملفًا" : "Choose a file", exact: true }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		const copy = dialog.getByRole("button", { name: locale === "ar-SA" ? /^نسخة لوظيفة/ : /^Copy for a job/ });
		const blank = dialog.getByRole("button", { name: locale === "ar-SA" ? /^البدء بسيرة فارغة/ : /^Start blank/ });
		await expect(copy).toBeVisible();
		expect((await copy.boundingBox())?.height).toBe((await blank.boundingBox())?.height);
		for (const choice of [copy, blank]) {
			const title = choice.locator('[data-slot="action-choice-title"]');
			expect(await title.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(26);
			expect(
				await title.locator("xpath=following-sibling::span").evaluate((el) => el.getBoundingClientRect().height),
			).toBeLessThanOrEqual(26);
		}
		await expect(
			dialog.getByRole("button", { name: locale === "ar-SA" ? "جرّب بسيرة نموذجية" : "Try a sample CV", exact: true }),
		).toBeVisible();
		await expect(
			dialog.getByRole("button", {
				name: locale === "ar-SA" ? "أو أنشئ خطاب تقديم" : "Or create a cover letter",
				exact: true,
			}),
		).toBeVisible();
	});
}
