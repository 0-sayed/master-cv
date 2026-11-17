// @vitest-environment happy-dom
import { expect, it, vi } from "vite-plus/test";
vi.mock("@/features/applications/components/application-detail-page", () => ({ ApplicationDetailPage: () => null }));
vi.mock("@/features/career/workspace/shell", () => ({ Workspace: () => null }));
import { Route } from "./$applicationId.{-$tab}";

it.each([undefined, { applications: false }, { applications: false, coverLetters: true }])(
	"denies unavailable application detail routes before fetching data: %s",
	(personalToolsAvailability) => {
		const load = Route.options.beforeLoad;
		if (!load) throw new Error("Application details must guard availability");
		let result: unknown;
		try {
			load({ context: { flags: { personalToolsAvailability } } } as never);
		} catch (error) {
			result = error;
		}
		expect(result).toMatchObject({ options: { to: "/dashboard", replace: true } });
	},
);

it("allows enabled application details", () => {
	const load = Route.options.beforeLoad;
	if (!load) throw new Error("Application details must guard availability");
	expect(() =>
		load({ context: { flags: { personalToolsAvailability: { applications: true } } } } as never),
	).not.toThrow();
});
