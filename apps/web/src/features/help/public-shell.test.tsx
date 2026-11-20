import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { LandingFooter } from "../homepage/footer";
import { LandingHeader } from "../homepage/header";
import { LocaleProvider } from "../locale/provider";
import { PublicShell } from "./public-shell";
import { sessionQueryKey } from "@/libs/root-context";

afterEach(cleanup);

it.each(["content", "landing"] as const)(
	"composes acquisition actions in a single %s public shell",
	async (variant) => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		const queryClient = new QueryClient();
		queryClient.setQueryData(sessionQueryKey, null);
		const root = createRootRoute({
			component: () => (
				<LocaleProvider locale="en-US" session={null}>
					<PublicShell
						variant={variant}
						title="Public page"
						headerActions={<LandingHeader />}
						footer={<LandingFooter />}
					>
						<p>Page content</p>
					</PublicShell>
				</LocaleProvider>
			),
		});
		const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) });
		await router.load();
		render(
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</I18nProvider>,
		);
		expect(screen.getAllByRole("main")).toHaveLength(1);
		expect(screen.getAllByRole("banner")).toHaveLength(1);
		const brandMarks = screen.getByRole("banner").querySelectorAll('[data-slot="brand-mark"]');
		expect(brandMarks).toHaveLength(2);
		for (const mark of brandMarks) {
			expect(mark).toHaveAttribute("data-once", String(variant === "landing"));
		}
		expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
		expect(screen.getByRole("contentinfo")).toHaveClass(variant === "landing" ? "bg-sunken" : "bg-surface");
		expect(screen.getByRole("main").id).toBe("main-content");
		expect(screen.getByRole("link", { name: "Start free" }).getAttribute("href")).toContain("/auth/register");
		expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toContain("/auth/login");
		expect(screen.getByRole("link", { name: "Skip to main content" }).getAttribute("href")).toBe("#main-content");
	},
);
