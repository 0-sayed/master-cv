import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`document fonts preview, accept and undo: ${locale} ${width}`, async ({
			authPage: page,
			baseURL,
		}, testInfo) => {
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 1000 });
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			const created = await page.request.post("/api/openapi/resumes", {
				data: { name: "Synthetic font review", tags: [], locale: "en-US", withSampleData: false },
			});
			expect(created.ok()).toBe(true);
			const id = await created.json();
			const read = async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data;
			const data = await read();
			expect(data.metadata.typography.body.fontFamily).toBe("Carlito");
			await page.goto(`/builder/${id}?locale=${locale}`);
			const openType = async () => {
				await page.getByRole(width < 1024 ? "button" : "tab", { name: ar ? "التصميم" : "Design", exact: true }).click();
				if (width < 1024) await page.getByRole("tab", { name: ar ? "النوع" : "Type", exact: true }).click();
			};
			await openType();
			await expect(
				page.getByRole("radiogroup", { name: ar ? "إقران الخط" : "Font pairing" }).getByRole("radio"),
			).toHaveCount(5);
			data.basics.name = "أحمد العتيبي Ahmed";
			data.metadata.page.locale = "ar-SA";
			expect((await page.request.put(`/api/openapi/resumes/${id}`, { data: { data } })).ok()).toBe(true);
			await page.reload();
			await openType();
			await expect(
				page
					.getByRole("radiogroup")
					.filter({ has: page.getByRole("radio", { name: /IBM Plex Sans Arabic/ }) })
					.getByRole("radio"),
			).toHaveCount(2);
			const preview = page.getByRole("button", {
				name: ar ? "معاينة الخط البديل" : "Preview replacement",
				exact: true,
			});
			await expect(preview).toBeVisible();
			expect((await read()).metadata.typography.body.fontFamily).toBe("Carlito");
			await preview.scrollIntoViewIfNeeded();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("font-notice.png") });
			await preview.click();
			const dialog = page.getByRole("dialog");
			const accept = dialog.getByRole("button", { name: ar ? "استخدام هذا الخط" : "Use this font", exact: true });
			await expect(accept).toBeEnabled({ timeout: 60000 });
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("font-preview.png") });
			expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
			expect((await read()).metadata.typography.body.fontFamily).toBe("Carlito");
			await dialog.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await preview.click();
			await expect(accept).toBeEnabled({ timeout: 60000 });
			await accept.click();
			await expect.poll(async () => (await read()).metadata.typography.body.fontFamily).toBe("IBM Plex Sans Arabic");
			await page.keyboard.press("ControlOrMeta+z");
			await expect.poll(async () => (await read()).metadata.typography.body.fontFamily).toBe("Carlito");
			expect((await read()).basics.name).toBe(data.basics.name);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		});
	}
