// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { messages as arabicMessages } from "../../../locales/ar-SA.po";
import { LandingCompactActions, LandingHeader } from "./header";

const state = vi.hoisted(() => ({
	session: null as object | null,
	pending: false,
	locale: "en-US" as "ar-SA" | "en-US",
	changeLocale: vi.fn().mockResolvedValue(undefined),
}));
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
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => state }));
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
	state.locale = "en-US";
	state.changeLocale.mockClear();
	theme.resolvedTheme = "light";
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

it.each([
	{
		locale: "ar-SA",
		appearance: "light",
		menuName: "القائمة",
		languageName: "تغيير الواجهة إلى الإنجليزية",
		themeName: "التبديل إلى السمة الداكنة",
		target: "en-US",
	},
	{
		locale: "ar-SA",
		appearance: "dark",
		menuName: "القائمة",
		languageName: "تغيير الواجهة إلى الإنجليزية",
		themeName: "التبديل إلى السمة المضيئة",
		target: "en-US",
	},
	{
		locale: "en-US",
		appearance: "light",
		menuName: "Menu",
		languageName: "Switch interface to Arabic",
		themeName: "Switch to dark theme",
		target: "ar-SA",
	},
	{
		locale: "en-US",
		appearance: "dark",
		menuName: "Menu",
		languageName: "Switch interface to Arabic",
		themeName: "Switch to light theme",
		target: "ar-SA",
	},
] as const)(
	"keeps language and theme reachable in the phone menu for $locale $appearance",
	async ({ locale, appearance, menuName, languageName, themeName, target }) => {
		state.locale = locale;
		theme.resolvedTheme = appearance;
		i18n.loadAndActivate({ locale, messages: locale === "ar-SA" ? arabicMessages : {} });
		render(
			<I18nProvider i18n={i18n}>
				<LandingCompactActions />
			</I18nProvider>,
		);
		expect(screen.getByRole("button", { name: languageName })).toBeVisible();
		expect(screen.getByRole("link", { name: locale === "ar-SA" ? "ابدأ مجانًا" : "Start free" })).toBeVisible();
		expect(screen.queryByRole("button", { name: themeName })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: menuName }));
		const menu = within(await screen.findByRole("dialog", { name: menuName }));
		const language = menu.getByRole("button", { name: languageName });
		expect(language).toBeVisible();
		const toggle = menu.getByRole("button", { name: themeName });
		expect(toggle).toBeVisible();
		expect(toggle).toHaveTextContent(themeName);
		expect(toggle).toHaveAttribute("data-size", "row");
		fireEvent.click(toggle);
		expect(theme.toggleTheme).toHaveBeenCalledOnce();
		fireEvent.click(language);
		expect(state.changeLocale).toHaveBeenCalledExactlyOnceWith(target);
		expect(menu.getByRole("link", { name: locale === "ar-SA" ? "تسجيل الدخول" : "Sign in" })).toBeVisible();
	},
);
