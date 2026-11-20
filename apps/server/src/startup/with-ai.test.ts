import { describe, expect, it } from "vite-plus/test";
import { getAiAvailability } from "@reactive-resume/api/features/ai/route-policy";
import { createProductionAiRuntime } from "./ai-runtime";
import { composeAi } from "./with-ai";

describe("composeAi", () => {
	it("keeps HTTP work and scheduled work inside the production runtime", () => {
		const runtime = createProductionAiRuntime({ OPENROUTER_API_KEY: "sk-test" });
		expect(runtime).not.toBeNull();
		const ai = composeAi(runtime);
		const fetch = ai.fetch(() => getAiAvailability());

		expect(fetch()).toEqual({ state: "ready", reason: null });
		expect(ai.run(() => getAiAvailability())).toEqual({ state: "ready", reason: null });
	});

	it("uses the default disabled runtime when no key is configured", () => {
		const ai = composeAi(null);
		const original = () => getAiAvailability();
		const fetch = ai.fetch(original);

		expect(fetch).toBe(original);
		expect(fetch()).toMatchObject({ state: "not_enabled" });
		expect(ai.run(() => getAiAvailability())).toMatchObject({ state: "not_enabled" });
	});
});
