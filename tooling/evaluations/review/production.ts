import { AsyncLocalStorage } from "node:async_hooks";
/** Benchmark composition over explicit production entry points. */
import {
	AiTransportError,
	usdToMicros,
	executeApprovedStep as productionStep,
} from "@reactive-resume/api/features/ai/adapter";
import { getAiRuntime, withAiRuntime as scopedRuntime } from "@reactive-resume/api/features/ai/route-policy";
import { reviewVerifierPolicy as productionPolicy } from "@reactive-resume/api/features/ai/verifier-policy";

const archiveScope = new AsyncLocalStorage<boolean>();
/** Used exclusively by recorded offline replay with its injected transport. */
export const withArchivedVerifierPolicy = <T>(work: () => T): T => archiveScope.run(true, work);

/** Owner-approved synthetic benchmark exception. Production policies and transport are unchanged. */
export function reviewVerifierPolicy(writer: string) {
	const policy = productionPolicy(writer);
	if (archiveScope.getStore()) return policy;
	return {
		...policy,
		downstreamProvider: policy.downstreamProvider === "azure" ? "openai" : policy.downstreamProvider,
	};
}
export async function executeApprovedStep(
	input: Parameters<typeof productionStep>[0],
	options?: Parameters<typeof productionStep>[1],
) {
	const byok =
		input.route.routeId === "a02-benchmark" &&
		input.route.downstreamProvider === "openai" &&
		["openai/gpt-6-luna", "openai/gpt-6.1-terra"].includes(input.route.model);
	if (!byok) {
		const result = await productionStep(input, options);
		return { ...result, openRouterCostMicros: result.costMicros, openaiCostMicros: 0 as number | null };
	}
	const runtime = getAiRuntime();
	const base = runtime.fetch ?? globalThis.fetch;
	let upstream: number | null = 0;
	let payerMismatch = false;
	const transport: typeof fetch = async (url, init) => {
		const body = JSON.parse(String(init?.body));
		delete body.provider.zdr;
		const response = await base(url, { ...init, body: JSON.stringify(body) }).catch((error: unknown) => {
			// No response is a transport transient, not an unknown upstream charge.
			if (error instanceof AiTransportError) {
				const cost = error.evidence.upstreamCostMicros;
				upstream = upstream === null || cost == null ? null : upstream + cost;
			}
			throw error;
		});
		const reader = response.clone().body?.getReader();
		const chunks: Uint8Array[] = [];
		let bytes = 0;
		try {
			if (reader)
				for (;;) {
					const part = await reader.read();
					if (part.done) break;
					bytes += part.value.length;
					if (bytes > 1048576) throw new Error("AI_RESPONSE_LIMIT");
					chunks.push(part.value);
				}
			const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			payerMismatch ||= data.usage?.is_byok === false;
			const cost = data.usage?.is_byok === false ? 0 : data.usage?.cost_details?.upstream_inference_cost;
			// A provider error without usage is unbilled. Missing successful billing is unknown.
			if (!((data.error || !response.ok) && data.usage === undefined)) {
				const micros = usdToMicros(cost);
				if (micros === null) upstream = null;
				else if (upstream !== null) upstream = Number.isSafeInteger(upstream + micros) ? upstream + micros : null;
			}
		} catch {
			if (response.ok) upstream = null;
		} finally {
			await reader?.cancel().catch(() => {});
		}
		return response;
	};
	const result = await scopedRuntime({ ...runtime, fetch: transport }, () => productionStep(input, options));
	const openaiCostMicros: number | null = upstream;
	return {
		...result,
		...(payerMismatch ? { outcome: "PAYER_MISMATCH" as const } : {}),
		openRouterCostMicros: result.costMicros,
		openaiCostMicros,
		costMicros: result.costMicros === null || openaiCostMicros === null ? null : result.costMicros + openaiCostMicros,
	};
}

/** Offline fake transport mirrors the two independently billed usage fields. */
export function fakeCost(provider: string, usd: number) {
	return provider === "openai"
		? { cost: 0, is_byok: true, cost_details: { upstream_inference_cost: usd } }
		: { cost: usd };
}

export { buildModelPayload } from "@reactive-resume/api/features/ai/payload";
export { reviewHandlers } from "@reactive-resume/api/features/ai/review-handlers";
export { validateReviewResult } from "@reactive-resume/api/features/ai/review-validation";
export {
	withAiRuntime,
	completionTokenLimit,
	type ApprovedRoute,
	type ReasoningEffort,
} from "@reactive-resume/api/features/ai/route-policy";
