import type { PersonalToolsPolicy } from "@reactive-resume/schema/personal-tools";
import { expect, it } from "vite-plus/test";
import {
	getPersonalToolsAvailability,
	personalToolsPolicy,
	requirePersonalTool,
	withPersonalToolsPolicy,
} from "./availability";

const policy = (disposition: "enabled" | "withheld", releaseApproved: boolean): PersonalToolsPolicy => ({
	coverLetters: { disposition, releaseApproved },
	applications: { disposition, releaseApproved },
});

it.each([policy("enabled", false), policy("withheld", true), policy("withheld", false)])(
	"denies unavailable tools through server-owned policy",
	(value) => {
		expect(getPersonalToolsAvailability(value)).toEqual({ coverLetters: false, applications: false });
		for (const tool of ["coverLetters", "applications"] as const) {
			expect(() => requirePersonalTool(tool, value)).toThrow("PERSONAL_TOOL_UNAVAILABLE");
		}
	},
);

it("keeps production unavailable and approves each synthetic tool independently", () => {
	expect(getPersonalToolsAvailability(personalToolsPolicy("production", undefined))).toEqual({
		coverLetters: false,
		applications: false,
	});
	const value = policy("enabled", false);
	value.applications.releaseApproved = true;
	withPersonalToolsPolicy(value, () => {
		expect(getPersonalToolsAvailability()).toEqual({ coverLetters: false, applications: true });
		expect(() => requirePersonalTool("applications")).not.toThrow();
		expect(() => requirePersonalTool("coverLetters")).toThrow("PERSONAL_TOOL_UNAVAILABLE");
	});
	expect(getPersonalToolsAvailability(personalToolsPolicy("production", undefined))).toEqual({
		coverLetters: false,
		applications: false,
	});
});

it("isolates simultaneous synthetic policies", async () => {
	await Promise.all(
		[true, false].map((releaseApproved) =>
			withPersonalToolsPolicy(policy("enabled", releaseApproved), async () => {
				await Promise.resolve();
				expect(getPersonalToolsAvailability().coverLetters).toBe(releaseApproved);
			}),
		),
	);
});

it("enables both tools locally and uses one release setting in production", () => {
	for (const mode of ["development", "test"])
		expect(getPersonalToolsAvailability(personalToolsPolicy(mode, undefined))).toEqual({
			coverLetters: true,
			applications: true,
		});
	expect(getPersonalToolsAvailability(personalToolsPolicy("production", "true"))).toEqual({
		coverLetters: true,
		applications: true,
	});
	expect(getPersonalToolsAvailability(personalToolsPolicy("production", "false"))).toEqual({
		coverLetters: false,
		applications: false,
	});
});
