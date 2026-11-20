import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
	createRootRoute,
	createRoute,
	createMemoryHistory,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { ATS_RULE_CODES } from "@reactive-resume/resume/ats";
import { PDF_ATS_RULE_CODES } from "@reactive-resume/resume/ats-pdf";
import { Button } from "@reactive-resume/ui/components/button";
import { FindingCard } from "./check-sections";
import { getUiLocaleMessages } from "@/libs/locale";

afterEach(cleanup);
it.each(["blocker", "warning", "tip"] as const)(
	"keeps %s findings flat with a badge and visible actions",
	(severity) => {
		i18n.load("en", {});
		i18n.activate("en");
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<FindingCard
					severity={severity}
					title="Add clear dates"
					why="Dates show when you worked."
					location="Page 1 · Experience"
					snippet="Worked here"
				>
					<Button variant="primary">Review</Button>
					<Button variant="secondary">Keep as is</Button>
				</FindingCard>
			</I18nProvider>,
		);
		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
		expect(container.querySelectorAll('[data-slot="section-card"]')).toHaveLength(1);
		const badge = container.querySelector('[data-slot="badge"]');
		expect(badge).toHaveAttribute(
			"data-variant",
			severity === "blocker" ? "danger" : severity === "warning" ? "warn" : "info",
		);
		expect(screen.getByRole("heading", { name: "Add clear dates" })).toHaveClass("type-label");
		expect(screen.getByText("Page 1 · Experience")).toHaveClass("type-meta");
		expect(screen.getByText("Worked here")).toHaveAttribute("dir", "auto");
		expect(screen.getByRole("button", { name: "Keep as is" }).closest("[data-slot=action-group]")).toHaveAttribute(
			"data-slot",
			"action-group",
		);
	},
);

it.each(["ar-SA", "en-US"] as const)(
	"links PDF and editor findings in %s without invoking document actions",
	async (locale) => {
		window.history.replaceState({}, "", "/builder/test-resume?mode=check");
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const action = vi.fn();
		const codes = [...PDF_ATS_RULE_CODES, ...ATS_RULE_CODES];
		const root = createRootRoute({
			component: () => (
				<I18nProvider i18n={i18n}>
					<Outlet />
				</I18nProvider>
			),
		});
		const source = createRoute({
			getParentRoute: () => root,
			path: "/finding",
			component: () => (
				<>
					{codes.map((code, index) => (
						<FindingCard
							key={code}
							guideCode={code}
							severity={index === 0 ? "blocker" : index === 2 ? "tip" : "warning"}
							title={code}
							why="Why"
						>
							<Button disabled onClick={action}>
								Fix
							</Button>
						</FindingCard>
					))}
				</>
			),
		});
		const guide = createRoute({
			getParentRoute: () => root,
			path: "/dashboard/review-guide",
			component: () => <p>Guide destination</p>,
		});
		const router = createRouter({
			routeTree: root.addChildren([source, guide]),
			history: createMemoryHistory({ initialEntries: ["/finding"] }),
		});
		await act(async () => {
			await router.load();
		});
		render(<RouterProvider router={router} />);
		const links = screen.getAllByRole("link", {
			name: locale === "ar-SA" ? "تعرّف على هذا الفحص" : "Learn more about this check",
		});
		expect(links).toHaveLength(codes.length);
		for (let index = 0; index < codes.length; index++) {
			expect(links[index]).toHaveAttribute(
				"href",
				`/dashboard/review-guide?locale=${locale}&returnTo=%2Fbuilder%2Ftest-resume%3Fmode%3Dcheck#rule-${codes[index]}`,
			);
			expect(links[index]?.closest('[data-slot="action-group"]')).not.toBeNull();
			expect(links[index]).toHaveAttribute("aria-label");
			links[index]?.focus();
		}
		const first = links[0];
		if (!first) throw new Error("Expected guide link");
		fireEvent.click(first);
		await waitFor(() => expect(screen.getByText("Guide destination")).toBeInTheDocument());
		expect(action).not.toHaveBeenCalled();
	},
);
