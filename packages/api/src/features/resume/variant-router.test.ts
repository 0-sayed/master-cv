import { afterEach, expect, it, vi } from "vite-plus/test";
import { createRouterClient } from "@orpc/server";

const mocks = vi.hoisted(() => ({ create: vi.fn(), limit: vi.fn() }));
vi.mock("../../context", async () => {
	const { os } = await vi.importActual<typeof import("@orpc/server")>("@orpc/server");
	return { protectedProcedure: os.$context<{ user: { id: string }; reqHeaders: Headers }>() };
});
vi.mock("../../redis", () => ({ createRateLimiter: () => ({ limit: mocks.limit }) }));
vi.mock("@reactive-resume/env/server", () => ({ env: { FLAG_DISABLE_API_RATE_LIMIT: false } }));
vi.mock("./variants", () => ({ createVariant: mocks.create, getVariantFreshness: vi.fn(), listVariants: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
it("throttles language-copy creation before any document or fact-link persistence", async () => {
	vi.stubEnv("NODE_ENV", "production");
	mocks.limit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60_000 });
	mocks.create.mockResolvedValue({
		resumeId: "copy",
		baseResumeId: "base",
		variantKind: "language",
		sourceResumeId: "base",
		sourceRevision: "1",
		documentLocale: "ar-SA",
		targetLocale: "en-US",
		reviewState: "pending",
		updatedAt: "2026-11-14T00:00:00.000Z",
	});
	const { variantsRouter } = await import("./variant-router");
	const client = createRouterClient(variantsRouter, {
		context: { user: { id: "alice" }, reqHeaders: new Headers() } as never,
	});
	await expect(
		client.create({
			sourceResumeId: "base",
			expectedUpdatedAt: "2026-11-14T00:00:00.000Z",
			requestKey: "copy",
			variantKind: "language",
			targetLocale: "en-US",
		}),
	).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
	expect(mocks.create).not.toHaveBeenCalled();
});
