import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("populated application boards retain independent column scrolling", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 1440, height: 1024 });
	for (let index = 0; index < 12; index++) {
		await expect(
			await page.request.post("/api/openapi/applications", {
				data: { company: `Synthetic board ${index}`, role: "Engineer", status: "saved" },
			}),
		).toBeOK();
	}
	await page.goto("/dashboard/applications?view=board");
	const column = page.getByRole("region", { name: "Saved", exact: true }).locator(":scope > div").first();
	await expect(column).toBeVisible();
	await expect.poll(() => column.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
	await column.evaluate((element) => {
		element.scrollTop = 100;
	});
	await expect.poll(() => column.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test("segmented choices retain 44px hit areas on touch screens", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const session = await page.context().newCDPSession(page);
	await session.send("Emulation.setTouchEmulationEnabled", { enabled: true });
	await expect(
		await page.request.post("/api/openapi/resumes", {
			data: { name: "Synthetic touch targets", tags: [], withSampleData: false },
		}),
	).toBeOK();
	await page.goto("/dashboard");
	expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
	await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0);
	await expect(page.locator('[data-slot="segmented-control-item"]')).toHaveCount(2);
	const targets = await page.locator('[data-slot="segmented-control-item"]').evaluateAll((items) =>
		items.map((item) => {
			const box = item.getBoundingClientRect();
			const hit = getComputedStyle(item, "::after");
			const hasHitArea = hit.content !== "none" && hit.content !== "normal";
			return {
				height: Math.max(box.height, hasHitArea ? Number.parseFloat(hit.height) || 0 : 0),
				width: Math.max(box.width, hasHitArea ? Number.parseFloat(hit.width) || 0 : 0),
			};
		}),
	);
	expect(targets).toHaveLength(2);
	for (const target of targets) {
		expect(target.height).toBeGreaterThanOrEqual(44);
		expect(target.width).toBeGreaterThanOrEqual(44);
	}
});

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} password success toast clears the mobile navigation`, async ({ authPage: page, account }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		// Exercise visual success state without changing this fixture's credentials.
		await page.route("**/api/auth/change-password", (route) => route.fulfill({ json: {} }));
		for (const theme of ["light", "dark"] as const) {
			await page.goto(`/dashboard/settings/account?locale=${locale}`);
			await page.evaluate((theme) => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
			await page
				.getByRole("button", { name: locale === "ar-SA" ? "تغيير" : "Change", exact: true })
				.first()
				.click();
			const overlay = page.locator('[data-slot="sheet-content"]');
			await expect(overlay).toHaveRole("dialog");
			await expect(overlay).toHaveAttribute("data-slot", "sheet-content");
			await overlay.locator('input[name="currentPassword"]').fill(account.password);
			await overlay.locator('input[name="newPassword"]').fill(`${account.password}-replacement`);
			await overlay.locator('button[type="submit"]').click();
			await expect(overlay).not.toBeVisible();
			const notice = page.locator('[data-slot="toast"]');
			await expect(notice).toBeVisible();
			await settleScreen(page);
			const toastBox = await notice.boundingBox();
			const navBox = await page.locator('[data-slot="app-bottom-nav"]').boundingBox();
			if (!toastBox || !navBox) throw new Error("Missing toast or mobile navigation");
			expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(navBox.y - 12);
			await expect(notice).not.toBeVisible();
		}
	});
	for (const theme of ["light", "dark"] as const) {
		test(`${locale} ${theme} shell reflows and avatar content has insets`, async ({ authPage: page, baseURL }) => {
			test.setTimeout(120_000);
			await expect(
				await page.request.post("/api/auth/update-user", {
					headers: { origin: baseURL ?? "http://localhost:3000" },
					data: { name: locale === "ar-SA" ? "سارة العتيبي" : "Sarah Al Otaibi" },
				}),
			).toBeOK();
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			for (const width of [390, 768, 1024, 1280, 1440]) {
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
				let firstSidebar: { x: number; width: number } | undefined;
				for (const route of [
					"/dashboard",
					"/dashboard/career/information",
					"/dashboard/applications",
					"/dashboard/settings",
				]) {
					await page.goto(`${route}?locale=${locale}`);
					await expect(page.locator("main h1")).toBeAttached();
					await page.evaluate((theme) => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
					await settleScreen(page);
					await expect(page.locator("html")).toHaveAttribute("lang", locale);
					const layout = await page.evaluate(() => {
						const root = document.documentElement;
						const canvas = document.querySelector('[data-slot="dashboard-page"]');
						const bar = document.querySelector('[data-slot="dashboard-header-content"]');
						const aside = document.querySelector("aside");
						if (!canvas || !bar) throw new Error("Missing shell canvas");
						const a = canvas.getBoundingClientRect();
						const b = bar.getBoundingClientRect();
						const cs = getComputedStyle(canvas);
						const bs = getComputedStyle(bar);
						const rtl = root.dir === "rtl";
						const edge = (r: DOMRect, s: CSSStyleDeclaration) =>
							rtl ? r.right - Number.parseFloat(s.paddingRight) : r.left + Number.parseFloat(s.paddingLeft);
						const avatar = aside?.querySelector('[data-slot="avatar"]');
						const fallback = avatar?.querySelector('[data-slot="avatar-fallback"]');
						let inset = null;
						if (avatar && fallback) {
							const r = document.createRange();
							r.selectNodeContents(fallback);
							const text = r.getBoundingClientRect();
							const box = avatar.getBoundingClientRect();
							inset = {
								left: text.left - box.left,
								right: box.right - text.right,
								top: text.top - box.top,
								bottom: box.bottom - text.bottom,
								padding: Number.parseFloat(getComputedStyle(fallback).paddingInlineStart),
							};
						}
						const side = aside?.getBoundingClientRect();
						return {
							overflow: root.scrollWidth > root.clientWidth,
							delta: edge(a, cs) - edge(b, bs),
							sidebar: side ? { x: side.x, width: side.width } : null,
							inset,
						};
					});
					expect.soft(layout.overflow, `${route} ${width}`).toBe(false);
					expect.soft(Math.abs(layout.delta), `${route} ${width}`).toBeLessThanOrEqual(1);
					if (width >= 640) {
						expect.soft(layout.sidebar?.width).toBe(width < 1024 ? 64 : 236);
						firstSidebar ??= layout.sidebar ?? undefined;
						expect.soft(layout.sidebar).toEqual(firstSidebar);
						expect.soft(layout.inset?.padding, "fallback has real inner padding").toBeGreaterThanOrEqual(4);
						for (const edge of ["left", "right", "top", "bottom"] as const)
							expect.soft(layout.inset?.[edge], `initials fit ${edge}`).toBeGreaterThanOrEqual(1);
					}
				}
			}
		});
	}
	test(`${locale} task overlay uses a sheet on phone and dialog on desktop`, async ({ authPage: page }) => {
		for (const width of [390, 1440]) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			await page
				.getByRole("button", { name: locale === "ar-SA" ? "إضافة خبرة" : "Add experience", exact: true })
				.click();
			const overlay = page.getByRole("dialog");
			await expect(overlay).toBeVisible();
			await expect(overlay).toHaveAttribute("data-slot", width === 390 ? "sheet-content" : "dialog-content");
			await expect(overlay.locator('[data-slot$="title"]')).toHaveCSS("font-size", "24px");
			await expect(overlay.locator('[data-slot$="title"]')).toHaveCSS("line-height", "36px");
			await expect(
				overlay.getByRole("button", { name: locale === "ar-SA" ? "إغلاق" : "Close", exact: true }),
			).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(overlay).not.toBeVisible();
		}
	});
}
