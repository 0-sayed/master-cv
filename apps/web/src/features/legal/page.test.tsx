import type { ReactNode } from "react";
// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LegalPage } from "./page";
import { getUiLocaleMessages } from "@/libs/locale";
const { messages: arabic } = await getUiLocaleMessages("ar-SA");

vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@/libs/public-seo", () => ({ usePublicSeo: () => {} }));
vi.mock("@/features/homepage/footer", () => ({ LandingFooter: () => null }));
vi.mock("@/features/homepage/header", () => ({ LandingHeader: () => null }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
	useNavigate: () => vi.fn(),
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it.each(["ar-SA", "en-US"])("discloses the draft, AI processors and qualified route controls in %s", (locale) => {
	i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabic : {} });
	render(
		<I18nProvider i18n={i18n}>
			<LegalPage tab="privacy" />
		</I18nProvider>,
	);
	expect(
		screen.getByText(
			locale === "ar-SA"
				? "مسودة للمراجعة — ليست سياسة نهائية معتمدة."
				: "Review draft — not an approved final policy.",
		),
	).toBeVisible();
	expect(
		screen.getByText(/OpenRouter.*Microsoft Azure.*Together AI.*(?:zero data retention|انعدام الاحتفاظ بالبيانات)/i),
	).toBeVisible();
	expect(
		screen.getByText(/Provider terms govern actual handling|تخضع المعالجة الفعلية لشروط مزوّدي الخدمة/),
	).toBeVisible();
	expect(
		screen.getByText(
			locale === "ar-SA" ? /نخطط لنقل الاستضافة إلى السعودية لاحقًا/ : /We plan to move hosting to Saudi Arabia later\./,
		),
	).toBeVisible();
	expect(screen.queryByText(/T012|synthetic CV data/)).toBeNull();
	expect(screen.queryByText(/pending.*(?:owner|approval)|بانتظار.*المالك/i)).toBeNull();
});
