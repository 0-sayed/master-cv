import { describe, expect, it } from "vite-plus/test";
import { Route as RegisterRoute } from "@/routes/auth/register";
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

it("disabled registration returns to login with its callback and locale retained", () => {
	const beforeRegister = RegisterRoute.options.beforeLoad as (input: {
		context: { session: null; flags: { disableSignups: boolean } };
		search: { callbackURL: string; locale: string };
	}) => unknown;
	const search = { callbackURL: "/dashboard/career", locale: "ar-SA" };
	expect(() => beforeRegister({ context: { session: null, flags: { disableSignups: true } }, search })).toThrow(
		expect.objectContaining({ options: expect.objectContaining({ to: "/auth/login", search, replace: true }) }),
	);
});
