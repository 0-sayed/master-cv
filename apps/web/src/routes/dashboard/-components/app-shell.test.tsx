// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { AppShell } from "./app-shell";
import { getUiLocaleMessages } from "@/libs/locale";

const state = vi.hoisted(() => ({
	breakpoint: "desktop",
	collapsed: false,
	path: "/dashboard",
	trash: 0,
	count: 1,
	open: vi.fn(),
	toggle: vi.fn(),
	locale: vi.fn(),
	theme: vi.fn(),
}));
const user = {
	id: "synthetic",
	name: "Sidebar Owner",
	email: "sidebar@example.test",
	username: "sidebar",
	image: null,
};
vi.mock("@tanstack/react-hotkeys", () => ({ useHotkey: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: ({ kind }: { kind: string }) => ({
		data:
			kind === "counts"
				? { resume: state.count, letter: 0, trash: state.trash }
				: Array.from({ length: state.count }, () => ({ status: "active" })),
	}),
	useQueryClient: () => ({ clear: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		viewTransition: _transition,
		...props
	}: {
		to: string;
		children?: ReactNode;
		viewTransition?: boolean;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	useMatchRoute:
		() =>
		({ to, fuzzy }: { to: string; fuzzy?: boolean }) =>
			fuzzy ? state.path.startsWith(to) : state.path === to,
	useRouteContext: ({ from }: { from: string }) => {
		if (state.path === "/help" && from !== "__root__") throw new Error("Help has no dashboard route context");
		return { session: { user } };
	},
	useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
		select({ location: { pathname: state.path } }),
	useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => state.breakpoint }));
vi.mock("@/hooks/use-sidebar-preference", () => ({
	useSidebarPreference: () => ({ collapsed: state.collapsed, toggle: state.toggle }),
}));
vi.mock("@/hooks/use-current-session", () => ({ useCurrentSession: () => ({ user }) }));
vi.mock("@/dialogs/store", () => ({
	useDialogStore: (select: (value: unknown) => unknown) => select({ openDialog: state.open }),
}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { documents: { counts: { queryOptions: () => ({ kind: "counts" }) } } },
}));
vi.mock("@/features/applications/queries", () => ({ applicationsListQueryOptions: () => ({ kind: "applications" }) }));
vi.mock("@/features/documents/copy.generated", () => ({ useDocumentsCopy: () => () => "Documents" }));
vi.mock("@/features/career/copy.generated", () => ({ useCareerCopy: () => () => "Career" }));
vi.mock("@/features/auth/components/guest-banner", () => ({ GuestBanner: () => null }));
vi.mock("@/features/command-palette/trigger", () => ({
	CommandPaletteTrigger: () => <button type="button">Search</button>,
}));
vi.mock("@/features/locale/switch", () => ({ LocaleSwitch: () => null }));
vi.mock("@/features/theme/toggle-button", () => ({ ThemeToggleButton: () => null }));
vi.mock("@/features/locale/provider", () => ({
	useUiLocale: () => ({ locale: "en-US", pending: false, changeLocale: state.locale }),
}));
vi.mock("@/features/theme/provider", () => ({ useTheme: () => ({ theme: "light", setTheme: state.theme }) }));
vi.mock("@/libs/auth/client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@/libs/browser-storage", () => ({ clearPersonalStorage: vi.fn() }));
vi.mock("@/features/resume/builder/draft", () => ({ isEditableElementFocused: () => false }));
vi.mock("@/components/query-skeleton", () => ({ QuerySkeleton: () => null }));
vi.mock("@/components/layout/mobile-tab-indicator", () => ({ MobileTabIndicator: () => null }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	state.collapsed = false;
	state.breakpoint = "desktop";
	state.path = "/dashboard";
	state.trash = 0;
	state.count = 1;
});
function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<AppShell>
				<h1>Workspace</h1>
			</AppShell>
		</I18nProvider>,
	);
}
it("opens the existing new-document flow and groups Trash with the main destinations", () => {
	show();
	const sidebar = screen.getByRole("complementary");
	fireEvent.click(within(sidebar).getByRole("button", { name: "New CV" }));
	expect(state.open).toHaveBeenCalledExactlyOnceWith("document.new", undefined);
	const nav = within(sidebar).getByRole("navigation");
	expect(within(nav).getByRole("link", { name: "Trash" }).getAttribute("href")).toBe("/dashboard/trash");
	expect(within(nav).queryByRole("link", { name: "Settings" })).toBeNull();
	expect(within(nav).getByRole("link", { name: "Trash" }).textContent).toBe("Trash");
});
it("keeps the account active on the Help deep link outside dashboard routing", () => {
	state.path = "/help";
	show();
	expect(screen.getByRole("button", { name: /Sidebar Owner/ })).toHaveAttribute("aria-current", "page");
	expect(screen.getByRole("complementary")).toBeDefined();
});

