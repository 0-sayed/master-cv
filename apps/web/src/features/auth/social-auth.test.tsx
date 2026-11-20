// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { SocialAuth } from "./components/social-auth";
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: { credential: "Password", google: "Google", passkey: "Passkey" } }),
	useQueryClient: () => ({}),
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({}), useSearch: () => ({}) }));
vi.mock("@/libs/orpc/client", () => ({ orpc: { auth: { providers: { list: { queryOptions: () => ({}) } } } } }));
vi.mock("@/libs/auth/client", () => ({ authClient: {} }));
vi.mock("@/libs/root-context", () => ({ sessionQueryKey: [] }));
beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
it("shows Google and passkey on sign-in", () => {
	render(
		<I18nProvider i18n={i18n}>
			<SocialAuth />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Google" })).toBeVisible();
	expect(screen.getByRole("button", { name: "Passkey" })).toBeVisible();
});
it("shows Google but omits sign-in-only passkeys from account creation", () => {
	render(
		<I18nProvider i18n={i18n}>
			<SocialAuth intent="sign-up" />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Google" })).toBeVisible();
	expect(screen.queryByRole("button", { name: "Passkey" })).toBeNull();
	expect(screen.getByText("or continue with")).toBeVisible();
});
