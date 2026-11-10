import type { Page } from "@playwright/test";
import { createSampleResumeFromDashboard, makeResumePublic } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

async function saveLocale(page: Page, baseURL: string | undefined, locale: string) {
	if (!baseURL) throw new Error("Browser baseURL missing");
	await expect(
		await page.request.post("/api/auth/update-user", {
			headers: { origin: baseURL },
			data: { uiLocale: locale },
		}),
	).toBeOK();
	await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
}

// Explicit expectations deliberately do not derive from the application's title registry.
const authTitles = [
	["/auth", "تسجيل الدخول", "Sign in"],
	["/auth/login", "تسجيل الدخول", "Sign in"],
	["/auth/register", "إنشاء حساب", "Create an account"],
	["/auth/forgot-password", "استعادة كلمة المرور", "Reset password"],
	["/auth/reset-password?token=synthetic-title-check", "كلمة مرور جديدة", "New password"],
	["/auth/verify-email", "تأكيد بريدك الإلكتروني", "Verify your email address"],
	["/auth/error", "لم يكتمل تسجيل الدخول", "Sign-in didn't complete"],
	["/auth/verify-2fa", "المصادقة الثنائية", "Two-Factor Authentication"],
	["/auth/verify-2fa-backup", "التحقق باستخدام رمز نسخ احتياطي", "Verify with a Backup Code"],
	[
		"/auth/resume-password?redirect=%2Fsynthetic%2Fdocument",
		"هذه السيرة الذاتية محمية بكلمة مرور",
		"This resume is password protected",
	],
	["/auth/native-callback", "افتح تطبيق Master CV", "Open the Master CV app"],
] as const;

const dashboardTitles = [
	["/dashboard", "مستنداتي", "My documents"],
	["/dashboard/career/information", "المعلومات المهنية", "Career information"],
	["/dashboard/applications", "طلبات التقديم", "Applications"],
	["/dashboard/settings", "الحساب", "Account"],
	["/dashboard/settings/account", "الحساب", "Account"],
	["/dashboard/settings/preferences", "التفضيلات", "Preferences"],
	["/dashboard/settings/ai", "الإعدادات", "Settings"],
	["/dashboard/trash", "سلة المهملات", "Trash"],
	["/dashboard/career", "المسار المهني", "Career"],
	["/dashboard/career/coach", "المدرّب", "Coach"],
	["/dashboard/career/knowledge", "المعرفة", "Knowledge"],
	["/dashboard/career/knowledge/facts", "الحقائق", "Facts"],
	["/dashboard/career/knowledge/stories", "القصص", "Stories"],
	["/dashboard/career/knowledge/preferences", "التفضيلات", "Preferences"],
	["/dashboard/career/offers", "العروض", "Offers"],
	// Retained upstream addresses must take their destination's title after redirecting.
	["/dashboard/settings/profile", "الحساب", "Account"],
	["/dashboard/settings/authentication", "الحساب", "Account"],
	["/dashboard/settings/integrations", "الإعدادات", "Settings"],
	["/dashboard/settings/job-search", "الإعدادات", "Settings"],
	["/dashboard/settings/api-keys", "الإعدادات", "Settings"],
	["/dashboard/resumes", "مستنداتي", "My documents"],
	["/dashboard/cover-letters", "مستنداتي", "My documents"],
	["/agent", "مستنداتي", "My documents"],
	["/agent/new", "مستنداتي", "My documents"],
	["/agent/synthetic-title-check", "مستنداتي", "My documents"],
	["/auth/consent", "قم بتوصيل التطبيق", "Connect an application"],
] as const;