it("keeps the account active for nested settings and exposes the five account actions", async () => {
	state.path = "/dashboard/settings/privacy";
	show();
	const trigger = screen.getByRole("button", { name: /Sidebar Owner/ });
	expect(trigger.getAttribute("aria-current")).toBe("page");
	expect(trigger.textContent).toContain(user.email);
	fireEvent.click(trigger);
	const menu = await screen.findByRole("menu");
	expect(
		within(menu)
			.getAllByRole("menuitem")
			.map((item) => item.textContent),
	).toEqual(["Settings", "Help", "Language", "Theme", "Sign out"]);
});
it("retains creation and account access in the rail, with a positive Trash badge", () => {
	state.collapsed = true;
	state.trash = 2;
	show();
	expect(screen.getByRole("button", { name: "New CV" })).toBeDefined();
	expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeDefined();
	const trash = screen.getByRole("link", { name: "Trash, 2 items" });
	expect(trash.textContent).toContain("2");
	expect(screen.getByRole("button", { name: /Account/ })).toBeDefined();
});
it("keeps bottom navigation on phones with Trash and the same account menu", async () => {
	state.breakpoint = "mobile";
	show();
	expect(screen.queryByRole("complementary")).toBeNull();
	const nav = screen.getByRole("navigation");
	expect(within(nav).getByRole("link", { name: "Trash" })).toBeDefined();
	fireEvent.click(within(nav).getByRole("button", { name: /Account/ }));
	expect(await screen.findByRole("menuitem", { name: "Settings" })).toBeDefined();
});

it("applies a theme from the account submenu through the shared provider", async () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Sidebar Owner/ }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Theme" }));
	fireEvent.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
	expect(state.theme).toHaveBeenCalledExactlyOnceWith("dark");
});
it("switches only the interface locale through the account submenu", async () => {
	state.locale.mockResolvedValue(undefined);
	show();
	fireEvent.click(screen.getByRole("button", { name: /Sidebar Owner/ }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Language" }));
	fireEvent.click(await screen.findByRole("menuitemradio", { name: "Arabic" }));
	expect(state.locale).toHaveBeenCalledExactlyOnceWith("ar-SA");
});

it("updates mounted sidebar labels after switching from Arabic to English", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	render(
		<I18nProvider i18n={i18n}>
			<AppShell>
				<h1>Workspace</h1>
			</AppShell>
		</I18nProvider>,
	);
	expect(screen.getByRole("link", { name: "سلة المهملات" })).toBeDefined();
	fireEvent.click(screen.getByRole("button", { name: /Sidebar Owner/ }));
	expect(await screen.findByRole("menuitem", { name: "الإعدادات" })).toBeDefined();
	const english = await getUiLocaleMessages("en-US");
	await act(() => i18n.loadAndActivate(english));
	expect(screen.getByRole("link", { name: "Trash" })).toBeDefined();
	expect(screen.queryByRole("link", { name: "سلة المهملات" })).toBeNull();
	expect(await screen.findByRole("menuitem", { name: "Settings" })).toBeDefined();
});

for (const collapsed of [false, true]) {
	it.each([1, 12, 120])(
		"exposes full totals and caps compact badges at %i in " + (collapsed ? "rail" : "expanded") + " navigation",
		(count) => {
			state.collapsed = collapsed;
			state.count = count;
			state.trash = count;
			show();
			for (const label of ["Documents", "Applications", "Trash"]) {
				const link = screen.getByRole("link", { name: `${label}, ${count} ${count === 1 ? "item" : "items"}` });
				const badge = link.querySelector('[data-slot="sidebar-count-badge"]');
				expect(badge?.textContent).toBe(count > 99 ? "99+" : String(count));
				expect(badge?.getAttribute("aria-hidden")).toBe("true");
				expect(badge?.getAttribute("dir")).toBeNull();
				expect(badge?.querySelector("bdi")?.getAttribute("dir")).toBe("ltr");
			}
		},
	);
}

it("omits zero totals and uses the shared labelled panel toggle", () => {
	state.count = 0;
	show();
	expect(document.querySelector('[data-slot="sidebar-count-badge"]')).toBeNull();
	const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
	expect(toggle.getAttribute("aria-expanded")).toBe("true");
	expect(toggle.getAttribute("data-variant")).toBe("quiet");
	fireEvent.click(toggle);
	expect(state.toggle).toHaveBeenCalledTimes(1);
});

it.each([1, 12, 120])("keeps Arabic accessible counts in Latin digits at %i", async (count) => {
	state.collapsed = true;
	state.trash = count;
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	render(
		<I18nProvider i18n={i18n}>
			<AppShell>
				<h1>Workspace</h1>
			</AppShell>
		</I18nProvider>,
	);
	const link = screen.getByRole("link", { name: new RegExp(`سلة المهملات، ${count} `) });
	expect(link.textContent).toBe(count > 99 ? "99+" : String(count));
});
