import { beforeEach, describe, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { getUiLocaleMessages } from "./locale";
import { formatPageTitle, getRouteTitle } from "./route-titles";

const titles = [
	["/auth/login", "تسجيل الدخول", "Sign in"],
	["/auth/register", "إنشاء حساب", "Create an account"],
	["/auth/forgot-password", "استعادة كلمة المرور", "Reset password"],
	["/auth/reset-password", "كلمة مرور جديدة", "New password"],
	["/auth/verify-email", "تأكيد بريدك الإلكتروني", "Verify your email address"],
	["/auth/verify-2fa", "المصادقة الثنائية", "Two-Factor Authentication"],
	["/auth/verify-2fa-backup", "التحقق باستخدام رمز نسخ احتياطي", "Verify with a Backup Code"],
	["/auth/error", "لم يكتمل تسجيل الدخول", "Sign-in didn't complete"],
	["/auth/consent", "قم بتوصيل التطبيق", "Connect an application"],
	["/auth/native-callback", "افتح تطبيق Master CV", "Open the Master CV app"],
	["/auth/resume-password", "هذه السيرة الذاتية محمية بكلمة مرور", "This resume is password protected"],
	["/dashboard/", "مستنداتي", "My documents"],
	["/dashboard/career/information", "المعلومات المهنية", "Career information"],
	["/dashboard/applications/", "طلبات التقديم", "Applications"],
	["/dashboard/applications/$applicationId/{-$tab}", "طلبات التقديم", "Applications"],
	["/dashboard/settings/", "الإعدادات", "Settings"],
	["/dashboard/settings/account", "الحساب", "Account"],
	["/dashboard/settings/preferences", "التفضيلات", "Preferences"],
	["/dashboard/settings/ai", "الإعدادات", "Settings"],
	["/dashboard/trash", "سلة المهملات", "Trash"],
	["/dashboard/career/", "المسار المهني", "Career"],
	["/dashboard/career/coach/{-$conversationId}", "المدرّب", "Coach"],
	["/dashboard/career/knowledge", "المعرفة", "Knowledge"],
	["/dashboard/career/knowledge/facts", "الحقائق", "Facts"],
	["/dashboard/career/knowledge/stories/{-$storyId}", "القصص", "Stories"],
	["/dashboard/career/knowledge/preferences", "التفضيلات", "Preferences"],
	["/dashboard/career/offers", "العروض", "Offers"],
	["/templates/$", "القالب", "Template"],
	["/$username/$slug", "لم تتم مشاركة هذه السيرة الذاتية في الوقت الحالي.", "This resume isn't shared right now."],
	["__root__", "لم نتمكن من العثور على تلك الصفحة", "We couldn't find that page"],
] as const;

describe.each(["ar-SA", "en-US"] as const)("%s route titles", (locale) => {
	beforeEach(async () => i18n.loadAndActivate(await getUiLocaleMessages(locale)));
	it.each(titles)("names %s with the matching surface copy", (route, ar, en) => {
		expect(getRouteTitle(route)).toBe(`${locale === "ar-SA" ? ar : en} — Master CV`);
	});
	it("includes the welcome name without changing the saved user content", () => {
		expect(getRouteTitle("/dashboard/welcome", { name: "سارة العتيبي" })).toBe(
			`${locale === "ar-SA" ? "مرحبًا سارة العتيبي، لنبدأ بسيرتك" : "Welcome سارة العتيبي, let us start your CV"} — Master CV`,
		);
	});
	it("lets public marketing routes retain their curated SEO metadata", () => {
		expect(getRouteTitle("/_home/")).toBeUndefined();
		expect(getRouteTitle("/_home/ats-checker")).toBeUndefined();
	});
});

it("preserves Arabic, English and mixed-direction document names", () => {
	expect(formatPageTitle("سارة — Senior Engineer")).toBe("سارة — Senior Engineer — Master CV");
});
