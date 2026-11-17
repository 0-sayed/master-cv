import { AsyncLocalStorage } from "node:async_hooks";
/** Benchmark composition over explicit production entry points. */
import { AiTransportError, executeApprovedStep as productionStep } from "@reactive-resume/api/features/ai/adapter";
import { getAiRuntime, withAiRuntime as scopedRuntime } from "@reactive-resume/api/features/ai/route-policy";
import { reviewVerifierPolicy as productionPolicy } from "@reactive-resume/api/features/ai/verifier-policy";
import { responseCharge, type BillingPrice } from "./billing-runtime";

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
	options?: Parameters<typeof productionStep>[1] & { billingPrice?: BillingPrice },
) {
	const byok =
		input.route.routeId === "a02-benchmark" &&
		input.route.downstreamProvider === "openai" &&
		["openai/gpt-6-luna", "openai/gpt-6.1-terra"].includes(input.route.model);
	const runtime = getAiRuntime();
	const base = runtime.fetch ?? globalThis.fetch;
	let router: number | null = 0;
	let upstream: number | null = 0;
	let observed = false;
	let payerMismatch = false;
	const billingNotes: string[] = [];
	const add = (a: number | null, b: number | null) =>
		a === null || b === null || !Number.isSafeInteger(a + b) ? null : a + b;
	const transport: typeof fetch = async (url, init) => {
		const body = JSON.parse(String(init?.body));
		if (byok) delete body.provider.zdr;
		const response = await base(url, { ...init, body: JSON.stringify(body) }).catch((error: unknown) => {
			observed = true;
			if (error instanceof AiTransportError) {
				router = add(router, error.evidence.costMicros ?? null);
				upstream = add(upstream, byok ? (error.evidence.upstreamCostMicros ?? null) : 0);
				if (!error.evidence.bytesReceived && error.evidence.httpStatus === null && error.evidence.costMicros === 0)
					billingNotes.push("connection failure before response: zero cost (Sayed D39)");
			} else {
				router = null;
				if (byok) upstream = null;
			}
			throw error;
		});
		observed = true;
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
			const raw = Buffer.concat(chunks).toString("utf8");
			try {
				payerMismatch ||= byok && JSON.parse(raw).usage?.is_byok === false;
			} catch {
				/* Preserve malformed output. */
			}
			const charge = responseCharge(raw, response.status, options?.billingPrice, byok);
			const headerMicros = (name: string) => {
				const value = response.headers.get(name);
				return value !== null && /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
			};
			router = add(router, charge.router ?? headerMicros("x-benchmark-router-micros"));
			upstream = add(upstream, charge.openai ?? headerMicros("x-benchmark-upstream-micros"));
			billingNotes.push(charge.source);
		} catch {
			router = null;
			if (byok) upstream = null;
		} finally {
			await reader?.cancel().catch(() => {});
		}
		return response;
	};
	const result = await scopedRuntime({ ...runtime, fetch: transport }, () => productionStep(input, options));
	const openRouterCostMicros = observed && router !== null ? router : result.costMicros;
	const openaiCostMicros: number | null = byok ? upstream : 0;
	return {
		...result,
		...(payerMismatch ? { outcome: "PAYER_MISMATCH" as const } : {}),
		openRouterCostMicros,
		openaiCostMicros,
		billingNotes,
		costMicros:
			openRouterCostMicros === null || openaiCostMicros === null ? null : openRouterCostMicros + openaiCostMicros,
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
