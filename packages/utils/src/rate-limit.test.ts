import { expect, it } from "vite-plus/test";
import { rateLimitConfig } from "./rate-limit";

it("does not rate limit session checks and keeps strict auth endpoint rules", () => {
	expect(rateLimitConfig.betterAuth.global.customRules["/get-session"]).toBe(false);
	expect(rateLimitConfig.betterAuth.global.customRules["/sign-in/email"]).toEqual({ window: 60, max: 5 });
	expect(rateLimitConfig.betterAuth.global.customRules["/sign-up/email"]).toEqual({ window: 60, max: 3 });
	expect(rateLimitConfig.betterAuth.global.customRules["/request-password-reset"]).toEqual({ window: 600, max: 3 });
});
