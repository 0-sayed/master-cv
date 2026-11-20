import type { AiRuntime, ApprovedRoute } from "@reactive-resume/api/features/ai/route-policy";
import { reviewHandlers } from "@reactive-resume/api/features/ai/review-handlers";
import { variantReviewHandlers } from "@reactive-resume/api/features/ai/variant-handlers";
import { letterReviewHandler } from "@reactive-resume/api/features/cover-letters/review-handler";
import productionAiRouteData from "./ai-route.json" with { type: "json" };

type ProductionAiRoute = Omit<ApprovedRoute, "apiKey"> & { concurrency: number };

export const productionAiRoute = productionAiRouteData as ProductionAiRoute;

export function createProductionAiRuntime(environment: { OPENROUTER_API_KEY?: string | undefined }): AiRuntime | null {
	const apiKey = environment.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return null;

	const { concurrency: _concurrency, ...approvedRoute } = productionAiRoute;
	const route: ApprovedRoute = { ...approvedRoute, apiKey };
	return {
		routes: [route],
		handlers: { ...reviewHandlers, ...variantReviewHandlers, "review.cover-letter": letterReviewHandler },
		workerAvailable: true,
	};
}
