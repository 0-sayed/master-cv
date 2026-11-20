import type { ReactNode } from "react";
// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LegalPage } from "./page";

vi.mock("@/features/public-copy", () => ({ usePublicCopy: () => (key: string) => key }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@/libs/public-seo", () => ({ usePublicSeo: () => {} }));
vi.mock("@/features/homepage/footer", () => ({ LandingFooter: () => null }));
vi.mock("@/features/homepage/header", () => ({ LandingHeader: () => null }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
	useNavigate: () => vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

it("discloses the AI processors and route controls on the public privacy page", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<LegalPage tab="privacy" />
		</I18nProvider>,
	);
	expect(screen.getByText(/OpenRouter.*Microsoft Azure.*Together AI.*zero data retention.*train/i)).toBeVisible();
	expect(screen.getByText(/We plan to move hosting to Saudi Arabia later\./)).toBeVisible();
	expect(screen.queryByText(/T012|synthetic CV data/)).toBeNull();
	expect(screen.queryByText(/pending.*(?:owner|approval)|بانتظار.*المالك/i)).toBeNull();
});
