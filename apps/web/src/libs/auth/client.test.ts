// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from "vite-plus/test";

const hook = vi.hoisted(() => ({ redirect: undefined as (() => void) | undefined }));

vi.mock("better-auth/react", () => ({ createAuthClient: vi.fn(() => ({})) }));
vi.mock("better-auth/client/plugins", async (importOriginal) => ({
	...(await importOriginal<typeof import("better-auth/client/plugins")>()),
	twoFactorClient: (options: { onTwoFactorRedirect: () => void }) => {
		hook.redirect = options.onTwoFactorRedirect;
		return { id: "two-factor" };
	},
}));

import "./client";

afterEach(() => vi.unstubAllGlobals());

it.each([
	["", undefined, false],
	["?reauthenticate=true", undefined, true],
	["?callbackURL=%2Fdashboard%3Ftab%3Dprivate", "/dashboard?tab=private", false],
	[
		"?callbackURL=%2Fapi%2Fauth%2Foauth%3Fresource%3Done%26resource%3Dtwo%26sig%3Dsigned&reauthenticate=true",
		"/api/auth/oauth?resource=one&resource=two&sig=signed",
		true,
	],
	["?callbackURL=https%3A%2F%2Fevil.example&reauthenticate=true", undefined, true],
])("preserves validated MFA continuation parameters from %s", (search, callbackURL, reauthenticate) => {
	const location = { search, href: "" };
	vi.stubGlobal("window", { location });
	if (!hook.redirect) throw new Error("Two-factor redirect hook missing");
	hook.redirect();
	const destination = new URL(location.href, "http://localhost:3000");
	expect(destination.pathname).toBe("/auth/verify-2fa");
	expect(destination.searchParams.get("callbackURL")).toBe(callbackURL ?? null);
	expect(destination.searchParams.get("reauthenticate")).toBe(reauthenticate ? "true" : null);
});
