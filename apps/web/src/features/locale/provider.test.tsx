// @vitest-environment happy-dom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import Cookies from "js-cookie";
import { useEffect, useState } from "react";
import { LocaleProvider, useUiLocale } from "./provider";
import * as localeLibrary from "@/libs/locale";

const updateUser = vi.hoisted(() => vi.fn());
vi.mock("@/libs/auth/client", () => ({ authClient: { updateUser } }));
vi.mock("@/libs/root-context", () => ({ sessionQueryKey: ["auth", "session"] }));

function Controls() {
	const { locale, pending, changeLocale } = useUiLocale();
	return (
		<>
			<input aria-label="Unsaved draft" defaultValue="سيرتي" />
			<output>{locale}</output>
			<button
				disabled={pending}
				onClick={() => void changeLocale(locale === "ar-SA" ? "en-US" : "ar-SA").catch(() => {})}
			>
				Switch
			</button>
		</>
	);
}

async function setup(session: { user: { id: string } } | null = null) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	let changeSession: (session: { user: { id: string } } | null) => void = () => {};
	function Root() {
		const [current, setCurrent] = useState(session);
		useEffect(() => {
			changeSession = setCurrent;
		}, []);
		return (
			<QueryClientProvider client={queryClient}>
				<LocaleProvider locale="ar-SA" session={current}>
					<Controls />
				</LocaleProvider>
			</QueryClientProvider>
		);
	}
	const root = createRootRoute({ component: Root });
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/?locale=ar-SA&tab=design#preview"] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
	return { router, queryClient, changeSession };
}

