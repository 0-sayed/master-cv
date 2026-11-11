import { createSampleResumeFromDashboard } from "../fixtures/resume";
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
			if (width === 1440) await page.getByRole("tab", { name: /^(Check|فحص|مراجعة)/u }).click();
			else
				await page
					.getByRole("navigation", { name: /Editor views|طرق عرض المحرر/ })
					.getByRole("button", { name: /^(Check|فحص|مراجعة)$/u })
					.click();
			await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
			const notEnabled = page.getByText(
				ar ? "اقتراحات الكتابة غير متاحة بعد" : "Writing suggestions are not available yet",
				{ exact: true },
			);
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
			for (const state of ["unavailable", "exhausted"] as const) {
				await page.route("**/api/rpc/ai/**", (route) => {
					const requests = route.request().postDataJSON() as Array<{ url: string }>;
					const responses = requests.map(({ url }, index) => ({
						index,
						status: 200,
						body: {
							json: url.endsWith("/availability")
								? {
										state: state === "exhausted" ? "ready" : "unavailable",
										reason: state === "exhausted" ? null : "WORKER_UNAVAILABLE",
									}
								: {
										plan: "start",
										operations: { limit: 5, used: 5, reserved: 0, remaining: 0 },
										baseCvs: { limit: 1, used: 1 },
									},
						},
					}));
					return route.fulfill({
						status: 207,
						contentType: "text/event-stream",
						body: responses.map((response) => `event: message\ndata: ${JSON.stringify(response)}\n\n`).join(""),
					});
				});
				await page.reload();
				if (width === 1440) await page.getByRole("tab", { name: /^(Check|فحص|مراجعة)/u }).click();
				else
					await page
						.getByRole("navigation")
						.filter({ has: page.getByRole("button", { name: /^(Check|فحص|مراجعة)$/u }) })
						.getByRole("button", { name: /^(Check|فحص|مراجعة)$/u })
						.click();
				const text =
					state === "exhausted"
						? ar
							? "استخدمت كل عمليات المساعد المجانية. لا تتجدد هذه العمليات، ويمكنك متابعة التحرير بنفسك وتنزيل ملف PDF."
							: "You have used all your free assistant operations. They do not renew. You can continue editing manually and download a PDF."
						: ar
							? "المساعد غير متاح الآن"
							: "The assistant is unavailable now";
				await expect(page.getByText(text, { exact: true })).toBeVisible();
				await page.getByText(text, { exact: true }).scrollIntoViewIfNeeded();
				await expect(page.getByRole("button", { name: /View plans|عرض الخطط/u })).toHaveCount(0);
				await settleScreen(page);
				await page.screenshot({ path: testInfo.outputPath(`${state}.png`) });
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				await page.unroute("**/api/rpc/ai/**");
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
