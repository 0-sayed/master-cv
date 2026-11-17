import type { ApprovedRoute } from "./production";
import { completionTokenLimit } from "./production";

// Paid canaries: largest complete verdict 7,202 tokens, including reasoning.
// First budget exceeds twice that observation; retry is strictly larger.
export const VERIFIER_COMPLETION_TOKENS = 16_384;
export const VERIFIER_RETRY_COMPLETION_TOKENS = 20_480;

export function usesExpandedVerifierBudget(route: ApprovedRoute) {
	return (
		route.model === "deepseek/deepseek-v4.1-flash-1017" &&
		route.downstreamProvider === "together" &&
		route.reasoningEffort === "low"
	);
}

export function verifierBudgetRoute(route: ApprovedRoute, expanded = false): ApprovedRoute {
	const total = expanded ? VERIFIER_RETRY_COMPLETION_TOKENS : VERIFIER_COMPLETION_TOKENS;
	const scale = completionTokenLimit({
		maxOutputTokens: 100,
		...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}),
	});
	const { completionTokenCap: _cap, ...base } = route;
	const result = { ...base, maxOutputTokens: Math.floor((total * 100) / scale) };
	if (completionTokenLimit(result) !== total) throw new Error("VERIFIER_COMPLETION_BUDGET_MISMATCH");
	return result;
}
