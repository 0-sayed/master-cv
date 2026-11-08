import { describe, expect, it } from "vite-plus/test";
import { env } from "@reactive-resume/env/server";
import { auth } from "./config";

describe("interface locale preference", () => {
	it("validates optional product locales without broadening document locale choices", () => {
		const field = auth.options.user?.additionalFields?.uiLocale;
		expect(field?.required).toBe(false);
		const validator = field?.validator?.input;
		if (!validator || !("safeParse" in validator)) throw new Error("Missing UI locale input validator");
		for (const locale of ["ar-SA", "en-US"]) expect(validator.safeParse(locale).success).toBe(true);
		for (const locale of ["de-DE", "en-GB", "zu-ZA", null, ""]) expect(validator.safeParse(locale).success).toBe(false);
	});
});

describe("social provider signup policy", () => {
	it.each(["google", "github", "linkedin"] as const)(
		"allows implicit signup through %s while honoring the global signup restriction",
		(provider) => {
			// Better Auth 1.7 allows a lazy `() => config` form; ours are always static objects.
			const config = auth.options.socialProviders?.[provider];
			if (typeof config === "function") throw new TypeError(`${provider} provider config should be a static object`);

			expect(config).not.toHaveProperty("disableImplicitSignUp");
			expect(config?.disableSignUp).toBe(env.FLAG_DISABLE_SIGNUPS);
		},
	);
});

describe("session freshness", () => {
	it("disables the freshness gate so provider unlinking works for week-old sessions", () => {
		expect(auth.options.session?.freshAge).toBe(0);
	});
});

it("publishes the configured native authentication HTTP contract", async () => {
	const response = await auth.handler(new Request(`${env.APP_URL}/api/auth/open-api/generate-schema`));
	expect(response.status).toBe(200);
	const spec = await response.json();
	expect(spec.paths).toHaveProperty("/sign-in/email");
	expect(spec.paths).toHaveProperty("/get-session");
	expect(spec.paths).toHaveProperty("/api-key/create");
});
