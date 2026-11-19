import { describe, expect, it } from "vite-plus/test";
import { dashboardWidth } from "./dashboard-width";

describe("dashboard page types", () => {
	it.each(["", "/applications", "/career/information", "/career/knowledge/facts", "/trash"])(
		"expands the %s collection",
		(suffix) => {
			expect(dashboardWidth(`/dashboard${suffix}`)).toBe("wide");
		},
	);
	it.each(["/settings", "/settings/account", "/settings/preferences"])(
		"expands %s settings including redirects",
		(suffix) => {
			expect(dashboardWidth(`/dashboard${suffix}`)).toBe("wide");
		},
	);
	it.each(["/applications", "/applications/id", "/applications/id/prepare"])(
		"keeps %s on the collection canvas",
		(suffix) => expect(dashboardWidth(`/dashboard${suffix}`)).toBe("wide"),
	);
	it.each(["/review-guide", "/review-guide/"])("aligns %s with documents and applications", (suffix) => {
		expect(dashboardWidth(`/dashboard${suffix}`)).toBe(dashboardWidth("/dashboard"));
		expect(dashboardWidth(`/dashboard${suffix}`)).toBe(dashboardWidth("/dashboard/applications"));
	});
	it("keeps welcome a form", () => expect(dashboardWidth("/dashboard/welcome")).toBe("form"));
	it.each(["/career/knowledge/stories/id", "/career/offers", "/career/coach"])(
		"does not expand the %s workspace/detail",
		(suffix) => {
			expect(dashboardWidth(`/dashboard${suffix}`)).toBe("default");
		},
	);
});
