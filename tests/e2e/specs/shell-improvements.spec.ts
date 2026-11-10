import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} header search and persisted desktop rail share stable shell geometry`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		test.setTimeout(120_000);
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.addInitScript(() => {
			const widths: number[] = [];
			(globalThis as typeof globalThis & { firstSidebarWidths: number[] }).firstSidebarWidths = widths;
			const sample = () => {
				const aside = document.querySelector("aside");
				if (aside) widths.push(aside.getBoundingClientRect().width);
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		});
		const collapse = locale === "ar-SA" ? "طي الشريط الجانبي" : "Collapse sidebar";
		const expand = locale === "ar-SA" ? "توسيع الشريط الجانبي" : "Expand sidebar";
		for (const width of [1280, 1440, 1920]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto("/dashboard");
			await settleScreen(page);
			const header = page.locator("main > header");
			const baseline = await header.boundingBox();
			for (const collapsed of [false, true]) {
				const aside = page.getByRole("complementary");
				expect((await aside.boundingBox())?.width).toBe(collapsed ? 64 : 236);
				await expect(page.getByRole("button", { name: collapsed ? expand : collapse, exact: true })).toBeVisible();
				await expect(aside.locator('[data-slot="shell-search"]')).toHaveCount(0);
				const search = header.locator('[data-slot="shell-search"]');
				await expect(search).toHaveCount(1);
				expect((await search.boundingBox())?.height).toBe(44);
				expect((await search.boundingBox())?.width).toBe(640);
				for (const path of [
					"/dashboard",
					"/dashboard/career/information",
					"/dashboard/applications",
					"/dashboard/settings",
				]) {
					await aside.locator(`a[href="${path}"]`).click();
					await settleScreen(page);
					const bounds = await page.locator('[data-slot="dashboard-page"]').boundingBox();
					const band = await header.locator('[data-slot="dashboard-header-content"]').boundingBox();
					if (!bounds || !band) throw new Error("Dashboard canvas absent");
					const gutter = await page
						.locator('[data-slot="dashboard-page"]')
						.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft));
					expect(band.x).toBe(bounds.x + gutter);
					expect(band.width).toBe(bounds.width - 2 * gutter);
					expect((await header.boundingBox())?.y).toBe(baseline?.y);
					expect((await header.boundingBox())?.height).toBe(baseline?.height);
					await search.click();
					await expect(page.getByRole("dialog")).toBeVisible();
					await page.keyboard.press("Escape");
				}
				await page.screenshot({ path: info.outputPath(`${locale}-${width}-${collapsed ? "rail" : "sidebar"}.png`) });
				if (collapsed) {
					const item = aside.locator('nav a[href="/dashboard"]');
					await item.hover();
					const tooltip = page.locator('[data-slot="tooltip-content"]');
					await expect(tooltip).toBeVisible();
					await expect(tooltip).toHaveText((await item.getAttribute("aria-label")) ?? "");
					await page.keyboard.press("Escape");
				}
				if (!collapsed) {
					await page.getByRole("button", { name: collapse, exact: true }).click();
					await page.reload();
					await expect(page.getByRole("button", { name: expand, exact: true })).toBeVisible();
					await expect
						.poll(() =>
							page.evaluate(
								() => (globalThis as typeof globalThis & { firstSidebarWidths: number[] }).firstSidebarWidths.length,
							),
						)
						.toBeGreaterThan(2);
					expect(
						await page.evaluate(() =>
							(globalThis as typeof globalThis & { firstSidebarWidths: number[] }).firstSidebarWidths.every(
								(value) => value === 64,
							),
						),
						"Saved rail must never paint expanded",
					).toBe(true);
				}
			}
			await page.getByRole("button", { name: expand, exact: true }).click();
		}
		for (const width of [768, 390]) {
			await page.setViewportSize({ width, height: 844 });
			await page.goto("/dashboard");
			await expect(page.locator('[data-slot="shell-search"]')).toHaveCount(1);
			await expect(page.getByRole("button", { name: collapse, exact: true })).toHaveCount(0);
			for (const control of await page.locator("main > header button").filter({ visible: true }).all())
				expect((await control.boundingBox())?.height).toBe(48);
			if (width === 768) expect((await page.getByRole("complementary").boundingBox())?.width).toBe(64);
			else await expect(page.getByRole("complementary")).toHaveCount(0);
			await page.locator('[data-slot="shell-search"]').click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await page.keyboard.press("Escape");
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath(`${locale}-${width}-header-search.png`) });
		}
		const application = await page.request.post("/api/openapi/applications", {
			data: { company: "Synthetic mobile search", role: "Engineer", status: "saved" },
		});
		await expect(application).toBeOK();
		await page.goto(`/dashboard/applications/${await application.json()}`);
		await expect(page.locator('[data-slot="shell-search"]')).toHaveCount(1);
		await page.locator('[data-slot="shell-search"]').click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
	});

	test(`${locale} shared interactive cursors cover nested control labels and disabled states`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Cursor audit", tags: [], withSampleData: true },
			}),
		).toBeOK();
		await page.goto("/dashboard");
		await settleScreen(page);
		for (const selector of ["button:not(:disabled)", '[role="tab"]', '[role="radio"]', "a[href]"]) {
			const control = page.locator(selector).filter({ visible: true }).first();
			await expect(control).toHaveCSS("cursor", "pointer");
		}
		await page.goto("/dashboard/settings/account");
		for (const selector of ['[role="switch"]', 'input[type="email"]']) {
			await expect(page.locator(selector).filter({ visible: true }).first()).toHaveCSS(
				"cursor",
				selector.startsWith("input") ? "text" : "pointer",
			);
		}
		await page.locator('aside button:has([data-slot="avatar"])').click();
		for (const item of await page.getByRole("menuitem").all()) await expect(item).toHaveCSS("cursor", "pointer");
		await page.keyboard.press("Escape");
		// Probe native/ARIA semantics in both themes, including classes inherited from real segmented labels.
		for (const theme of ["light", "dark"]) {
			await page.evaluate((mode) => {
				document.documentElement.classList.toggle("dark", mode === "dark");
				const probe = document.createElement("div");
				probe.id = "cursor-probe";
				probe.innerHTML =
					'<button disabled>Disabled</button><button aria-disabled="true">Unavailable</button><div role="option"><span>Option</span></div><label for="cursor-radio">Radio</label><input id="cursor-radio" type="radio"><label><input type="checkbox">Checkbox</label><select><option>Select</option></select><details><summary>Details</summary></details><textarea>Text</textarea><div contenteditable="true">Edit</div><div role="radio"><label class="cursor-text">Stage</label></div>';
				document.body.append(probe);
			}, theme);
			for (const selector of [
				'[role="option"] span',
				"label[for]",
				"label:has(input)",
				"select",
				"summary",
				'[role="radio"] label',
			])
				await expect(page.locator(`#cursor-probe ${selector}`)).toHaveCSS("cursor", "pointer");
			await page.locator("#cursor-probe").evaluate((element) => {
				const input = document.createElement("input");
				input.disabled = true;
				element.append(input);
			});
			for (const selector of ["button:disabled", 'button[aria-disabled="true"]', "input:disabled"])
				await expect(page.locator(`#cursor-probe ${selector}`)).toHaveCSS("cursor", "not-allowed");
			for (const selector of ["textarea", '[contenteditable="true"]'])
				await expect(page.locator(`#cursor-probe ${selector}`)).toHaveCSS("cursor", "text");
			await page.locator("#cursor-probe").evaluate((el) => el.remove());
		}
	});
}
