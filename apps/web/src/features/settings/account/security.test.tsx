// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { SecuritySection } from "./security";

vi.mock("./auth-hooks", () => ({
	useAuthAccounts: () => ({
		hasAccount: () => true,
		getAccountByProviderId: () => ({ updatedAt: "2026-10-31T22:30:00Z" }),
	}),
	useEnabledProviders: () => ({ enabledProviders: {} }),
	useAuthProviderActions: () => ({ link: vi.fn(), unlink: vi.fn() }),
	getProviderName: (value: string) => value,
}));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [] }),
	useMutation: () => ({}),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: vi.fn(), usePrompt: vi.fn() }));
vi.mock("@/hooks/use-current-session", () => ({ useCurrentSession: () => null }));

afterEach(cleanup);

it.each([
	["ar-SA", "نوفمبر 2026"],
	["en-US", "November 2026"],
])("formats the security date in %s with Gregorian/Latin/Riyadh policy", (locale, expected) => {
	i18n.loadAndActivate({ locale, messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<SecuritySection />
		</I18nProvider>,
	);
	expect(screen.getByText(`Last changed in ${expected}`)).toBeDefined();
});
