import { describe, expect, it } from "vite-plus/test";
import { pageTransitionTypes } from "./page-transition";

const shells = [
	"/",
	"/auth/login",
	"/dashboard/welcome",
	"/dashboard",
	"/builder/example",
	"/builder/letter/example",
	"/templates/onyx",
	"/sara/resume",
];

describe("page transition policy", () => {
	for (const from of shells) {
		for (const to of shells.filter((path) => path !== from)) {
			it(`swaps ${from} → ${to} without overlapping shells`, () => {
				expect(pageTransitionTypes(from, to)).toBe(false);
			});
		}
	}
	it("keeps only an incoming fade within the app shell", () => {
		expect(pageTransitionTypes("/dashboard", "/dashboard/settings/account")).toEqual(["page"]);
		expect(pageTransitionTypes("/auth/login", "/auth/register")).toEqual(["page"]);
	});
	it("does not animate first paint, filter changes or reduced motion", () => {
		expect(pageTransitionTypes(undefined, "/dashboard")).toBe(false);
		expect(pageTransitionTypes("/dashboard", "/dashboard")).toBe(false);
		expect(pageTransitionTypes("/dashboard", "/dashboard/settings", true)).toBe(false);
	});
});
