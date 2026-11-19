// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { LocaleProvider } from "./provider";
import { LocaleSwitch } from "./switch";
import { getUiLocaleMessages } from "@/libs/locale";

const updateUser = vi.hoisted(() => vi.fn());
vi.mock("@/libs/auth/client", () => ({ authClient: { updateUser } }));
vi.mock("@/libs/root-context", () => ({ sessionQueryKey: ["auth", "session"] }));
vi.mock("@/libs/ui-fonts", () => ({ loadUiFonts: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => updateUser.mockReset());

async function setup(choices = true) {
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	const root = createRootRoute({
		component: () => (
			<LocaleProvider locale="en-US" session={{ user: { id: "synthetic-account" } }}>
				<LocaleSwitch presentation={choices ? "choices" : "toggle"} />
			</LocaleProvider>
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/?locale=en-US#faq"] }),
	});
	await router.load();
	render(
		<QueryClientProvider client={new QueryClient()}>
			<I18nProvider i18n={i18n}>
				<RouterProvider router={router} />
			</I18nProvider>
		</QueryClientProvider>,
	);
	return router;
}

it("shows both language names and marks the current choice", async () => {
	await setup();
	const group = screen.getByRole("group", { name: "Interface language" });
	expect(within(group).getAllByRole("button", { pressed: true })).toHaveLength(1);
	const english = within(group).getByRole("button", { name: "English", pressed: true });
	expect(english).toHaveAttribute("lang", "en-US");
	expect(english).toHaveAttribute("dir", "ltr");
	const arabic = within(group).getByRole("button", { name: "العربية", pressed: false });
	expect(arabic).toHaveAttribute("lang", "ar-SA");
	expect(arabic).toHaveAttribute("dir", "rtl");
	await userEvent.click(english);
	expect(updateUser).not.toHaveBeenCalled();
});

it("blocks duplicate changes while pending", async () => {
	let release!: (value: { error: null }) => void;
	updateUser.mockReturnValueOnce(
		new Promise((resolve) => {
			release = resolve;
		}),
	);
	await setup();
	await userEvent.click(screen.getByRole("button", { name: "العربية" }));
	await waitFor(() => expect(updateUser).toHaveBeenCalledOnce());
	for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
	expect(screen.getAllByRole("status")).toHaveLength(1);
	expect(screen.getByRole("status")).not.toBeEmptyDOMElement();
	await userEvent.click(screen.getByRole("button", { name: "العربية" }));
	expect(updateUser).toHaveBeenCalledOnce();
	await act(() => release({ error: null }));
	await waitFor(() => expect(screen.getByRole("button", { name: "العربية", pressed: true })).toBeEnabled());
	expect(screen.queryByRole("status")).toBeNull();
});

it("retains the current choice after failure and allows retry", async () => {
	updateUser.mockResolvedValueOnce({ error: { message: "Unavailable" } }).mockResolvedValueOnce({ error: null });
	const router = await setup();
	await userEvent.click(screen.getByRole("button", { name: "العربية" }));
	const alert = await screen.findByRole("alert");
	expect(screen.getAllByRole("alert")).toHaveLength(1);
	expect(screen.getByRole("button", { name: "English", pressed: true })).toBeEnabled();
	expect(router.state.location.href).toBe("/?locale=en-US#faq");
	await userEvent.click(within(alert).getByRole("button", { name: /retry/i }));
	await waitFor(() => expect(screen.getByRole("button", { name: "العربية", pressed: true })).toBeEnabled());
	expect(screen.queryByRole("alert")).toBeNull();
	expect(screen.getByRole("button", { name: "العربية" })).toHaveFocus();
	expect(updateUser).toHaveBeenCalledTimes(2);
});

it("retains the default compact toggle", async () => {
	await setup(false);
	expect(screen.getByRole("button", { name: "Switch interface to Arabic" })).toBeEnabled();
	expect(screen.queryByRole("group")).toBeNull();
});
