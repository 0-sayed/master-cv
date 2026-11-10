import { writeFile } from "node:fs/promises";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} search stays centered, sized and clear of controls in both sidebar states`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		test.setTimeout(90_000);
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.context().addCookies([
			{ name: "locale", value: locale, url: baseURL },
			{ name: "theme", value: "light", url: baseURL },
		]);
		await page.goto("/dashboard");
		const measurements: object[] = [];
		for (const width of [1280, 1440, 1920, 1024, 768, 640]) {
			await page.setViewportSize({ width, height: 900 });
			for (const collapsed of width >= 1024 ? [false, true] : [true]) {
				await settleScreen(page);
				const header = page.locator('[data-slot="dashboard-header-content"]');
				const search = header.locator('[data-slot="shell-search"]');
				const box = await search.boundingBox();
				const band = await header.boundingBox();
				if (!box || !band) throw new Error("Header search absent");
				expect(Math.abs(box.x + box.width / 2 - band.x - band.width / 2)).toBeLessThanOrEqual(1);
				expect(box.width).toBeGreaterThanOrEqual(width === 640 ? 260 : 280);
				expect(box.width).toBeLessThanOrEqual(640);
				if (width >= 1280) expect(box.width).toBe(640);
				measurements.push({ width, collapsed, search: box, header: band });
				await expect(search).toHaveCSS("cursor", "pointer");
				await expect(search).toHaveAccessibleName(locale === "ar-SA" ? "ابحث أو انتقل إلى…" : "Search or jump to…");
				for (const control of await header.locator("button").filter({ visible: true }).all()) {
					if ((await control.getAttribute("data-slot")) === "shell-search") continue;
					const other = await control.boundingBox();
					if (!other) throw new Error("Control absent");
					expect(box.x + box.width <= other.x || other.x + other.width <= box.x).toBe(true);
					expect(other.height).toBe(box.height);
				}
				await search.click();
				const dialog = page.getByRole("dialog");
				await expect(dialog).toBeVisible();
				await settleScreen(page);
				const popup = await dialog.boundingBox();
				if (!popup) throw new Error("Palette absent");
				expect(Math.abs(popup.x + popup.width / 2 - box.x - box.width / 2)).toBeLessThanOrEqual(1);
				expect(popup.width).toBe(box.width);
				expect(popup.y).toBeGreaterThanOrEqual(box.y + box.height);
				if (width === 1440 && !collapsed) await page.screenshot({ path: info.outputPath(`${locale}-palette.png`) });
				await page.keyboard.press("Escape");
				await expect(search).toBeFocused();
				await page.screenshot({ path: info.outputPath(`${locale}-${width}-${collapsed ? "rail" : "sidebar"}.png`) });
				if (width === 1440 && !collapsed) {
					const theme = header.locator('[data-slot="dashboard-header-controls"] button[data-size="header-icon"]');
					await theme.click();
					await expect(page.locator("html")).toHaveClass(/dark/);
					await page.screenshot({ path: info.outputPath(`${locale}-1440-dark.png`) });
					await search.click();
					await expect(dialog).toBeVisible();
					await page.screenshot({ path: info.outputPath(`${locale}-palette-dark.png`) });
					await page.keyboard.press("Escape");
					await theme.click();
					await expect(page.locator("html")).not.toHaveClass(/dark/);
				}
				if (width >= 1024) await page.locator('[data-slot="sidebar-toggle"]').click();
			}
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator('[data-slot="shell-search"]')).toBeVisible();
		await expect(page.locator('[data-slot="shell-search"] kbd')).toHaveCount(0);
		await page.locator('[data-slot="shell-search"]').click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await settleScreen(page);
		await page.screenshot({ path: info.outputPath(`${locale}-390.png`) });
		await writeFile(info.outputPath("geometry.json"), JSON.stringify(measurements, null, 2));
	});

	test(`${locale} one circular toggle sits on the sidebar border in both desktop states`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/dashboard");
		for (const collapsed of [false, true]) {
			await settleScreen(page);
			const toggle = page.getByRole("button", {
				name:
					locale === "ar-SA"
						? collapsed
							? "توسيع الشريط الجانبي"
							: "طي الشريط الجانبي"
						: collapsed
							? "Expand sidebar"
							: "Collapse sidebar",
				exact: true,
			});
			await expect(toggle).toHaveCount(1);
			const box = await toggle.boundingBox();
			const aside = await page.getByRole("complementary").boundingBox();
			if (!box || !aside) throw new Error("Sidebar absent");
			expect(
				Math.abs(box.x + box.width / 2 - (locale === "ar-SA" ? aside.x : aside.x + aside.width)),
			).toBeLessThanOrEqual(1);
			expect(box.width).toBe(40);
			expect(box.height).toBe(40);
			const circle = toggle.locator('[data-slot="sidebar-toggle-circle"]');
			await expect(circle).toHaveCSS("border-radius", "50%");
			expect((await circle.boundingBox())?.width).toBe(24);
			await toggle.click();
		}
	});
}

for (const platform of ["MacIntel", "Linux x86_64"]) {
	test(`${platform} Arabic shortcut is an LTR unit and all activation methods return focus`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await page.addInitScript((value) => Object.defineProperty(navigator, "platform", { value }), platform);
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: "ar-SA" } }),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: "ar-SA", url: baseURL }]);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/dashboard");
		const search = page.locator('[data-slot="shell-search"]');
		const hint = search.locator("kbd");
		await expect(hint).toHaveText(platform === "MacIntel" ? "⌘K" : "Ctrl K");
		await expect(hint).toHaveCSS("direction", "ltr");
		for (const key of ["Enter", "Space", platform === "MacIntel" ? "Meta+k" : "Control+k"]) {
			await search.focus();
			await expect(search).toHaveCSS("outline-style", "solid");
			await expect(search).toHaveCSS("outline-width", "2px");
			await page.keyboard.press(key);
			await expect(page.getByRole("dialog")).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(search).toBeFocused();
		}
	});
}
