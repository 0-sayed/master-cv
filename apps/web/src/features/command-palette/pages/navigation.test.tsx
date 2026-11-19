// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { getUiLocaleMessages } from "@/libs/locale";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), reset: vi.fn(), enabled: true }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouteContext: () => ({ session: { user: { id: "owner" } } }),
}));
vi.mock("../store", () => ({
	useCommandPaletteStore: (select: (state: unknown) => unknown) => select({ reset: mocks.reset, pushPage: vi.fn() }),
}));
vi.mock("@/features/personal-tools/availability", () => ({ usePersonalToolAvailable: () => mocks.enabled }));
vi.mock("./base", () => ({
	BaseCommandGroup: ({ page, children }: { page?: string; children: React.ReactNode }) =>
		page ? null : <div>{children}</div>,
}));
vi.mock("@reactive-resume/ui/components/command", () => ({
	CommandItem: ({
		value,
		disabled,
		onSelect,
		keywords,
		children,
	}: {
		value: string;
		disabled?: boolean;
		onSelect?: () => void;
		keywords?: string[];
		children: React.ReactNode;
	}) => (
		<button data-value={value} data-keywords={keywords?.join("|")} disabled={disabled} onClick={onSelect}>
			{children}
		</button>
	),
}));
import { NavigationCommandGroup } from "./navigation";

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
afterEach(cleanup);

it.each([true, false])(
	"uses the shared product order and availability in the command palette (%s)",
	async (enabled) => {
		mocks.enabled = enabled;
		render(
			<I18nProvider i18n={i18n}>
				<NavigationCommandGroup />
			</I18nProvider>,
		);
		const items = screen
			.getAllByRole("button")
			.map((button) => button.dataset.value)
			.filter((value) => /^navigation\.(career|documents|applications|review-guide|trash)$/.test(value ?? ""));
		expect(items).toEqual([
			"navigation.career",
			"navigation.documents",
			...(enabled ? ["navigation.applications"] : []),
			"navigation.trash",
			"navigation.review-guide",
		]);
		if (!enabled) expect(screen.getByRole("button", { name: "New Application" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Review guide" }));
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard/review-guide" });
		fireEvent.click(screen.getByRole("button", { name: "Career information" }));
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard/career/information" });
	},
);

it.each(["ar-SA", "en-US"] as const)(
	"keeps the translated guide searchable outside the sidebar in %s",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		render(
			<I18nProvider i18n={i18n}>
				<NavigationCommandGroup />
			</I18nProvider>,
		);
		const label = locale === "ar-SA" ? "دليل المراجعة" : "Review guide";
		const guide = screen.getByRole("button", { name: label });
		expect(guide).toHaveAttribute("data-keywords", expect.stringContaining(label));
		fireEvent.click(guide);
		expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard/review-guide" });
	},
);
