// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { HelpRoute } from "./help";

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({ useRouteContext: () => state }),
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/routes/dashboard/-components/app-shell", () => ({
	AppShell: ({ children }: { children: ReactNode }) => <main data-testid="dashboard-shell">{children}</main>,
}));
vi.mock("@/features/help/page", () => ({ HelpPage: () => <form aria-label="Help contact form" /> }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@/libs/public-seo", () => ({ usePublicSeo: vi.fn() }));
vi.mock("@/features/locale/switch", () => ({ LocaleSwitch: () => <button type="button">Language</button> }));

afterEach(() => {
	cleanup();
	state.session = null;
});

function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<HelpRoute />
		</I18nProvider>,
	);
}

it("renders signed-out Help with home and sign-in navigation in the top header", () => {
	show();
	const header = within(screen.getByRole("banner"));
	expect(header.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
	expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/login");
	expect(screen.queryByTestId("dashboard-shell")).toBeNull();
	expect(screen.getByRole("form", { name: "Help contact form" })).toBeDefined();
});

it("uses the already-resolved signed-in session and retains the Help form and page header", () => {
	state.session = { user: { id: "synthetic-help" } };
	show();
	expect(screen.getByTestId("dashboard-shell")).toBeDefined();
	expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
	expect(screen.getByRole("heading", { level: 1, name: "Help and contact" })).toBeDefined();
	expect(screen.getByRole("form", { name: "Help contact form" })).toBeDefined();
});
