import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} empty collections own their actions and omit idle toolbar controls`, async ({ authPage: page }) => {
		await page.goto(`/dashboard/applications?locale=${locale}`);
		await expect(page.locator('[data-slot="empty-state"]')).toBeVisible();
		const save = page.getByRole("button", { name: locale === "ar-SA" ? "حفظ الوظيفة" : "Save job", exact: true });
		await expect(save).toHaveCount(1);
		await expect(page.locator('[data-slot="page-toolbar"]')).toHaveCount(0);
		await expect(page.locator("main h1").locator("xpath=ancestor::header").getByRole("button")).toHaveCount(0);
		await save.click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await page.keyboard.press("Escape");
		await page.goto(`/dashboard?locale=${locale}`);
		await expect(
			page.getByRole("button", { name: locale === "ar-SA" ? "اختر ملفًا" : "Choose a file", exact: true }),
		).toHaveCount(1);
		await expect(page.locator("main h1").locator("xpath=ancestor::header").getByRole("button")).toHaveCount(0);
		await expect(page.locator('[data-slot="page-toolbar"]')).toHaveCount(0);
		await page.goto(`/dashboard/career/knowledge/facts?locale=${locale}`);
		await expect(
			page.getByText(locale === "ar-SA" ? "لا توجد حقائق بعد. أضف واحدة أعلاه." : "No facts yet. Add one above.", {
				exact: true,
			}),
		).toBeVisible();
		await expect(page.getByRole("searchbox")).toHaveCount(0);
		await page
			.getByRole("textbox", { name: locale === "ar-SA" ? "حقيقة جديدة" : "New fact", exact: true })
			.fill("Synthetic toolbar fact");
		await page.getByRole("button", { name: locale === "ar-SA" ? "إضافة" : "Add", exact: true }).click();
		await expect(page.getByRole("searchbox")).toBeVisible();
	});
	for (const width of [1280, 1440]) {
		test(`${locale} ${width} collection toolbar placeholders and labels fit`, async ({ authPage: page }) => {
			await page.setViewportSize({ width, height: 1024 });
			await expect(
				await page.request.post("/api/openapi/resumes", {
					data: { name: "Toolbar fit", tags: [], withSampleData: false },
				}),
			).toBeOK();
			await expect(
				await page.request.post("/api/openapi/applications", {
					data: { company: "Toolbar fit", role: "Engineer", status: "saved" },
				}),
			).toBeOK();
			for (const route of ["/dashboard", "/dashboard/applications", "/dashboard/career/knowledge/facts"]) {
				await page.goto(`${route}?locale=${locale}`);
				await expect(page.locator("main input[placeholder]").first()).toBeVisible();
				await settleScreen(page);
				const fits = await page.locator("main").evaluate((toolbar) => {
					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Text measurement unavailable");
					return [...toolbar.querySelectorAll('input[placeholder], select, [data-slot="page-toolbar"] button')]
						.filter((element) => element.getBoundingClientRect().width > 0)
						.map((element) => {
							const style = getComputedStyle(element);
							context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
							const input = element instanceof HTMLInputElement;
							const select = element instanceof HTMLSelectElement;
							const label = input
								? element.placeholder
								: select
									? (element.selectedOptions[0]?.text ?? "")
									: (element.textContent ?? "");
							return {
								label,
								scroll: element.scrollWidth,
								client: element.clientWidth,
								text: input || select ? context.measureText(label).width : 0,
								available:
									element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
							};
						});
				});
				for (const fit of fits) {
					expect.soft(fit.scroll, `${route}: ${fit.label}`).toBeLessThanOrEqual(fit.client);
					expect.soft(fit.text, `${route}: ${fit.label}`).toBeLessThanOrEqual(fit.available + 1);
				}
			}
		});
	}
}
