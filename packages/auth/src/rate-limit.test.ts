import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ eval: vi.fn(), redis: null as { eval: ReturnType<typeof vi.fn> } | null }));
vi.mock("@reactive-resume/db/redis", () => ({
	getRedis: () => mocks.redis,
	redisKey: (...parts: string[]) => ["reactive-resume", "preview-1", ...parts].join(":"),
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.redis = { eval: mocks.eval };
});

describe("authRateLimitStorage", () => {
	it("atomically consumes namespaced limits in milliseconds", async () => {
		const { authRateLimitStorage } = await import("./rate-limit");
		mocks.eval.mockResolvedValueOnce([1, 0]).mockResolvedValueOnce([0, 7]);
		expect(await authRateLimitStorage?.consume("sign-in:ip", { window: 10, max: 3 })).toEqual({
			allowed: true,
			retryAfter: null,
		});
		expect(await authRateLimitStorage?.consume("sign-in:ip", { window: 10, max: 3 })).toEqual({
			allowed: false,
			retryAfter: 7,
		});
		expect(mocks.eval).toHaveBeenCalledWith(
			expect.stringContaining("redis.call('PEXPIRE', KEYS[1], ARGV[1])"),
			1,
			"reactive-resume:preview-1:auth:sign-in:ip",
			10_000,
			3,
		);
	});

	it("falls back to per-instance limits when Redis fails or returns malformed data", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { authRateLimitStorage } = await import("./rate-limit");
		mocks.eval.mockRejectedValue(new Error("connection unavailable"));
		const rule = { window: 10, max: 2 };
		expect(await authRateLimitStorage?.consume("sign-in:ip", rule)).toEqual({ allowed: true, retryAfter: null });
		mocks.eval.mockResolvedValue(null);
		expect(await authRateLimitStorage?.consume("sign-in:ip", rule)).toEqual({ allowed: true, retryAfter: null });
		expect(await authRateLimitStorage?.consume("sign-in:ip", rule)).toEqual({ allowed: false, retryAfter: 10 });
		expect(await authRateLimitStorage?.consume("other:ip", rule)).toEqual({ allowed: true, retryAfter: null });
	});
});

it("allows ordinary session navigation and bounds abusive checks per client", async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	const { rateLimitConfig } = await import("@reactive-resume/utils/rate-limit");
	const { authRateLimitStorage } = await import("./rate-limit");
	const rule = rateLimitConfig.betterAuth.global.customRules["/get-session"];
	expect(rule).not.toBe(false);
	if (!rule) throw new Error("Session checks require a bounded rule");
	mocks.eval.mockRejectedValue(new Error("Redis unavailable"));
	for (let index = 0; index < 120; index++) {
		expect(await authRateLimitStorage?.consume("get-session:client-a", rule)).toEqual({
			allowed: true,
			retryAfter: null,
		});
	}
	expect(await authRateLimitStorage?.consume("get-session:client-a", rule)).toEqual({ allowed: false, retryAfter: 60 });
	expect(await authRateLimitStorage?.consume("get-session:client-b", rule)).toEqual({
		allowed: true,
		retryAfter: null,
	});
});
