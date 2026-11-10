import { describe, expect, it } from "vite-plus/test";
import { Route } from "@/routes/auth/verify-email";

type VerificationInput = {
	context: { flags: { disableEmailAuth: boolean } };
	search: { done?: boolean; error?: string; callbackURL?: string };
};
const beforeLoad = Route.options.beforeLoad as (input: VerificationInput) => unknown;

describe("verification callback destination", () => {
	it("sends completed verification to sign-in with the original callback", () => {
		expect(() =>
			beforeLoad({
				context: { flags: { disableEmailAuth: false } },
				search: { done: true, callbackURL: "/dashboard/career" },
			}),
		).toThrow(
			expect.objectContaining({
				options: expect.objectContaining({
					to: "/auth/login",
					search: { callbackURL: "/dashboard/career" },
					replace: true,
				}),
			}),
		);
	});
	it.each([{}, { done: true, error: "TOKEN_EXPIRED" }])(
		"keeps pending and failed proof on the recovery screen: %j",
		(search) => {
			expect(beforeLoad({ context: { flags: { disableEmailAuth: false } }, search })).toBeUndefined();
		},
	);
});