for (const locale of ["ar-SA", "en-US"] as const) {
	const labelIndex = locale === "ar-SA" ? 1 : 2;
	test(`${locale} auth routes have explicit translated tab titles`, async ({ page }) => {
		test.setTimeout(90_000);
		for (const [path, ar, en] of authTitles) {
			await page.goto(`${path}${path.includes("?") ? "&" : "?"}locale=${locale}`);
			await expect(page).toHaveTitle(`${locale === "ar-SA" ? ar : en} — Master CV`);
		}
	});

	test(`${locale} dashboard and settings routes have explicit translated tab titles`, async ({
		authPage: page,
		baseURL,
	}) => {
		test.setTimeout(120_000);
		await saveLocale(page, baseURL, locale);
		await page.setViewportSize({ width: 1440, height: 1024 });
		for (const entry of dashboardTitles) {
			await page.goto(`${entry[0]}?locale=${locale}`);
			await expect(page).toHaveTitle(`${entry[labelIndex]} — Master CV`);
		}
		const created = await page.request.post("/api/openapi/applications", {
			data: { company: "Synthetic title check", role: "Engineer", status: "saved" },
		});
		await expect(created).toBeOK();
		const applicationId = (await created.json()) as string;
		await page.goto(`/dashboard/applications/${applicationId}?locale=${locale}`);
		await expect(page).toHaveTitle(`${locale === "ar-SA" ? "طلبات التقديم" : "Applications"} — Master CV`);
	});

	test(`${locale} settings is in the bottom group before account on desktop and rail`, async ({
		authPage: page,
		baseURL,
	}) => {
		await saveLocale(page, baseURL, locale);
		for (const width of [1440, 768]) {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard/settings/account?locale=${locale}`);
			const aside = page.getByRole("complementary");
			await expect(aside.locator("nav a").first()).toBeVisible();
			expect(
				await aside.locator("nav a").evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
			).toEqual(["/dashboard", "/dashboard/career/information", "/dashboard/applications"]);
			const settings = aside.locator('a[href="/dashboard/settings"]');
			await expect(settings).toHaveAttribute("aria-current", "page");
			const group = settings.locator("..");
			const account = group.locator('button:has([data-slot="avatar"])');
			await expect(account).toBeVisible();
			expect(await settings.evaluate((el) => el.closest("nav"))).toBeNull();
			await settings.focus();
			await page.keyboard.press("Tab");
			await expect(account).toBeFocused();
			const settingsBox = await settings.boundingBox();
			const accountBox = await account.boundingBox();
			if (!settingsBox || !accountBox) throw new Error("Bottom account group missing");
			expect(settingsBox.y).toBeGreaterThan(500);
			expect(settingsBox.y + settingsBox.height).toBeLessThanOrEqual(accountBox.y);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/dashboard?locale=${locale}`);
		await expect(page.locator('[data-slot="app-bottom-nav"] a')).toHaveCount(4);
		await page.locator('[data-slot="app-bottom-nav"] a[href="/dashboard/settings"]').click();
		await expect(page).toHaveTitle(`${locale === "ar-SA" ? "الإعدادات" : "Settings"} — Master CV`);
	});

	test(`${locale} titles update on client navigation and interface language changes`, async ({
		authPage: page,
		baseURL,
	}) => {
		await saveLocale(page, baseURL, locale);
		await page.setViewportSize({ width: 1440, height: 1024 });
		await page.goto(`/dashboard?locale=${locale}`);
		for (const entry of dashboardTitles.slice(1, 4)) {
			await page.getByRole("complementary").locator(`a[href="${entry[0]}"]`).click();
			await expect(page).toHaveTitle(`${entry[labelIndex]} — Master CV`);
		}
		await page
			.getByRole("button", { name: locale === "ar-SA" ? "تغيير الواجهة إلى الإنجليزية" : "Switch interface to Arabic" })
			.click();
		await expect(page).toHaveTitle(`${locale === "ar-SA" ? "Account" : "الحساب"} — Master CV`);
	});

	test(`${locale} welcome, editor and public pages use their actual names`, async ({
		authPage: page,
		account,
	}, testInfo) => {
		test.setTimeout(90_000);
		await page.goto(`/dashboard/welcome?locale=${locale}`);
		await expect(page).toHaveTitle(
			`${locale === "ar-SA" ? `مرحبًا ${account.name}، لنبدأ بسيرتك` : `Welcome ${account.name}, let us start your CV`} — Master CV`,
		);
		const name = await createSampleResumeFromDashboard(page, testInfo);
		const resumePath = new URL(page.url()).pathname;
		await page.goto(`${resumePath}?locale=${locale}`);
		await expect(page).toHaveTitle(`${name} — Master CV`);
		const letterName = "Synthetic title check — خطاب";
		const created = await page.request.post("/api/openapi/cover-letters", { data: { name: letterName } });
		await expect(created).toBeOK();
		const letter = (await created.json()) as { id: string };
		await page.goto(`/builder/letter/${letter.id}?locale=${locale}`);
		await expect(page).toHaveTitle(`${letterName} — Master CV`);
		// Existing helper uses English control names; publishing remains confined to this disposable synthetic account.
		await page.goto(`${resumePath}?locale=en-US`);
		const publicPath = await makeResumePublic(page);
		await page.goto(`${publicPath}?locale=${locale}`);
		await expect(page).toHaveTitle("E2E Test User — Master CV");
		await page.goto(`/synthetic-title-check/not-shared?locale=${locale}`);
		await expect(page).toHaveTitle(
			`${locale === "ar-SA" ? "لم تتم مشاركة هذه السيرة الذاتية في الوقت الحالي." : "This resume isn't shared right now."} — Master CV`,
		);
		await page.goto(`/?locale=${locale}`);
		await expect(page).toHaveTitle(
			`Master CV — ${locale === "ar-SA" ? "منشئ السيرة الذاتية مجاني ومفتوح المصدر" : "A free and open-source resume builder"}`,
		);
		await page.goto(`/ats-checker?locale=${locale}`);
		await expect(page).toHaveTitle(
			`${locale === "ar-SA" ? "مدقق السيرة الذاتية ATS مجانًا" : "Free ATS resume checker"} — Master CV`,
		);
		await page.goto(`/templates/azurill.pdf?locale=${locale}`);
		await expect(page).toHaveTitle(`${locale === "ar-SA" ? "القالب" : "Template"} — Master CV`);
	});
}
