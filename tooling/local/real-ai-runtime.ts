import type { AiRuntime } from "@reactive-resume/api/features/ai/route-policy";
import { reviewHandlers } from "@reactive-resume/api/features/ai/review-handlers";
import { realAiConfig } from "./real-ai-config";

export function createRealAiRuntime(environment: Record<string, string | undefined>): AiRuntime {
	const config = realAiConfig(environment);
	const runtime: AiRuntime = {
		routes: [config.route],
		handlers: reviewHandlers,
		workerAvailable: true,
		localOwnerAllowance: config.allowance,
	};
	if (config.stubBaseUrl) {
		const base = config.stubBaseUrl;
		// Keep the production adapter's canonical endpoint gate. Only this dev transport
		// rewrites it to an explicitly enabled loopback stub, with redirects forbidden.
		runtime.fetch = (url, init) => {
			const target = String(url);
			if (target !== config.route.endpoint + "/chat/completions") throw new Error("LOCAL_STUB_PATH_DENIED");
			return globalThis.fetch(base + "/chat/completions", { ...init, redirect: "error" });
		};
	}
	return runtime;
}
