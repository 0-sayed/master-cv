import type { ApprovedRoute } from "@reactive-resume/api/features/ai/route-policy";
import { reviewVerifierPolicy } from "@reactive-resume/api/features/ai/verifier-policy";

type Environment = Record<string, string | undefined>;

/** Provisional local configuration; never imported by an app or production entry. */
export function realAiConfig(environment: Environment) {
	if (environment.NODE_ENV === "production") throw new Error("LOCAL_REAL_AI_DEV_ONLY");
	const apiKey = environment.OPENROUTER_API_KEY?.trim();
	if (!apiKey) throw new Error("OPENROUTER_API_KEY_REQUIRED");
	const endpoint = "https://openrouter.ai/api/v1";
	const stubBaseUrl = environment.OPENROUTER_BASE_URL;
	if (stubBaseUrl && stubBaseUrl !== endpoint) {
		const url = new URL(stubBaseUrl);
		if (
			environment.FLAG_ALLOW_UNSAFE_AI_BASE_URL !== "true" ||
			url.protocol !== "http:" ||
			!["127.0.0.1", "[::1]"].includes(url.hostname) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new Error("LOCAL_STUB_ONLY");
	}
	const route: ApprovedRoute = {
		routeId: "local-real-ai",
		routeRevision: "provisional-1",
		configRevision: "t006-writers-terra-questions-deepseek-verifier-v3",
		endpoint,
		model: "openai/gpt-6-luna",
		downstreamProvider: "azure",
		reasoningEffort: "low",
		// Explicit local approvals, independent of the configurable defaults. Never production approval.
		writers: [
			{
				model: "openai/gpt-6-luna",
				downstreamProvider: "azure",
				reasoningEffort: "high",
				evidenceVersion: "local-synthetic-extraction-high-not-release-approved",
				maxCallCostMicros: 100000,
			},
			{
				model: "openai/gpt-6.1-terra",
				downstreamProvider: "azure",
				reasoningEffort: "medium",
				evidenceVersion: "local-synthetic-questions-medium-not-release-approved",
				maxCallCostMicros: 100000,
			},
		],
		apiKey,
		noticeVersion: "1",
		evidenceVersion: "local-synthetic-only-not-release-approved",
		maxCalls: 2,
		maxRepairs: 0,
		callTimeoutMs: 30000,
		deadlineMs: 120000,
		maxInputCodePoints: 32000,
		maxOutputTokens: 4096,
		maxCallCostMicros: 100000,
		requestCapMicros: 200000,
		dayCapMicros: 3000000,
		verifier: {
			evidenceVersion: "local-synthetic-verifier-v2",
			maxCallCostMicros: 100000,
			policy: reviewVerifierPolicy("openai/gpt-6-luna"),
		},
	};
	const ownerId = environment.LOCAL_REAL_AI_OWNER_ID?.trim();
	return {
		port: 3060,
		appUrl: "http://localhost:3060",
		route,
		stubBaseUrl: stubBaseUrl && stubBaseUrl !== endpoint ? stubBaseUrl : undefined,
		allowance: ownerId ? { ownerId, limit: 50 } : undefined,
	};
}
