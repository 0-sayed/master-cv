// @vitest-environment happy-dom
import type { UiLocale } from "@reactive-resume/utils/locale";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { ClosingCta } from "./cta";
import { LandingHeader } from "./header";
import { sessionQueryKey } from "@/libs/auth/identity";
import { getUiLocaleMessages } from "@/libs/locale";

const state = vi.hoisted(() => ({ locale: "en-US" as UiLocale }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: state.locale }) }));
vi.mock("@/features/user/dropdown-menu", () => ({ UserDropdownMenu: () => null }));
vi.mock("@/libs/auth/session", () => ({ getSession: () => new Promise(() => {}) }));

async function setup(locale: UiLocale, signedIn = false, resolved = true) {
	state.locale = locale;
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	if (resolved)
		queryClient.setQueryData(sessionQueryKey, signedIn ? { user: { id: "synthetic", name: "Demo" } } : null);
	const root = createRootRoute({
		component: () => (
			<>
				<header>
					<LandingHeader />
				</header>
				<ClosingCta />
			</>
		),
	});
	const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) });
	await router.load();
	render(
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<RouterProvider router={router} />
			</I18nProvider>
		</QueryClientProvider>,
	);
	return queryClient;
}

it.each(["ar-SA", "en-US"] as const)("offers one truthful action for both %s identities", async (locale) => {
	const queryClient = await setup(locale);
	const heading = locale === "ar-SA" ? "يلا، نرتّب سيرتك الحين؟" : "Ready to put your CV in order?";
	const section = screen.getByRole("region", { name: heading });
	const action = within(section).getByRole("link", { name: locale === "ar-SA" ? "يلا، ابدأ مجانًا" : "Start free" });
	expect(within(section).getAllByRole("link")).toHaveLength(1);
	const url = new URL(action.getAttribute("href") ?? "", "https://sirawise.test");
	expect(url.pathname).toBe("/auth/register");
	expect(url.searchParams.get("locale")).toBe(locale);
	expect(url.searchParams.get("callbackURL")).toBe("/dashboard");
	expect(section).toHaveClass("bg-accent-soft", "text-accent-text");
	expect(section).not.toHaveClass("dark", "landing-aurora");
	expect(section.querySelector("p, [data-slot=brand-icon]")).toBeNull();
	await act(() => queryClient.setQueryData(sessionQueryKey, { user: { id: "synthetic", name: "Demo" } }));
	const label = locale === "ar-SA" ? "افتح مساحة عملي" : "Open my workspace";
	await waitFor(() => expect(within(section).getByRole("link", { name: label })).toBeTruthy());
	const closing = within(section).getByRole("link", { name: label });
	const header = within(screen.getByRole("banner")).getByRole("link", { name: label });
	expect(closing.getAttribute("href")).toBe(`/dashboard?locale=${locale}`);
	expect(header.getAttribute("href")).toBe(closing.getAttribute("href"));
	await act(() => queryClient.setQueryData(sessionQueryKey, null));
	await waitFor(() => expect(within(section).getByRole("link").getAttribute("href")).toContain("/auth/register"));
	expect(within(section).getAllByRole("link")).toHaveLength(1);
	expect(within(section).getByRole("link").getAttribute("href")).toContain("/auth/register");
});

it("keeps unresolved and failed session reads from becoming guest actions", async () => {
	const queryClient = await setup("en-US", false, false);
	const section = screen.getByRole("region", { name: "Ready to put your CV in order?" });
	expect(within(section).queryByRole("link")).toBeNull();
	await act(() =>
		queryClient
			.getQueryCache()
			.find({ queryKey: sessionQueryKey })
			?.setState({ status: "error", error: new Error("Unavailable") }),
	);
	expect(within(section).queryByRole("link")).toBeNull();
	expect(within(screen.getByRole("banner")).queryByRole("link")).toBeNull();
	queryClient.clear();
});
