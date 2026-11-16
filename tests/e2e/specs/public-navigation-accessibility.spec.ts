import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		for (const path of ["/", "/privacy-and-terms?tab=privacy", "/privacy-and-terms?tab=terms"]) {
			test(`public keyboard order and panel focus follow the visible layout ${locale} ${width} ${path}`, async ({
				page,
			}, testInfo) => {
				await page.setViewportSize({ width, height: 900 });
				await page.goto(`${path}${path.includes("?") ? "&" : "?"}locale=${locale}`);
				await settleScreen(page);
				await page.keyboard.press("Tab");
				await expect(page.locator('a[href="#main-content"]')).toBeFocused();
				const positions: { x: number; y: number }[] = [];
				const controlCount = path === "/" ? (width < 1024 ? 3 : 8) : 4;
				await expect(page.getByRole("banner").locator("a:visible, button:visible")).toHaveCount(controlCount);
				for (let index = 0; index < controlCount; index++) {
					await page.keyboard.press("Tab");
					const active = page.locator(":focus");
					expect(await active.evaluate((element) => !!element.closest("header"))).toBe(true);
					const box = await active.boundingBox();
					expect(box).not.toBeNull();
					if (!box) throw new Error("Focused header control has no layout box");
					positions.push({ x: box.x, y: box.y });
				}
				for (let index = 1; index < positions.length; index++) {
					const previous = positions[index - 1];
					const current = positions[index];
					if (!previous || !current) throw new Error("Missing header focus position");
					expect(current.y).toBeGreaterThanOrEqual(previous.y - 2);
					if (Math.abs(current.y - previous.y) < 2)
						expect(locale === "ar-SA" ? current.x < previous.x : current.x > previous.x).toBe(true);
				}
				if (path !== "/") {
					await page.getByRole("tab", { selected: true }).focus();
					await page.keyboard.press("Tab");
					const panel = page.getByRole("tabpanel");
					await expect(panel).toBeFocused();
					const focus = await panel.evaluate((element) => {
						const style = getComputedStyle(element);
						return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
					});
					expect(focus.style).toBe("solid");
					expect(Number.parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
					expect(focus.color).not.toBe("rgba(0, 0, 0, 0)");
				} else {
					await expect(page.getByRole("tablist")).toHaveCount(0);
					await page.keyboard.press("Tab");
					expect(await page.locator(":focus").evaluate((element) => !!element.closest("main"))).toBe(true);
				}
				await page.screenshot({ path: testInfo.outputPath("focused-panel.png"), fullPage: true });
				// Owner decision 2026-11-15: no visible upstream credit; the MIT LICENSE file stays in the repository.
				await expect(page.locator("[data-upstream-credit]")).toHaveCount(0);
				await expect(page.getByRole("contentinfo")).not.toContainText("Amruth Pillai");
			});
		}
		for (const tab of ["privacy", "terms"]) {
			test(`data rights preserve the requested sign-in language over a different cookie ${locale} ${width} ${tab}`, async ({
				page,
				baseURL,
			}) => {
				await page
					.context()
					.addCookies([
						{ name: "locale", value: locale === "en-US" ? "ar-SA" : "en-US", url: baseURL ?? "http://localhost:3000" },
					]);
				await page.setViewportSize({ width, height: 900 });
				await page.goto(`/privacy-and-terms?tab=${tab}&locale=${locale}`);
				await settleScreen(page);
				await page.getByRole("link", { name: locale === "ar-SA" ? "إدارة بياناتك" : "Manage your data" }).click();
				await expect(page).toHaveURL(/\/auth\/login/);
				await settleScreen(page);
				expect(new URL(page.url()).searchParams.get("locale")).toBe(locale);
				expect(new URL(page.url()).searchParams.get("callbackURL")).toBe(
					`/dashboard/settings/privacy?locale=${locale}`,
				);
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
			});
		}
	}
	for (const entry of ["menu", "settings"] as const) {
		test(`explicit sign-out reaches sign-in without an expired-session warning ${locale} ${entry}`, async ({
			authPage: page,
			account,
		}) => {
			await page.goto(`/dashboard/settings/account?locale=${locale}`);
			await settleScreen(page);
			if (entry === "menu") {
				await page
					.getByRole("complementary")
					.getByRole("button", { name: new RegExp(account.name) })
					.click();
				await page.getByRole("menuitem", { name: locale === "ar-SA" ? "تسجيل الخروج" : "Sign out" }).click();
			} else
				await page
					.getByRole("main")
					.getByRole("button", { name: locale === "ar-SA" ? "تسجيل الخروج" : "Sign out", exact: true })
					.click();
			await expect(page).toHaveURL(/\/auth\/login/);
			await settleScreen(page);
			expect(new URL(page.url()).searchParams.has("reason")).toBe(false);
			await expect(page.locator("html")).toHaveAttribute("lang", locale);
			expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
			await expect(page.getByRole("status")).toHaveCount(0);
		});
	}
}
