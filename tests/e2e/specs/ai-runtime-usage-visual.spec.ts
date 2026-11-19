import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { openReview } from "../fixtures/reviewable-ai";
import { mockRpcReads } from "../fixtures/rpc-failure";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"] as const)
	for (const width of [1440, 390]) {
		test(`assistant notices ${locale} ${width}`, async ({ authPage: page, baseURL }, testInfo) => {
			const ar = locale === "ar-SA";
			await page.setViewportSize({ width, height: 900 });
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			await createSampleResumeFromDashboard(page, testInfo);
			await page.reload();
			await openReview(page, width, "ai");
			await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
			const notEnabled = page.getByText(ar ? "المساعد غير مفعّل بعد" : "The assistant is not enabled yet", {
				exact: true,
			});
			await expect(notEnabled).toBeVisible();
			await notEnabled.scrollIntoViewIfNeeded();
			await settleScreen(page);
			expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(
				ar ? "Noto Sans Arabic" : "Noto Sans",
			);
			expect(
				await page.evaluate(
					(family) => document.fonts.check(`14px "${family}"`),
					ar ? "Noto Sans Arabic" : "Noto Sans",
				),
			).toBe(true);
			await page.screenshot({ path: testInfo.outputPath("not-enabled.png") });
			// Presentation-only doubles. They do not register handlers or enable server-side processing.
			for (const state of ["unavailable", "exhausted", "busy"] as const) {
				const restore = await mockRpcReads(page, {
					"ai/availability": {
						state: state === "unavailable" ? "unavailable" : "ready",
						reason: state === "unavailable" ? "WORKER_UNAVAILABLE" : null,
					},
					"ai/usage/get": {
						plan: "start",
						operations: { limit: 5, used: state === "busy" ? 4 : 5, reserved: state === "busy" ? 1 : 0, remaining: 0 },
						baseCvs: { limit: 1, used: 1 },
					},
				});
				await page.reload();
				await openReview(page, width, "ai");
				const text =
					state === "exhausted"
						? ar
							? "استخدمت جميع عمليات المساعد المتاحة. مسودتك محفوظة. راجع رصيدك في إعدادات الحساب."
							: "You used all available assistant operations. Your draft is kept. Review your allowance in account settings."
						: state === "busy"
							? ar
								? "هناك عملية جارية بالفعل. كتابتك محفوظة."
								: "An operation is already in progress. Your writing is kept."
							: ar
								? "الذكاء الاصطناعي غير متاح في هذه البيئة."
								: "AI is not available in this environment.";
				await expect(page.getByText(text, { exact: true })).toBeVisible();
				await expect(page.getByRole("button", { name: /^(Review wording|مراجعة الصياغة)$/u })).toHaveCount(0);
				await page.getByText(text, { exact: true }).scrollIntoViewIfNeeded();
				await expect(page.getByRole("button", { name: /View plans|عرض الخطط/u })).toHaveCount(0);
				await settleScreen(page);
				await page.screenshot({ path: testInfo.outputPath(`${state}.png`) });
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				await restore();
			}
			await page.goto("/dashboard");
			await page.getByRole("button", { name: ar ? "جديد" : "New", exact: true }).click();
			const dialog = page.getByRole("dialog");
			await expect(dialog).toBeVisible();
			const english = dialog.getByRole("radio", { name: ar ? "الإنجليزية" : "English", exact: true });
			await english.click();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("start-import.png") });
			await dialog.getByRole("button", { name: ar ? /^الكتابة من الصفر/ : /^Write from scratch/ }).click();
			await expect(dialog).toContainText(
				ar ? "وصلت إلى الحد المسموح للسير الأصلية" : "You have reached the limit for base CVs",
			);
			await expect(english).toBeChecked();
			await settleScreen(page);
			await page.screenshot({ path: testInfo.outputPath("base-limit.png") });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await english.focus();
			await expect(english).toBeFocused();
		});
	}
