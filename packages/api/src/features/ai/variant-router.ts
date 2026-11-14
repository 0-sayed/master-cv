import { z } from "zod";
import { sourceRevisionSchema } from "@reactive-resume/schema/ai-operation";
import {
	prepareVariantReviewInputSchema,
	variantDecisionInputSchema,
	variantDecisionViewSchema,
	variantOperationKindSchema,
	variantReviewViewSchema,
} from "@reactive-resume/schema/resume/variants";
import { protectedProcedure } from "../../context";
import { aiRequestRateLimit } from "../../middleware/rate-limit";
import { decideVariantReview, getVariantReview } from "./variant-decisions";
import { prepareVariantReview } from "./variant-sources";

export const variantReviewRouter = {
	prepare: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/variant-reviews/preparations",
			tags: ["Internal"],
			operationId: "prepareVariantReview",
		})
		.use(aiRequestRateLimit)
		.input(prepareVariantReviewInputSchema)
		.output(
			z.strictObject({
				kind: variantOperationKindSchema,
				parameters: z.record(z.string(), z.unknown()),
				sources: z.array(sourceRevisionSchema),
				evidenceIds: z.array(z.string()),
				contractVersion: z.string(),
			}),
		)
		.handler(({ context, input }) => prepareVariantReview(context.user.id, input)),
	get: protectedProcedure
		.route({
			method: "GET",
			path: "/ai/variant-reviews/{operationId}",
			tags: ["Internal"],
			operationId: "getVariantReview",
		})
		.input(z.strictObject({ operationId: z.string().min(1).max(200) }))
		.output(variantReviewViewSchema)
		.handler(({ context, input }) => getVariantReview(context.user.id, input.operationId)),
	decide: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/variant-reviews/decisions",
			tags: ["Internal"],
			operationId: "decideVariantReview",
		})
		.use(aiRequestRateLimit)
		.input(variantDecisionInputSchema)
		.output(variantDecisionViewSchema)
		.handler(({ context, input }) => decideVariantReview(context.user.id, input)),
};
