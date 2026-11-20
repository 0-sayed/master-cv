import { expect, it } from "vite-plus/test";
import { rateLimitConfig } from "./rate-limit";

it("bounds session checks separately from strict auth endpoint rules", () => {
	expect(rateLimitConfig.betterAuth.global.customRules["/get-session"]).toEqual({ window: 60, max: 120 });
	expect(rateLimitConfig.betterAuth.global.customRules["/sign-in/email"]).toEqual({ window: 60, max: 5 });
	expect(rateLimitConfig.betterAuth.global.customRules["/sign-up/email"]).toEqual({ window: 60, max: 3 });
	expect(rateLimitConfig.betterAuth.global.customRules["/request-password-reset"]).toEqual({ window: 600, max: 3 });
});
