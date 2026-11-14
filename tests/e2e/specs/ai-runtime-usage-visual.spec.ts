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
				// The batch URL follows its first request, which may be a non-AI query.
				await page.route("**/api/rpc/**/__batch__", async (route) => {
					const requests = route.request().postDataJSON() as Array<{ url: string }>;
					if (!requests.some(({ url }) => new URL(url).pathname.startsWith("/api/rpc/ai/"))) return route.continue();
					const response = await route.fetch();
					const body = (await response.text())
						.split("\n")
						.map((line) => {
							if (!line.startsWith("data: ")) return line;
							const event = JSON.parse(line.slice(6)) as { index: number; body: { json: unknown } };
							const url = requests[event.index]?.url;
							if (url?.endsWith("/ai/availability"))
								event.body.json = {
									state: state === "unavailable" ? "unavailable" : "ready",
									reason: state === "unavailable" ? "WORKER_UNAVAILABLE" : null,
								};
							else if (url?.endsWith("/ai/usage/get"))
								event.body.json = {
									plan: "start",
									operations: {
										limit: 5,
										used: state === "busy" ? 4 : 5,
										reserved: state === "busy" ? 1 : 0,
										remaining: 0,
									},
									baseCvs: { limit: 1, used: 1 },
								};
							return `data: ${JSON.stringify(event)}`;
						})
						.join("\n");
					return route.fulfill({
						response,
						body,
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
						: state === "busy"
							? ar
								? "هناك عملية جارية بالفعل. كتابتك محفوظة."
								: "An operation is already in progress. Your writing is kept."
							: ar
								? "المساعد غير متاح الآن"
								: "The assistant is unavailable now";
				await expect(page.getByText(text, { exact: true })).toBeVisible();
				await page.getByText(text, { exact: true }).scrollIntoViewIfNeeded();
				await expect(page.getByRole("button", { name: /View plans|عرض الخطط/u })).toHaveCount(0);
				await settleScreen(page);
				await page.screenshot({ path: testInfo.outputPath(`${state}.png`) });
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
				await page.unroute("**/api/rpc/**/__batch__");
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
