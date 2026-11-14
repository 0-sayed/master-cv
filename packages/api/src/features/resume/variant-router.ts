import { z } from "zod";
import {
	createVariantInputSchema,
	variantFreshnessSchema,
	variantViewSchema,
} from "@reactive-resume/schema/resume/variants";
import { protectedProcedure } from "../../context";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { createVariant, getVariantFreshness, listVariants } from "./variants";

export const variantsRouter = {
	list: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes/{resumeId}/variants",
			tags: ["Internal"],
			operationId: "listResumeVariants",
		})
		.input(z.strictObject({ resumeId: z.string().min(1).max(200) }))
		.output(
			z.array(
				z.strictObject({
					resumeId: z.string(),
					name: z.string(),
					variantKind: z.enum(["base", "job", "language"]),
					sourceResumeId: z.string().nullable(),
					documentLocale: z.string(),
					targetLocale: z.enum(["ar-SA", "en-US"]).nullable(),
					updatedAt: z.iso.datetime(),
					operationId: z.string().nullable(),
				}),
			),
		)
		.handler(({ context, input }) => listVariants(context.user.id, input.resumeId)),
	create: protectedProcedure
		.use(resumeMutationRateLimit)
		.route({ method: "POST", path: "/resumes/variants", tags: ["Internal"], operationId: "createResumeVariant" })
		.input(createVariantInputSchema)
		.output(variantViewSchema)
		.handler(({ context, input }) => createVariant(context.user.id, input)),
	freshness: protectedProcedure
		.route({
			method: "GET",
			path: "/resumes/{resumeId}/variant-freshness",
			tags: ["Internal"],
			operationId: "getResumeVariantFreshness",
		})
		.input(z.strictObject({ resumeId: z.string().min(1).max(200) }))
		.output(variantFreshnessSchema)
		.handler(({ context, input }) => getVariantFreshness(context.user.id, input.resumeId)),
};
