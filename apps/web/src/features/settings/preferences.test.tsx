// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreferencesSettings } from "./preferences";

const state = vi.hoisted(() => ({ update: vi.fn(), theme: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: state.invalidate }),
	useRouteContext: () => ({ session: { user: { timezone: "UTC" } } }),
}));
vi.mock("@/libs/auth/client", () => ({ authClient: { updateUser: state.update } }));
vi.mock("@/features/theme/provider", () => ({ useTheme: () => ({ theme: "system", setTheme: state.theme }) }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));
vi.mock("@/features/locale/combobox", () => ({
	LocaleCombobox: ({ id }: { id: string }) => (
		<select id={id}>
			<option>English</option>
		</select>
	),
}));
vi.mock("@/components/ui/combobox", () => ({
	Combobox: ({
		id,
		value,
		onValueChange,
		disabled,
	}: {
		id: string;
		value: string;
		onValueChange: (value: string) => void;
		disabled: boolean;
	}) => (
		<select id={id} value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>
			<option value="UTC">UTC</option>
			<option value="Asia/Riyadh">Asia/Riyadh</option>
		</select>
	),
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	state.update.mockResolvedValue({ error: null });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<PreferencesSettings />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("keeps the short preferences in one card and applies a theme choice immediately", () => {
	show();
	expect(screen.getAllByRole("region")).toHaveLength(1);
	expect(screen.getByRole("combobox", { name: "Interface language" })).toBeDefined();
	expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue("UTC");
	fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
	expect(state.theme).toHaveBeenCalledExactlyOnceWith("dark");
	expect(state.update).not.toHaveBeenCalled();
});
it("preserves immediate timezone saving and refreshes the account after success", async () => {
	show();
	fireEvent.change(screen.getByRole("combobox", { name: "Timezone" }), { target: { value: "Asia/Riyadh" } });
	await waitFor(() => expect(state.update).toHaveBeenCalledExactlyOnceWith({ timezone: "Asia/Riyadh" }));
	await waitFor(() => expect(state.invalidate).toHaveBeenCalledOnce());
	expect(screen.getByRole("combobox", { name: "Timezone" })).toHaveValue("Asia/Riyadh");
});

it("previews the selected timezone instead of forcing Riyadh", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
	try {
		show();
		expect(document.querySelector("time")).toHaveTextContent("12:00 PM");
		fireEvent.change(screen.getByRole("combobox", { name: "Timezone" }), { target: { value: "Asia/Riyadh" } });
		await waitFor(() => expect(document.querySelector("time")).toHaveTextContent("3:00 PM"));
	} finally {
		vi.useRealTimers();
	}
});
