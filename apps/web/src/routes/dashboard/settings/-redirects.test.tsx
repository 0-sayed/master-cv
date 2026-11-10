// @vitest-environment happy-dom
import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

const navigation = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	Navigate: (props: unknown) => {
		navigation(props);
		return null;
	},
}));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "desktop" }));
vi.mock("@/features/locale/provider", () => ({ useUiLocale: () => ({ locale: "en-US" }) }));
vi.mock("@/features/settings/root", () => ({ SettingsRoot: () => null }));
import { Route as ApiKeys } from "./api-keys";
import { Route as Authentication } from "./authentication/index";
import { Route as Root } from "./index";
import { Route as Integrations } from "./integrations/route";
import { Route as JobSearch } from "./job-search";
import { Route as Profile } from "./profile";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("preserves the active interface locale when desktop settings opens Account", () => {
	const Component = Root.options.component;
	if (!Component) throw new Error("Settings root must have a component");
	render(<Component />);
	expect(navigation).toHaveBeenCalledWith(
		expect.objectContaining({ to: "/dashboard/settings/account", search: { locale: "en-US" }, replace: true }),
	);
});

it.each([
	[Profile, "/dashboard/settings/account"],
	[Authentication, "/dashboard/settings/account"],
	[ApiKeys, "/dashboard/settings/ai"],
	[JobSearch, "/dashboard/settings/ai"],
	[Integrations, "/dashboard/settings/ai"],
])("preserves validated locale on a legacy settings redirect", (route, target) => {
	const beforeLoad = route.options.beforeLoad;
	if (!beforeLoad) throw new Error("Legacy settings route must redirect");
	for (const locale of ["ar-SA", "en-US"]) {
		let redirected: unknown;
		try {
			beforeLoad({ search: { locale }, context: { locale: "ar-SA" } } as never);
		} catch (error) {
			redirected = error;
		}
		expect(redirected).toMatchObject({ options: { to: target, search: { locale }, replace: true } });
	}
	let redirected: unknown;
	try {
		beforeLoad({ search: {}, context: { locale: "en-US" } } as never);
	} catch (error) {
		redirected = error;
	}
	expect(redirected).toMatchObject({ options: { search: { locale: "en-US" } } });
});
