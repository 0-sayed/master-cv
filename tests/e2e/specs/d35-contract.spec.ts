import { registerViaApi } from "../fixtures/auth";
import { capturedAuthLink } from "../fixtures/mail";
import phosphor from "../fixtures/phosphor-regular.json";
import { expect, test } from "../fixtures/test";

for (const width of [1440, 390]) {
	for (const [reason, icon] of [
		["passwordChanged", "check-circle"],
		["sessionExpired", "warning"],
	] as const)
		test(`D35 login notice follows its heading and has ${icon} at ${width}`, async ({ page, context, baseURL }) => {
			await context.addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3000" }]);
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.goto(`/auth/login?reason=${reason}`);
			const heading = page.getByRole("heading", { name: "تسجيل الدخول", exact: true });
			const notice = page.getByRole("status");
			await expect(heading).toBeVisible();
			await expect(notice).toBeVisible();
			expect(
				await heading.evaluate((element) => {
					const status = document.querySelector('[role="status"]');
					return status !== null && !!(element.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING);
				}),
			).toBe(true);
			await expect(notice.locator("svg")).toBeVisible();
			expect(
				await notice.locator("svg path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
			).toEqual(phosphor.paths[icon]);
		});
	test(`D35 expired verification shows the clock glyph at ${width}`, async ({ page, context, baseURL }) => {
		await context.addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3000" }]);
		await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
		await page.goto("/auth/verify-email?email=clock%40example.test&error=TOKEN_EXPIRED");
		await expect(page.getByRole("heading", { name: "انتهت صلاحية الرابط", exact: true })).toBeVisible();
		const svg = page
			.locator("main > div")
			.filter({ has: page.locator("svg") })
			.first()
			.locator("svg")
			.first();
		await expect(svg).toBeVisible();
		expect(await svg.locator("path").evaluateAll((paths) => paths.map((path) => path.getAttribute("d")))).toEqual(
			phosphor.paths.clock,
		);
	});
}
for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		const ar = locale === "ar-SA";
		test.describe(`D35 ${locale} ${width}`, () => {
			test.beforeEach(async ({ authPage: page, baseURL }) => {
				await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
				await page.goto("/dashboard/career/information");
			});

			test("career dialogs have no invented language action and retain standard close", async ({ authPage: page }) => {
				for (const name of ar
					? ["إضافة خبرة", "إضافة مؤهل", "إضافة مهارة", "إضافة لغة", "إضافة شهادة"]
					: ["Add experience", "Add qualification", "Add skill", "Add language", "Add certificate"]) {
					await page.getByRole("button", { name, exact: true }).click();
					const dialog = page.getByRole("dialog");
					await expect(dialog).toBeVisible();
					await expect(dialog.getByRole("button", { name: /Switch interface|تغيير الواجهة/ })).toHaveCount(0);
					await dialog.getByRole("button", { name: ar ? "إغلاق" : "Close", exact: true }).click();
					await expect(dialog).not.toBeVisible();
				}
			});

			test("certifications empty state includes its explanation", async ({ authPage: page }) => {
				await expect(
					page.getByText(
						ar
							? "الشهادات المهنية والدورات المعتمدة، إن وُجدت."
							: "Professional certificates and accredited courses, if applicable.",
						{ exact: true },
					),
				).toBeVisible();
			});

			if (width === 1440)
				test("desktop fact dialog uses its indexed entry and approval hints", async ({ authPage: page }) => {
					await page.getByRole("button", { name: ar ? "إضافة خبرة" : "Add experience", exact: true }).click();
					const dialog = page.getByRole("dialog");
					await expect(
						dialog.getByText(ar ? "اكتب المعلومة كما تريد حفظها." : "Write the information as you want it saved.", {
							exact: true,
						}),
					).toBeVisible();
					await expect(
						dialog.getByText(ar ? "لا تُضاف معلومة دون موافقتك." : "No information is added without your approval.", {
							exact: true,
						}),
					).toBeVisible();
				});

			test("language name and level occupy opposite row edges", async ({ authPage: page }) => {
				const language = ar ? "العربية" : "English";
				const level = ar ? "اللغة الأم" : "Advanced";
				await page.getByRole("button", { name: ar ? "إضافة لغة" : "Add language", exact: true }).click();
				await page.locator('input[name="language"]').fill(language);
				await page.locator('input[name="fluency"]').fill(level);
				await page.getByRole("button", { name: ar ? "مراجعة التغييرات" : "Review changes", exact: true }).click();
				await page.getByRole("button", { name: ar ? "تأكيد التغييرات" : "Confirm changes", exact: true }).click();
				await expect(page.getByRole("dialog")).not.toBeVisible();
				const row = page
					.getByRole("article")
					.filter({ has: page.getByRole("heading", { name: language, exact: true }) });
				await row.scrollIntoViewIfNeeded();
				const positions = await row.evaluate(
					(element, values) => {
						const rowBox = element.querySelector("h3")?.parentElement?.getBoundingClientRect();
						if (!rowBox) throw new Error("Language row content missing");
						const textCenter = (value: string) => {
							const node = [...element.querySelectorAll("h3,p")].find((item) => item.textContent === value);
							if (!node) throw new Error("Language row text missing");
							const range = document.createRange();
							range.selectNodeContents(node);
							const box = range.getBoundingClientRect();
							return (box.x + box.width / 2 - rowBox.x) / rowBox.width;
						};
						return { name: textCenter(values.language), level: textCenter(values.level) };
					},
					{ language, level },
				);
				if (ar) {
					expect(positions.name).toBeGreaterThan(0.75);
					expect(positions.level).toBeLessThan(0.25);
				} else {
					expect(positions.name).toBeLessThan(0.25);
					expect(positions.level).toBeGreaterThan(0.75);
				}
			});

			if (width === 390)
				test("long language values wrap without horizontal overflow", async ({ authPage: page }) => {
					await page.getByRole("button", { name: ar ? "إضافة لغة" : "Add language", exact: true }).click();
					await page.locator('input[name="language"]').fill(ar ? "العربية" : "English");
					await page.locator('input[name="fluency"]').fill("Advanced".repeat(8));
					await page.getByRole("button", { name: ar ? "مراجعة التغييرات" : "Review changes", exact: true }).click();
					await page.getByRole("button", { name: ar ? "تأكيد التغييرات" : "Confirm changes", exact: true }).click();
					await expect(page.getByRole("dialog")).not.toBeVisible();
					await expect(page.getByText("Advanced".repeat(8), { exact: true })).toBeVisible();
					const row = page.getByRole("article").filter({ hasText: "Advanced".repeat(8) });
					expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
					expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
					await row.getByRole("button", { name: ar ? "تحرير الإدخال" : "Edit entry", exact: true }).click();
					await page.locator('input[name="fluency"]').fill("Advanced");
					await page.getByRole("button", { name: ar ? "مراجعة التغييرات" : "Review changes", exact: true }).click();
					await expect(
						page.getByRole("heading", { name: ar ? "راجع تغييراتك" : "Review your changes", exact: true }),
					).toBeVisible();
					await page
						.getByRole("dialog")
						.getByRole("button", { name: ar ? "إغلاق" : "Close", exact: true })
						.click();
					await expect(page.getByRole("dialog")).not.toBeVisible();
					await page.reload();
					const draft = page.getByText(ar ? "مسودة — راجعها قبل التأكيد" : "Draft — review before confirming", {
						exact: true,
					});
					await expect(draft).toBeVisible();
					const nameBox = await page
						.getByRole("heading", { name: ar ? "العربية" : "English", exact: true })
						.boundingBox();
					const draftBox = await draft.boundingBox();
					if (!nameBox || !draftBox) throw new Error("Language draft bounds missing");
					expect(draftBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
				});
		});
	}
}

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		test(`D35 reset-sent state offers a working resend ${locale} ${width}`, async ({
			page,
			context,
			account,
			baseURL,
		}) => {
			await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await registerViaApi(page.request, account, baseURL ?? "http://localhost:3000");
			await page.request.get(await capturedAuthLink(account.email, "verification"));
			let requests = 0;
			page.on("request", (request) => {
				if (request.url().endsWith("/api/auth/request-password-reset") && request.method() === "POST") requests++;
			});
			await page.goto("/auth/forgot-password");
			await page.locator('input[name="email"]').fill(account.email);
			await page.locator('button[type="submit"]').click();
			const resend = page.getByRole("button", {
				name: locale === "ar-SA" ? "إعادة إرسال الرابط" : "Resend link",
				exact: true,
			});
			await expect(resend).toBeVisible();
			const response = page.waitForResponse(
				(response) =>
					response.url().endsWith("/api/auth/request-password-reset") && response.request().method() === "POST",
			);
			await resend.click();
			expect((await response).ok()).toBe(true);
			await expect.poll(() => requests).toBe(2);
			await expect(resend).not.toHaveAttribute("aria-busy", "true");
			await expect(
				page.getByRole("heading", { name: locale === "ar-SA" ? "تحقق من بريدك" : "Check your email" }),
			).toBeVisible();
			await expect(page.getByRole("alert")).toHaveCount(0);
			await page.route("**/api/auth/request-password-reset", (route) =>
				route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ code: "UNKNOWN", message: "private server detail" }),
				}),
			);
			await resend.click();
			await expect(page.getByRole("alert")).toBeVisible();
			await expect(page.getByRole("alert")).toBeFocused();
			await expect(page.getByRole("alert").getByRole("link")).toHaveCount(0);
			await expect(page.getByRole("alert")).not.toContainText("private server detail");
		});
