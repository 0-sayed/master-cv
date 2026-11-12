import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const queryState = vi.hoisted(() => ({ loading: false, reserved: 0 }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: ({ queryKey }: { queryKey: string[] }) => ({
		data: queryState.loading
			? undefined
			: queryKey[0] === "availability"
				? { state: "ready", reason: null }
				: { operations: { remaining: 0, reserved: queryState.reserved } },
	}),
}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		ai: {
			availability: { queryOptions: () => ({ queryKey: ["availability"] }) },
			usage: { get: { queryOptions: () => ({ queryKey: ["usage"] }) } },
		},
	},
}));
import { WritingTab } from "./writing-tab";
afterEach(() => {
	cleanup();
	queryState.loading = false;
	queryState.reserved = 0;
});
it("announces availability loading through the shared hidden skeleton status", () => {
	queryState.loading = true;
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<WritingTab />
		</I18nProvider>,
	);
	const status = screen.getByRole("status");
	expect(status.textContent).toBe("Loading assistant availability…");
	expect(status.classList.contains("sr-only")).toBe(true);
	expect(status.closest('[aria-busy="true"]')).not.toBeNull();
});
it("renders the nonrenewing Start limit without a plans action", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<WritingTab />
		</I18nProvider>,
	);
	expect(
		screen.getByText(
			"You have used all your free assistant operations. They do not renew. You can continue editing manually and download a PDF.",
		),
	).toBeDefined();
	expect(screen.queryByRole("button", { name: /plans/i })).toBeNull();
});

it("announces a running operation instead of unavailable writing suggestions", () => {
	queryState.reserved = 1;
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<WritingTab />
		</I18nProvider>,
	);
	expect(screen.queryByText("Writing suggestions are not available yet")).toBeNull();
	expect(
		screen.getByText("An operation is already in progress. Your writing is kept.").closest('[data-slot="alert-title"]'),
	).not.toBeNull();
});
