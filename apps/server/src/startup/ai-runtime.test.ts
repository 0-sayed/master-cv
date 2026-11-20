import { describe, expect, it } from "vite-plus/test";
import { getAiAvailability, withAiRuntime } from "@reactive-resume/api/features/ai/route-policy";
import { createProductionAiRuntime, productionAiRoute } from "./ai-runtime";

describe("createProductionAiRuntime", () => {
	it("returns null without a usable key", () => {
		expect(createProductionAiRuntime({})).toBeNull();
		expect(createProductionAiRuntime({ OPENROUTER_API_KEY: "   " })).toBeNull();
	});

	it("builds the approved pilot route", () => {
		const runtime = createProductionAiRuntime({ OPENROUTER_API_KEY: "sk-test" });
		expect(runtime).not.toBeNull();
		expect(runtime).toMatchObject({
			routes: [
				expect.objectContaining({
					routeId: "sirawise-pilot-openrouter",
					routeRevision: "1",
					configRevision: "pilot-writers-2026-11-20-v1",
					endpoint: "https://openrouter.ai/api/v1",
					model: "openai/gpt-6-luna",
					downstreamProvider: "azure",
					reasoningEffort: "low",
					apiKey: "sk-test",
					evidenceVersion: "pilot-2026-11-20-owner-approved",
					maxCalls: 2,
					maxRepairs: 0,
					callTimeoutMs: 30000,
					deadlineMs: 120000,
					maxInputCodePoints: 32000,
					maxOutputTokens: 4096,
					maxCallCostMicros: 100000,
					requestCapMicros: 200000,
					dayCapMicros: 50000000,
					writers: expect.arrayContaining([
						expect.objectContaining({ model: "openai/gpt-6.1-terra", reasoningEffort: "medium" }),
						expect.objectContaining({ model: "openai/gpt-6-luna", reasoningEffort: "high" }),
					]),
					verifier: expect.objectContaining({
						policy: expect.objectContaining({ model: "deepseek/deepseek-v4.1-flash-1017" }),
					}),
				}),
			],
			workerAvailable: true,
		});
		expect(runtime?.fetch).toBeUndefined();
		expect(runtime?.localOwnerAllowance).toBeUndefined();
		expect(Object.keys(runtime?.handlers ?? {})).toEqual(
			expect.arrayContaining(["review.extraction", "review.wording", "review.cover-letter"]),
		);
		expect(productionAiRoute.routeId).toBe("sirawise-pilot-openrouter");
		expect(productionAiRoute.concurrency).toBe(100);
	});

	it("makes AI available inside the runtime", () => {
		const runtime = createProductionAiRuntime({ OPENROUTER_API_KEY: "sk-test" });
		if (!runtime) throw new Error("Expected a configured runtime");
		expect(withAiRuntime(runtime, getAiAvailability)).toEqual({ state: "ready", reason: null });
	});
});
