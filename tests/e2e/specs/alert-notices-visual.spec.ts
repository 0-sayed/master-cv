import { openPdfReview } from "../fixtures/import-review";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`import notice ${locale} ${width}`, async ({ authPage: page }, testInfo) => {
			test.setTimeout(120_000);
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 900 });
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: String(testInfo.project.use.baseURL) },
			});
			await openPdfReview(page, locale);
			// Seed genuine partial-import recovery through the existing local draft contract.
			await page.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const request = indexedDB.open("master-cv-import-review", 1);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
				try {
					await new Promise<void>((resolve, reject) => {
						const tx = db.transaction("drafts", "readwrite");
						const cursor = tx.objectStore("drafts").openCursor();
						cursor.onsuccess = () => {
							const row = cursor.result;
							if (row) {
								row.update({ ...row.value, partial: true });
								row.continue();
							}
						};
						tx.oncomplete = () => resolve();
						tx.onerror = () => reject(tx.error);
					});
				} finally {
					db.close();
				}
			});
			await page.reload();
			const notice = page
				.locator('[data-slot="alert"]')
				.filter({ hasText: ar ? "أمكنت قراءة جزء من الملف فقط" : "Only part of this file could be read" });
			await expect(notice).toBeVisible();
			const action = notice.locator('[data-slot="alert-actions"]').getByRole("button");
			await expect(action).toBeVisible();
			expect(await action.evaluate((button) => getComputedStyle(button).borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
			await notice.scrollIntoViewIfNeeded();
			await settleScreen(page);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			expect(await page.locator("html").getAttribute("dir")).toBe(ar ? "rtl" : "ltr");
			await page.screenshot({ path: testInfo.outputPath("import-warning.png") });
			await action.click();
			await expect(page.getByLabel(ar ? "الاسم الكامل" : "Full name", { exact: true })).toBeVisible();
		});
	}
