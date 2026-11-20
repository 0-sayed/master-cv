// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LandingCompactActions, LandingHeader } from "./header";

const state = vi.hoisted(() => ({ session: null as object | null, pending: false }));
const theme = vi.hoisted(() => ({ resolvedTheme: "light", toggleTheme: vi.fn() }));
vi.mock("@/features/theme/provider", () => ({ useTheme: () => theme }));
vi.mock("@/features/public-session", () => ({ usePublicSession: () => state }));
vi.mock("@/features/user/dropdown-menu", () => ({
	UserDropdownMenu: ({
		children,
	}: {
		children: (props: { session: { user: { name: string; image: null } } }) => React.ReactNode;
	}) => children({ session: { user: { name: "Demo", image: null } } }),
}));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		search,
		...props
	}: {
		to: string;
		children: React.ReactNode;
		search?: Record<string, string>;
	}) => (
		<a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>
			{children}
		</a>
	),
}));
afterEach(() => {
	cleanup();
	state.session = null;
	state.pending = false;
	theme.toggleTheme.mockClear();
});
function show(callbackURL = "/dashboard", presentation: "default" | "compact" = "default") {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	return render(
		<I18nProvider i18n={i18n}>
			<LandingHeader callbackURL={callbackURL} presentation={presentation} />
		</I18nProvider>,
	);
}
it("shows the workspace for a signed-in visitor", () => {
	state.session = {};
	show();
	expect(screen.getByRole("link", { name: "Open my workspace" }).getAttribute("href")).toMatch(/^\/dashboard(?:\?|$)/);
	expect(screen.getByRole("button", { name: /^Account$/ })).toBeDefined();
	expect(screen.queryByText("Sign in")).toBeNull();
});
it("keeps sign-in and registration for signed-out visitors", () => {
	show();
	expect(screen.getByRole("link", { name: "Sign in" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Start free" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Sign in" }).className).not.toMatch(/hidden|sm:inline-flex/);
});
it("does not render the signed-out actions during session lookup", () => {
	state.pending = true;
	const { container } = show();
	expect(screen.queryByRole("link")).toBeNull();
	expect(container.querySelector('[aria-hidden="true"]')).toBeDefined();
});
it("preserves the localized Help return destination after the session resolves", () => {
	show("/help?locale=ar-SA");
	const href = screen.getByRole("link", { name: "Sign in" }).getAttribute("href");
	expect(new URL(href ?? "", "https://sirawise.test").searchParams.get("callbackURL")).toBe("/help?locale=ar-SA");
});
it("keeps a named compact sign-in link and registration in the shared header", () => {
	show("/help?locale=en-US", "compact");
	const signIn = screen.getAllByRole("link", { name: "Sign in" });
	expect(signIn).toHaveLength(2);
	expect(signIn[0]).toHaveAttribute("data-size", "header-icon");
	expect(signIn[0]).toHaveAttribute("href", "/auth/login?locale=en-US&callbackURL=%2Fhelp%3Flocale%3Den-US");
	expect(signIn[0]).toHaveClass("sm:hidden");
	expect(signIn[1]).toHaveClass("hidden", "sm:inline-flex");
	expect(screen.getByRole("link", { name: "Start free" })).toHaveClass("px-2");
});

it("keeps the phone theme action in the navigation sheet beside the existing account actions", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<LandingCompactActions />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Switch interface to Arabic" })).toBeVisible();
	expect(screen.getByRole("link", { name: "Start free" })).toBeVisible();
	expect(screen.queryByRole("button", { name: "Switch to dark theme" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Menu" }));
	const menu = within(await screen.findByRole("dialog", { name: "Menu" }));
	const toggle = menu.getByRole("button", { name: "Switch to dark theme" });
	expect(toggle).toHaveTextContent("Switch to dark theme");
	expect(toggle).toHaveAttribute("data-size", "row");
	fireEvent.click(toggle);
	expect(theme.toggleTheme).toHaveBeenCalledOnce();
	expect(menu.getByRole("link", { name: "Sign in" })).toBeVisible();
});
