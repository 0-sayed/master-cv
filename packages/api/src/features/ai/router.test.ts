import { afterEach, expect, it, vi } from "vite-plus/test";
import { createRouterClient } from "@orpc/server";

vi.mock("../../context", async () => {
	const { os } = await vi.importActual<typeof import("@orpc/server")>("@orpc/server");
	return { protectedProcedure: os.$context<{ user: { id: string } }>() };
});
vi.mock("./operations", () => ({
	operationService: {
		preflight: vi.fn(async () => ({
			available: true,
			operationCost: 1,
			reason: null,
			requestFingerprint: "synthetic",
		})),
	},
}));

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});
it("rate limits preflight before it reaches budget admission", async () => {
	vi.stubEnv("NODE_ENV", "production");
	vi.stubEnv("FLAG_DISABLE_API_RATE_LIMIT", "false");
	const { aiRouter } = await import("./router");
	const client = createRouterClient(aiRouter, { context: { user: { id: "preflight-rate-limit" } } as never });
	const request = {
		requestKey: "test",
		kind: "review",
		sources: [{ kind: "resume" as const, id: "cv", revision: "1" }],
		route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
		parameters: {},
	};
	let limited = false;
	for (let i = 0; i < 100; i++) {
		try {
			await client.operations.preflight({ ...request, requestKey: `request-${i}` });
		} catch (error) {
			expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" });
			limited = true;
			break;
		}
	}
	expect(limited).toBe(true);
});
