import { expect, it } from "vite-plus/test";
import { syntheticRoute } from "./testing/runtime";
import { reviewVerifierPolicy, resolveReviewVerifierRoute } from "./verifier-policy";

it("pins the verifier independently of writer family", () => {
	expect(reviewVerifierPolicy("openai/gpt-6-luna")).toMatchObject({
		model: "deepseek/deepseek-v4.1-flash-1017",
		downstreamProvider: "together",
		reasoningEffort: "low",
	});
	expect(reviewVerifierPolicy("deepseek/deepseek-v4.1-flash-1017")).toMatchObject({
		model: "openai/gpt-6-luna",
		downstreamProvider: "azure",
		reasoningEffort: "low",
	});
});
it("requires approved verifier evidence and an independent cost bound in the route bundle", () => {
	expect(() => resolveReviewVerifierRoute({ ...syntheticRoute, verifier: undefined })).toThrow(
		"AI_VERIFIER_ROUTE_UNAPPROVED",
	);
});
it("preserves the operation consent/budget binding and switches the pinned provider", () => {
	const verifier = resolveReviewVerifierRoute({
		...syntheticRoute,
		model: "openai/gpt-6-luna",
		verifier: { evidenceVersion: "synthetic-v2", maxCallCostMicros: 1234 },
	});
	expect(verifier).toMatchObject({
		routeId: syntheticRoute.routeId,
		requestCapMicros: syntheticRoute.requestCapMicros,
		downstreamProvider: "together",
		model: "deepseek/deepseek-v4.1-flash-1017",
		maxCallCostMicros: 1234,
	});
});
