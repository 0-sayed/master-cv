import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("resolved identity keeps the account row painted while live session refresh is held", async ({
	authPage: page,
	baseURL,
}) => {
	if (!baseURL) throw new Error("Browser baseURL missing");
	await expect(
		await page.request.post("/api/auth/update-user", {
			headers: { origin: baseURL },
			data: { name: "سارة العتيبي" },
		}),
	).toBeOK();
	await page.addInitScript(() => {
		const states: boolean[] = [];
		(globalThis as typeof globalThis & { firstAccountFrames: boolean[] }).firstAccountFrames = states;
		const sample = () => {
			const aside = document.querySelector("aside");
			if (aside) states.push(!!aside.querySelector('button [data-slot="avatar"]'));
			requestAnimationFrame(sample);
		};
		requestAnimationFrame(sample);
	});
	for (const width of [1440, 768]) {
		await page.goto("about:blank");
		let reads = 0;
		let release = () => {};
		const refresh = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/api/auth/get-session**", async (route) => {
			if (++reads > 1) await refresh;
			await route.continue();
		});
		try {
			await page.setViewportSize({ width, height: 900 });
			await page.goto("/dashboard");
			await expect.poll(() => reads).toBeGreaterThan(1);
			const account = page.locator('aside button:has([data-slot="avatar"])');
			await expect(account).toBeVisible();
			await expect(account.locator('[data-slot="avatar-fallback"]')).toHaveText("س ع");
			const frames = await page.evaluate(
				() => (globalThis as typeof globalThis & { firstAccountFrames: boolean[] }).firstAccountFrames,
			);
			expect(frames.length).toBeGreaterThan(0);
			expect(frames.every(Boolean), "Account row present from the first shell frame").toBe(true);
		} finally {
			release();
			await page.unrouteAll({ behavior: "wait" });
		}
	}
});

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const theme of ["light", "dark"] as const) {
		test(`${locale} ${theme} account menu has identity and two account actions; preferences stay reachable in every layout`, async ({
			authPage: page,
			baseURL,
		}) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await expect(
				await page.request.post("/api/auth/update-user", {
					headers: { origin: baseURL },
					data: { uiLocale: locale },
				}),
			).toBeOK();
			await page.context().addCookies([
				{ name: "locale", value: locale, url: baseURL },
				{ name: "theme", value: theme, url: baseURL },
			]);
			for (const width of [1440, 768, 390]) {
				await page.setViewportSize({ width, height: 1024 });
				for (const path of [
					"/dashboard",
					"/dashboard/career/information",
					"/dashboard/applications",
					"/dashboard/settings",
				]) {
					await page.goto(path);
					await settleScreen(page);
					await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
					const navigation = page.locator(width === 390 ? '[data-slot="app-bottom-nav"]' : "aside");
					await expect(navigation.locator('a[href="/dashboard/settings"]')).toBeVisible();
					await expect(navigation.locator('a[href="/dashboard/settings"]')).toHaveCount(1);
					await expect(page.locator('header button[data-size="language"]')).toHaveCount(1);
					if (width !== 390) {
						await expect(
							page
								.locator('[data-slot="dashboard-header-content"] button[aria-label]')
								.filter({ has: page.locator("svg") }),
						).toHaveCount(3);
						await navigation.locator('button:has([data-slot="avatar"])').click();
						await expect(page.getByRole("menuitem")).toHaveCount(2);
						await expect(page.getByRole("menuitem")).toHaveText(
							locale === "ar-SA" ? ["الحساب", "تسجيل الخروج"] : ["Account", "Sign out"],
						);
						await page.keyboard.press("Escape");
					}
				}
				await page.keyboard.press("ControlOrMeta+k");
				const palette = page.getByRole("dialog");
				await expect(
					palette.getByRole("option", {
						name: locale === "ar-SA" ? "غيّر المظهر إلى…" : "Change theme to…",
						exact: true,
					}),
				).toBeVisible();
				await expect(
					palette.getByRole("option", {
						name: locale === "ar-SA" ? "غيّر اللغة إلى…" : "Change language to…",
						exact: true,
					}),
				).toBeVisible();
				await expect(palette.locator('[data-value="navigation.settings"]')).toBeVisible();
				await page.keyboard.press("Escape");
				if (width === 390) {
					const preferences = page.locator('a[href="/dashboard/settings/preferences"]').filter({ visible: true });
					await expect(preferences).toHaveCount(1);
					await preferences.click();
					await expect(
						page.getByRole("radio", { name: locale === "ar-SA" ? "فاتح" : "Light", exact: true }),
					).toBeVisible();
					await expect(
						page.getByRole("combobox", {
							name: locale === "ar-SA" ? "لغة الواجهة" : "Interface language",
							exact: true,
						}),
					).toBeVisible();
				}
			}
		});

		test(`${locale} ${theme} avatars never display pending or failed image text`, async ({
			authPage: page,
			baseURL,
		}) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await expect(
				await page.request.post("/api/auth/update-user", {
					headers: { origin: baseURL },
					data: { uiLocale: locale },
				}),
			).toBeOK();
			await page.context().addCookies([
				{ name: "locale", value: locale, url: baseURL },
				{ name: "theme", value: theme, url: baseURL },
			]);
			const src = `${baseURL}/e2e-pending-account-portrait.svg`;
			let release: () => void = () => {};
			const pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			await page.route(src, async (route) => {
				await pending;
				await route.fulfill({ status: 404, body: "Not an image" });
			});
			await expect(
				await page.request.post("/api/auth/update-user", {
					headers: { origin: baseURL },
					data: { name: "سارة العتيبي", image: src },
				}),
			).toBeOK();
			try {
				for (const width of [1440, 768, 390]) {
					await page.setViewportSize({ width, height: 1024 });
					for (const path of ["/dashboard/settings", "/dashboard/settings/account"]) {
						await page.goto(path, { waitUntil: "domcontentloaded" });
						const avatars = page.locator('[data-slot="avatar"]').filter({ visible: true });
						await expect(avatars).not.toHaveCount(0);
						for (const avatar of await avatars.all()) {
							await expect(avatar).toHaveText("س ع");
							await expect(avatar.locator('[data-slot="avatar-fallback"]')).toBeVisible();
							await expect(avatar.locator("img")).toBeHidden();
						}
					}
				}
			} finally {
				release();
			}
			for (const avatar of await page.locator('[data-slot="avatar"]').filter({ visible: true }).all()) {
				await expect(avatar).toHaveText("س ع");
				await expect(avatar.locator("img")).toHaveCount(0);
			}
			await expect(
				await page.request.post("/api/auth/update-user", {
					headers: { origin: baseURL },
					data: { image: null },
				}),
			).toBeOK();
			await page.reload();
			for (const avatar of await page.locator('[data-slot="avatar"]').filter({ visible: true }).all()) {
				await expect(avatar).toHaveText("س ع");
				await expect(avatar.locator('[data-slot="avatar-fallback"]')).toBeVisible();
				await expect(avatar.locator("img")).toHaveCount(0);
			}
		});
	}
}

test("editor portrait previews use the same safe image fallback", async ({ authPage: page }, info) => {
	await page.route(/\/photos\/sample-woman\.(?:jpg|webp)$/u, (route) =>
		route.fulfill({ status: 404, body: "Missing" }),
	);
	await page.setViewportSize({ width: 1440, height: 1024 });
	await createSampleResumeFromDashboard(page, info);
	const photo = page.locator("#sidebar-picture");
	await expect(photo).toBeVisible();
	await expect(photo.locator("img")).toBeHidden();
	await expect(photo.locator('[data-slot="avatar-fallback"]')).toBeVisible();
	await photo.getByRole("button", { name: "Edit", exact: true }).click();
	const preview = page.getByRole("button", { name: "Delete picture", exact: true });
	await expect(preview).toBeVisible();
	await expect(preview.locator("img")).toBeHidden();
	await expect(preview.locator('[data-slot="avatar-fallback"]')).toBeVisible();
});
