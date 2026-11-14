import type { ApprovedRoute, ReasoningEffort } from "./route-policy";

export type VerifierPolicy = { model: string; downstreamProvider: string; reasoningEffort: ReasoningEffort };
export function reviewVerifierPolicy(writerModel: string): VerifierPolicy {
	return writerModel.startsWith("deepseek/")
		? { model: "openai/gpt-6-luna", downstreamProvider: "azure", reasoningEffort: "low" }
		: { model: "deepseek/deepseek-v4.1-flash-1017", downstreamProvider: "together", reasoningEffort: "low" };
}

/** This is one consented, versioned route bundle, not an additional implicit route grant. */
export function resolveReviewVerifierRoute(writer: ApprovedRoute): ApprovedRoute {
	const approved = writer.verifier;
	if (
		!approved?.evidenceVersion ||
		!Number.isSafeInteger(approved.maxCallCostMicros) ||
		approved.maxCallCostMicros <= 0
	)
		throw new Error("AI_VERIFIER_ROUTE_UNAPPROVED");
	const policy = { ...reviewVerifierPolicy(writer.model), ...approved.policy };
	if (policy.model.split("/")[0] === writer.model.split("/")[0]) throw new Error("AI_VERIFIER_FAMILY_CONFLICT");
	return {
		...writer,
		...policy,
		maxCallCostMicros: approved.maxCallCostMicros,
		evidenceVersion: approved.evidenceVersion,
	};
}
