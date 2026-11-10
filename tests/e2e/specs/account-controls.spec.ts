import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"]) {
	test(`${locale} account entry has equal insets on desktop, rail and mobile`, async ({ authPage: page, baseURL }) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		for (const width of [1440, 768, 390]) {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto("/dashboard");
			await settleScreen(page);
			if (width === 390) {
				const entry = page.locator('[data-slot="app-bottom-nav"] a[href="/dashboard/settings"]');
				await expect(entry).toBeVisible();
				const padding = await entry.evaluate((el) => {
					const style = getComputedStyle(el);
					return [Number.parseFloat(style.paddingInlineStart), Number.parseFloat(style.paddingInlineEnd)];
				});
				expect(Math.abs(padding[0] - padding[1])).toBeLessThanOrEqual(1);
				continue;
			}
			const entry = page.locator('aside button:has([data-slot="avatar"])').filter({ visible: true });
			const insets = await entry.evaluate((el) => {
				const box = el.getBoundingClientRect();
				const avatarElement = el.querySelector('[data-slot="avatar"]');
				if (!avatarElement) throw new Error("Account avatar missing");
				const avatar = avatarElement.getBoundingClientRect();
				const text = el.querySelector(':scope > span:not([data-slot="avatar"])')?.getBoundingClientRect();
				const rtl = document.documentElement.dir === "rtl";
				return {
					start: rtl ? box.right - avatar.right : avatar.left - box.left,
					end: text ? (rtl ? text.left - box.left : box.right - text.right) : box.right - avatar.right,
					top: avatar.top - box.top,
					bottom: box.bottom - avatar.bottom,
				};
			});
			expect(Math.abs(insets.start - insets.end), JSON.stringify(insets)).toBeLessThanOrEqual(1);
			expect(Math.abs(insets.top - insets.bottom)).toBeLessThanOrEqual(1);
			expect(insets.start).toBeGreaterThanOrEqual(width === 1440 ? 10 : 4);
		}
	});
}

for (const image of ["broken", "transparent", "visible"]) {
	test(`shared avatars handle a ${image} picture`, async ({ authPage: page, baseURL }) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		const src = `${baseURL}/e2e-avatar-${image}.svg`;
		await page.route(src, (route) =>
			route.fulfill({
				status: image === "broken" ? 404 : 200,
				contentType: "image/svg+xml",
				body: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${image === "visible" ? '<rect width="32" height="32" fill="green"/>' : ""}</svg>`,
			}),
		);
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL },
				data: { name: "سارة العتيبي", image: src },
			}),
		).toBeOK();
		await page.setViewportSize({ width: 1440, height: 1024 });
		await page.goto("/dashboard/settings/account");
		const avatars = page.locator('[data-slot="avatar"]').filter({ visible: true });
		await expect(avatars).not.toHaveCount(0);
		for (const avatar of await avatars.all()) {
			if (image === "visible") {
				await expect(avatar.locator("img")).toBeVisible();
				await expect(avatar.locator('[data-slot="avatar-fallback"]')).toBeHidden();
			} else {
				await expect(avatar.locator('[data-slot="avatar-fallback"]')).toHaveText("س ع");
				await expect(avatar.locator('[data-slot="avatar-fallback"]')).toBeVisible();
				await expect(avatar.locator("img")).toBeHidden();
			}
		}
	});
}

for (const locale of ["ar-SA", "en-US"]) {
	for (const theme of ["light", "dark"]) {
		test(`${locale} ${theme} PDF split action has a visible divider and named menu`, async ({
			authPage: page,
			baseURL,
		}, testInfo) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await page.setViewportSize({ width: 1440, height: 1024 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.context().addCookies([{ name: "theme", value: theme, url: baseURL }]);
			await createSampleResumeFromDashboard(page, testInfo);
			await settleScreen(page);
			if (theme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
			else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
			const trigger = page.getByRole("button", {
				name: locale === "ar-SA" ? "المزيد من صيغ التحميل" : "More download formats",
				exact: true,
			});
			await expect(trigger).toBeVisible();
			await trigger.click({ trial: true });
			await page.screenshot({ path: testInfo.outputPath("split-download.png"), animations: "disabled" });
			const divider = await trigger.evaluate((el) => {
				const style = getComputedStyle(el);
				return {
					width: Number.parseFloat(style.borderInlineStartWidth),
					color: style.borderInlineStartColor,
					background: style.backgroundColor,
				};
			});
			expect(divider.width).toBeGreaterThanOrEqual(1);
			expect(divider.color).not.toMatch(/rgba\([^)]*, 0\)$/);
			expect(divider.color).not.toBe(divider.background);
			await trigger.click();
			await expect(page.getByRole("dialog")).toBeVisible();
		});
	}
}
