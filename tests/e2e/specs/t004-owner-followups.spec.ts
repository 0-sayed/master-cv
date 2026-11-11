import { ownerImportPdf } from "../fixtures/owner-import-pdf";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`owner followups ${locale} ${width}`, async ({ authPage: page, baseURL }, testInfo) => {
			test.setTimeout(90000);
			const ar = locale === "ar-SA";
			const errors: string[] = [];
			page.on("console", (message) => {
				if (/duplicate view-transition-name/i.test(message.text())) errors.push(message.text());
			});
			await page.setViewportSize({ width, height: 900 });
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			await page.goto(`/dashboard?locale=${locale}`);
			await page.getByRole("button", { name: ar ? "سيرة ذاتية جديدة" : "New CV", exact: true }).click();
			await page.getByRole("button", { name: ar ? /^رفع سيرة ذاتية موجودة/ : /^Upload an existing CV/ }).click();
			await page.locator('input[type="file"]').setInputFiles(ownerImportPdf());
			await expect(page).toHaveURL(/\/dashboard\/import\//, { timeout: 30000 });
			await settleScreen(page);
			await expect(page.locator('[data-slot="dashboard-page"]')).toHaveCount(1);
			await expect(page.getByLabel(ar ? "الهاتف" : "Phone", { exact: true })).toHaveValue("+20 106 449 4638");
			expect(
				await page.evaluate(() => {
					const names = [...document.querySelectorAll("body *")]
						.filter((node) => node.getClientRects().length)
						.map((node) => getComputedStyle(node).viewTransitionName)
						.filter((name) => name !== "none");
					return names.length === new Set(names).size;
				}),
			).toBe(true);
			const information = page.locator('[role="tabpanel"][id$="-information"]');
			const source = page.locator('[role="tabpanel"][id$="-source"]');
			expect(await information.evaluate((node) => node.nextElementSibling?.id.endsWith("-source"))).toBe(true);
			if (width === 1440) {
				const a = await information.boundingBox();
				const b = await source.boundingBox();
				if (!a || !b) throw new Error("Missing review panes");
				expect(ar ? a.x > b.x : a.x < b.x).toBe(true);
			} else {
				await expect(page.getByRole("tab").first()).toHaveAttribute("aria-controls", /-information$/);
			}
			const tag = page.getByRole("button", { name: ar ? "صفحة PDF 1" : "PDF page 1", exact: true }).first();
			await expect(tag).toHaveClass(/type-metadata/);
			const metadata = await tag.evaluate((node) => {
				const style = getComputedStyle(node);
				const reference = document.createElement("span");
				reference.className = "type-metadata text-ink-3";
				node.parentElement?.append(reference);
				const expected = getComputedStyle(reference);
				const result = [
					style.color === expected.color,
					style.fontSize === expected.fontSize,
					style.fontWeight === expected.fontWeight,
				];
				reference.remove();
				return result;
			});
			expect(metadata).toEqual([true, true, true]);
			await page
				.getByRole("navigation", { name: ar ? "أقسام المراجعة" : "Review sections" })
				.getByRole("button", { name: ar ? /^الخبرة/ : /^Experience/ })
				.click();
			await expect(page.locator("dt", { hasText: /^period$/ })).toHaveCount(0);
			const dates = page.locator("dt", { hasText: ar ? /^التواريخ$/ : /^Dates$/ });
			await expect(dates).toHaveCount(1);
			const dateText = await dates.locator("..").locator("dd").innerText();
			await expect(page.locator("dd").filter({ hasText: dateText })).toHaveCount(1);
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("import-experience.png"), fullPage: true });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await page.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
			await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
			await page.getByRole("button", { name: ar ? "سيرة ذاتية جديدة" : "New CV", exact: true }).click();
			await page.getByRole("button", { name: ar ? /^الكتابة من الصفر/ : /^Write from scratch/ }).click();
			await expect(page).toHaveURL(/\/builder\//);
			await expect(page.getByRole("dialog")).not.toBeVisible();
			if (width === 1440) await page.getByRole("tab", { name: /^(Check|فحص|مراجعة)/u }).click();
			else await page.getByRole("button", { name: /^(Check|فحص|مراجعة)/u }).click();
			const check = page.getByRole("region", { name: ar ? "قابلية قراءة PDF" : "PDF readability" });
			await expect(check.getByText(ar ? "لم يُفحص" : "Not checked", { exact: true })).toBeVisible();
			await expect(check).not.toHaveAttribute("data-pdf-bytes-hash");
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("empty-check.png"), fullPage: true });
			await page.goto("/dashboard");
			await settleScreen(page);
			const meta = page.locator('[data-slot="document-meta"]').first();
			await expect(meta).toBeVisible();
			expect(await meta.innerText()).not.toContain("·");
			expect(
				await meta.evaluate((node) => {
					const heading = node.previousElementSibling?.getBoundingClientRect();
					return !!heading && node.getBoundingClientRect().top >= heading.bottom;
				}),
			).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("document-time.png"), fullPage: true });
			for (let attempt = 0; attempt < 3; attempt++) {
				await page.locator('nav a[href="/dashboard/career/information"]').click();
				await page.locator('nav a[href="/dashboard"]').click();
			}
			await settleScreen(page);
			expect(errors).toEqual([]);
		});
	}
