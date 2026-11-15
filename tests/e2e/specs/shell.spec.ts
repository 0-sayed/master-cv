import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} sidebar creation, secondary Trash and account menu work across layouts`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		test.setTimeout(120_000);
		if (!baseURL) throw new Error("Missing browser URL");
		const en = locale === "en-US";
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL },
				data: { uiLocale: locale, name: en ? "Sarah Al-Otaibi" : "سارة العتيبي" },
			}),
		).toBeOK();
		await page.context().addCookies([
			{ name: "locale", value: locale, url: baseURL },
			{ name: "theme", value: "light", url: baseURL },
		]);
		const directory = process.env.SIDEBAR_EVIDENCE_DIRECTORY ?? info.outputPath("sidebar");
		await mkdir(directory, { recursive: true });
		const shot = async (name: string) => {
			await page.mouse.move(200, 650);
			await settleScreen(page);
			await expect
				.poll(() =>
					page.evaluate(() => {
						const marker = document.querySelector(
							'[data-slot="app-bottom-nav"] a[aria-current="page"] [aria-hidden="true"]',
						);
						if (!marker) return true;
						const bounds = marker.getBoundingClientRect();
						const parent = marker.parentElement?.getBoundingClientRect();
						if (!parent) return false;
						return Math.abs(bounds.x - parent.x) < 1 && Math.abs(bounds.y - parent.y) < 1;
					}),
				)
				.toBe(true);
			await page.screenshot({ path: join(directory, `${locale}-${name}.png`) });
		};
		await page.setViewportSize({ width: 1440, height: 1024 });
		await page.goto("/dashboard");
		const aside = page.getByRole("complementary");
		for (const collapsed of [false, true]) {
			await expect(aside).toBeVisible();
			expect((await aside.boundingBox())?.width).toBe(collapsed ? 64 : 236);
			const create = aside.getByRole("button", { name: en ? "New CV" : "سيرة ذاتية جديدة", exact: true });
			expect((await create.boundingBox())?.height).toBeGreaterThanOrEqual(44);
			await create.click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await page.keyboard.press("Escape");
			const trash = aside.locator('nav a[href="/dashboard/trash"]');
			await trash.click();
			await expect(trash).toHaveAttribute("aria-current", "page");
			await expect(trash.locator('[data-slot="badge"]')).toHaveCount(0);
			await aside.locator('nav a[href="/dashboard"]').click();
			await shot(`1440-${collapsed ? "collapsed" : "expanded"}`);
			const account = aside.locator('[data-slot="sidebar-account"]');
			await account.focus();
			await page.keyboard.press("Enter");
			await expect(page.getByRole("menuitem")).toHaveText(
				en
					? ["Settings", "Help", "Language", "Theme", "Sign out"]
					: ["الإعدادات", "المساعدة", "اللغة", "المظهر", "تسجيل الخروج"],
			);
			await shot(`1440-account-menu-${collapsed ? "collapsed" : "expanded"}`);
			await page.keyboard.press("Escape");
			await expect(account).toBeFocused();
			await account.click();
			await page.getByRole("menuitem", { name: en ? "Settings" : "الإعدادات", exact: true }).click();
			await expect(account).toHaveAttribute("aria-current", "page");
			expect((await aside.boundingBox())?.width).toBe(collapsed ? 64 : 236);
			await page.goto("/dashboard/settings/privacy");
			await expect(account).toHaveAttribute("aria-current", "page");
			await aside
				.getByRole("button", {
					name: collapsed
						? en
							? "Expand sidebar"
							: "توسيع الشريط الجانبي"
						: en
							? "Collapse sidebar"
							: "طي الشريط الجانبي",
					exact: true,
				})
				.click();
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/dashboard");
		await expect(aside).toHaveCount(0);
		const tabs = page.locator('[data-slot="app-bottom-nav"]');
		await expect(tabs.locator("a")).toHaveCount(4);
		await tabs.locator('a[href="/dashboard/trash"]').click();
		await expect(tabs.locator('a[href="/dashboard/trash"]')).toHaveAttribute("aria-current", "page");
		await tabs.locator('a[href="/dashboard"]').click();
		await shot("390-navigation");
		await tabs.locator('[data-slot="sidebar-account"]').click();
		await shot("390-account-menu");
		await page.getByRole("menuitem", { name: en ? "Theme" : "المظهر", exact: true }).click();
		await page.getByRole("menuitemradio", { name: en ? "Dark" : "داكن", exact: true }).click();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await settleScreen(page);
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menuitem")).toHaveCount(0);
		await tabs.locator('[data-slot="sidebar-account"]').click();
		await page.getByRole("menuitem", { name: en ? "Language" : "اللغة", exact: true }).click();
		await page.getByRole("menuitemradio", { name: en ? "Arabic" : "الإنجليزية", exact: true }).click();
		await expect(page.locator("html")).toHaveAttribute("lang", en ? "ar-SA" : "en-US");
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	});
}