describe("in-place interface switching", () => {
	beforeEach(() => {
		Cookies.remove("locale");
		updateUser.mockReset();
		vi.restoreAllMocks();
	});
	it("does not save or activate a locale whose catalog failed to load", async () => {
		vi.spyOn(localeLibrary, "getUiLocaleMessages").mockRejectedValueOnce(new Error("Catalog offline"));
		const { router } = await setup({ user: { id: "account-a" } });
		await userEvent.click(screen.getByRole("button", { name: "Switch" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Switch" })).toBeEnabled());
		expect(screen.getByRole("status")).toHaveTextContent("ar-SA");
		expect(router.state.location.search).toMatchObject({ locale: "ar-SA" });
		expect(updateUser).not.toHaveBeenCalled();
		expect(Cookies.get("locale")).toBeUndefined();
	});
	it("discards a pending switch after leaving and returning to the same account", async () => {
		const catalog = await localeLibrary.getUiLocaleMessages("en-US");
		let release: (value: typeof catalog) => void = () => {};
		vi.spyOn(localeLibrary, "getUiLocaleMessages").mockReturnValueOnce(
			new Promise((resolve) => {
				release = resolve;
			}),
		);
		const { changeSession } = await setup({ user: { id: "account-a" } });
		await userEvent.click(screen.getByRole("button", { name: "Switch" }));
		await act(() => changeSession({ user: { id: "account-b" } }));
		await act(() => changeSession({ user: { id: "account-a" } }));
		await act(() => release(catalog));
		await waitFor(() => expect(screen.getByRole("button", { name: "Switch" })).toBeEnabled());
		expect(updateUser).not.toHaveBeenCalled();
		expect(screen.getByRole("status")).toHaveTextContent("ar-SA");
		expect(Cookies.get("locale")).toBeUndefined();
	});
	it("updates only the current account cache after a successful save", async () => {
		updateUser.mockResolvedValue({ data: {}, error: null });
		const { queryClient } = await setup({ user: { id: "account-a" } });
		queryClient.setQueryData(["auth", "session"], { user: { id: "account-a", uiLocale: null } });
		await userEvent.click(screen.getByRole("button", { name: "Switch" }));
		await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("en-US"));
		expect(updateUser).toHaveBeenCalledExactlyOnceWith({ uiLocale: "en-US" });
		expect(queryClient.getQueryData(["auth", "session"])).toEqual({ user: { id: "account-a", uiLocale: "en-US" } });
	});
	it("allows a new account to switch while an old request is unresolved", async () => {
		const catalog = await localeLibrary.getUiLocaleMessages("en-US");
		let releaseOld: (value: typeof catalog) => void = () => {};
		vi.spyOn(localeLibrary, "getUiLocaleMessages").mockReturnValueOnce(
			new Promise((resolve) => {
				releaseOld = resolve;
			}),
		);
		let releaseNew: (value: { data: {}; error: null }) => void = () => {};
		updateUser.mockReturnValueOnce(
			new Promise((resolve) => {
				releaseNew = resolve;
			}),
		);
		const { changeSession } = await setup({ user: { id: "account-a" } });
		const button = screen.getByRole("button", { name: "Switch" });
		await userEvent.click(button);
		await act(() => changeSession({ user: { id: "account-b" } }));
		expect(button).toBeEnabled();
		await userEvent.click(button);
		await waitFor(() => expect(updateUser).toHaveBeenCalledOnce());
		expect(button).toBeDisabled();
		await act(() => releaseOld(catalog));
		expect(button).toBeDisabled();
		await act(() => releaseNew({ data: {}, error: null }));
		await waitFor(() => expect(button).toBeEnabled());
		expect(screen.getByRole("status")).toHaveTextContent("en-US");
	});
	it("does not steal focus chosen while a preference request is pending", async () => {
		let release: (value: { data: {}; error: null }) => void = () => {};
		updateUser.mockReturnValueOnce(
			new Promise((resolve) => {
				release = resolve;
			}),
		);
		await setup({ user: { id: "account-a" } });
		const button = screen.getByRole("button", { name: "Switch" });
		await userEvent.click(button);
		await waitFor(() => expect(updateUser).toHaveBeenCalledOnce());
		const input = screen.getByLabelText("Unsaved draft");
		await userEvent.click(input);
		await act(() => release({ data: {}, error: null }));
		await waitFor(() => expect(button).toBeEnabled());
		expect(input).toHaveFocus();
	});
	it("keeps locale, URL, cookie and unsaved values when preference persistence fails", async () => {
		updateUser.mockResolvedValue({ data: null, error: { status: 500, message: "Unavailable" } });
		const { router } = await setup({ user: { id: "account-a" } });
		const input = screen.getByLabelText("Unsaved draft");
		await userEvent.type(input, " محفوظة");
		await userEvent.click(screen.getByRole("button", { name: "Switch" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Switch" })).toBeEnabled());
		expect(screen.getByRole("status")).toHaveTextContent("ar-SA");
		expect(router.state.location.search).toMatchObject({ locale: "ar-SA", tab: "design" });
		expect(Cookies.get("locale")).toBeUndefined();
		expect(input).toHaveValue("سيرتي محفوظة");
		expect(document.documentElement).toHaveAttribute("dir", "rtl");
	});
	it("replaces stale URL locale and preserves query, hash, draft and mounted input", async () => {
		const { router } = await setup();
		const input = screen.getByLabelText("Unsaved draft");
		await userEvent.type(input, " 123");
		await userEvent.click(screen.getByRole("button", { name: "Switch" }));
		await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("en-US"));
		expect(router.state.location.search).toMatchObject({ locale: "en-US", tab: "design" });
		expect(router.state.location.hash).toBe("preview");
		expect(screen.getByLabelText("Unsaved draft")).toBe(input);
		expect(input).toHaveValue("سيرتي 123");
		expect(document.documentElement).toHaveAttribute("lang", "en-US");
		expect(document.documentElement).toHaveAttribute("dir", "ltr");
		expect(Cookies.get("locale")).toBe("en-US");
		expect(updateUser).not.toHaveBeenCalled();
		await act(() => router.navigate({ href: "/?locale=ar-SA" }));
	});
});
