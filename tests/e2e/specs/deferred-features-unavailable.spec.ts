import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"]) {
	for (const width of [1440, 390]) {
		test(`deferred features have no entry points or working deep links in ${locale} at ${width}px`, async ({
			authPage: page,
		}) => {
			await page.goto("/dashboard");
			const origin = new URL(page.url()).origin;
			await page.request.post("/api/auth/update-user", { data: { uiLocale: locale }, headers: { origin } });
			await page.context().addCookies([{ name: "locale", value: locale, url: origin }]);
			await page.setViewportSize({ width, height: 900 });
			const response = await page.request.post("/api/openapi/applications", {
				data: { company: "Synthetic employer", role: "Engineer", status: "saved" },
			});
			await expect(response).toBeOK();
			const applicationId = (await response.json()) as string;
			await page.goto(`/dashboard/applications/${applicationId}?coach=true&locale=${locale}`);
			await expect(page.getByRole("heading", { name: "Engineer", exact: true })).toBeVisible();
			await expect(
				page.getByRole("tab", { name: /التحضير|تمرّن|ما بعد المقابلة|الرسائل|Prepare|Practise|Debrief|Messages/u }),
			).toHaveCount(0);
			await expect(
				page.getByRole("button", { name: /Open workspace|افتح مساحة العمل|اسأل المدرّب|Assistant/u }),
			).toHaveCount(0);
			await expect(
				page.locator(
					'a[href*="settings/ai"],a[href*="settings/api-keys"],a[href*="integrations"],a[href*="career/coach"]',
				),
			).toHaveCount(0);
			await expect(page.getByLabel(/API key|مفتاح API/u)).toHaveCount(0);
			for (const path of [
				"/dashboard/settings/ai",
				"/dashboard/settings/api-keys",
				"/dashboard/settings/integrations",
				"/dashboard/settings/job-search",
				"/dashboard/career/coach",
				"/dashboard/career/offers",
				"/dashboard/career/knowledge/facts",
				"/agent/new",
				"/auth/consent",
				"/auth/resume-password",
				...["prepare", "practise", "debrief", "messages"].map(
					(tab) => `/dashboard/applications/${applicationId}/${tab}?coach=true`,
				),
			]) {
				await page.goto(`${path}${path.includes("?") ? "&" : "?"}locale=${locale}`);
				await expect(
					page.getByText(locale === "ar-SA" ? "غير متاح" : "Not available", { exact: true }).first(),
				).toBeVisible();
				await expect(page.locator('input[type="password"]')).toHaveCount(0);
			}
			for (const path of [
				"/api/openapi/ai-providers",
				"/api/openapi/integrations/web-access",
				"/api/openapi/agent/threads",
				"/api/openapi/auth/api-keys",
				"/api/openapi/resumes/synthetic/not-shared",
				"/mcp",
				"/api/auth/api-key/list",
			]) {
				expect((await page.request.get(path)).status()).toBe(403);
			}
			await page.goto(`/dashboard?locale=${locale}`);
			const createdResume = await page.request.post("/api/openapi/resumes", {
				data: { name: "Synthetic private CV", tags: [] },
			});
			await expect(createdResume).toBeOK();
			const resumeId = (await createdResume.json()) as string;
			const publish = await page.request.put(`/api/openapi/resumes/${resumeId}`, { data: { isPublic: true } });
			expect(publish.status()).toBe(403);
			const savedResume = await page.request.get(`/api/openapi/resumes/${resumeId}`);
			expect((await savedResume.json()).isPublic).toBe(false);
			// Keyboard events do not wait for the async router to commit and register hotkeys.
			await settleScreen(page);
			await page.keyboard.press("ControlOrMeta+k");
			const search = page.getByRole("dialog").getByRole("combobox", {
				name: locale === "ar-SA" ? "البحث في الأوامر" : "Search commands",
				exact: true,
			});
			await search.fill("Assistant");
			await expect(
				page.getByRole("option", { name: /Assistant conversations|Ask the assistant|محادثات المساعد/u }),
			).toHaveCount(0);
		});
	}
}
