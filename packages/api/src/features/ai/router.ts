import { ORPCError } from "@orpc/client";
import { AISDKError } from "ai";
import { flattenError, ZodError, z } from "zod";
import {
	operationRequestSchema,
	operationViewSchema,
	operationPreflightSchema,
	aiAvailabilitySchema,
	routeBindingSchema,
} from "@reactive-resume/schema/ai-operation";
import { startUsageViewSchema } from "@reactive-resume/schema/ai-usage";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { protectedProcedure } from "../../context";
import { aiRequestRateLimit } from "../../middleware/rate-limit";
import { aiProvidersService } from "../ai-providers/service";
import { atsReviewInputSchema, atsReviewOutputSchema } from "./ats-review";
import { getProcessingNotices, processingConsentService } from "./consent";
import { improveInputSchema, improveLine, improveOutputSchema } from "./improve";
import { operationService } from "./operations";
import { reportAiContent } from "./reports";
import { getAiAvailability } from "./route-policy";
import { fileInputSchema } from "./service";
import { usageService } from "./usage";

/**
 * Every AI procedure fails the same ways: no ENCRYPTION_SECRET, a bad base URL, the provider erroring (its cause kept
 * for upstream error reporters), or the model returning a shape that can't be used, named per procedure.
 */
function rethrowAiError(error: unknown, invalidStructure: string): never {
	if (error instanceof Error && error.message === "AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE")
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "AI providers are unavailable because ENCRYPTION_SECRET is not configured.",
		});
	if (error instanceof Error && error.message === "INVALID_AI_BASE_URL")
		throw new ORPCError("BAD_REQUEST", { message: "Invalid AI provider configuration." });
	if (error instanceof AISDKError)
		throw new ORPCError("BAD_GATEWAY", { message: "Could not reach the AI provider.", cause: error });
	if (error instanceof ZodError)
		throw new ORPCError("BAD_REQUEST", { message: invalidStructure, cause: flattenError(error) });
	throw error;
}

const aiErrors = {
	BAD_GATEWAY: { message: "The AI provider returned an error or is unreachable.", status: 502 },
	BAD_REQUEST: { message: "The AI returned an improperly formatted structure.", status: 400 },
} as const;

async function getRunnableProvider(userId: string, aiProviderId?: string) {
	const provider = aiProviderId
		? await aiProvidersService.getRunnableById({ id: aiProviderId, userId })
		: await aiProvidersService.getDefaultRunnable({ userId });

	if (!provider) throw new ORPCError("BAD_REQUEST", { message: "No tested AI provider is available." });

	return provider;
}

export const aiRouter = {
	processing: {
		notices: protectedProcedure
			.route({ method: "GET", path: "/ai/processing-notices", tags: ["AI"], operationId: "aiProcessingNotices" })
			.input(z.object({}).optional())
			.output(
				z.array(
					z.strictObject({ route: routeBindingSchema, noticeVersion: z.string(), purposes: z.array(z.string()) }),
				),
			)
			.handler(() => getProcessingNotices()),
		grant: protectedProcedure
			.route({ method: "POST", path: "/ai/processing-consent", tags: ["AI"], operationId: "grantAiProcessingConsent" })
			.input(
				z.strictObject({
					route: routeBindingSchema,
					purpose: z.string().min(1).max(200),
					noticeVersion: z.string().min(1).max(200),
				}),
			)
			.output(z.strictObject({ id: z.string() }))
			.handler(({ context, input }) => processingConsentService.grant(context.user.id, input)),
		revoke: protectedProcedure
			.route({
				method: "POST",
				path: "/ai/processing-consent/revoke",
				tags: ["AI"],
				operationId: "revokeAiProcessingConsent",
			})
			.input(z.strictObject({ routeId: z.string().min(1).max(200) }))
			.output(z.void())
			.handler(({ context, input }) => processingConsentService.revoke(context.user.id, input.routeId)),
	},
	availability: protectedProcedure
		.route({ method: "GET", path: "/ai/availability", tags: ["AI"], operationId: "aiAvailability" })
		.input(z.object({}).optional())
		.output(aiAvailabilitySchema)
		.handler(() => getAiAvailability()),
	usage: {
		get: protectedProcedure
			.route({ method: "GET", path: "/ai/usage", tags: ["AI"], operationId: "aiUsage" })
			.input(z.object({}).optional())
			.output(startUsageViewSchema)
			.handler(({ context }) => usageService.getStartUsage(context.user.id)),
	},
	operations: {
		preflight: protectedProcedure
			.route({ method: "POST", path: "/ai/operations/preflight", tags: ["AI"], operationId: "preflightAiOperation" })
			.use(aiRequestRateLimit)
			.input(operationRequestSchema)
			.output(operationPreflightSchema)
			.handler(({ context, input }) => operationService.preflight(context.user.id, input)),
		start: protectedProcedure
			.route({ method: "POST", path: "/ai/operations", tags: ["AI"], operationId: "startAiOperation" })
			.input(operationRequestSchema)
			.use(aiRequestRateLimit)
			.output(operationViewSchema)
			.handler(({ context, input }) => operationService.start(context.user.id, input)),
		get: protectedProcedure
			.route({ method: "GET", path: "/ai/operations/{id}", tags: ["AI"], operationId: "getAiOperation" })
			.input(z.strictObject({ id: z.string().min(1).max(200) }))
			.output(operationViewSchema)
			.handler(({ context, input }) => operationService.get(context.user.id, input.id)),
		cancel: protectedProcedure
			.route({ method: "POST", path: "/ai/operations/{id}/cancel", tags: ["AI"], operationId: "cancelAiOperation" })
			.input(z.strictObject({ id: z.string().min(1).max(200) }))
			.output(operationViewSchema)
			.handler(({ context, input }) => operationService.cancel(context.user.id, input.id)),
		result: protectedProcedure
			.route({ method: "GET", path: "/ai/operations/{id}/result", tags: ["AI"], operationId: "getAiOperationResult" })
			.input(z.strictObject({ id: z.string().min(1).max(200) }))
			.output(z.record(z.string(), z.unknown()))
			.handler(({ context, input }) => operationService.getResult(context.user.id, input.id)),
	},
	reportContent: reportAiContent,
	parsePdf: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/parse-pdf",
			tags: ["AI"],
			operationId: "parseResumePdf",
			summary: "Parse a PDF file into resume data",
			description: "Unavailable: original CV attachments cannot be sent to a model. Use native PDF import and review.",
			successDescription: "The PDF was successfully parsed into structured resume data.",
		})
		.input(z.object({ aiProviderId: z.string().optional(), file: fileInputSchema }))
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.output(resumeDataSchema)
		.handler(() => {
			throw new ORPCError("FORBIDDEN", {
				message: "Attachment processing by AI is unavailable. Use native PDF import and review.",
			});
		}),

	parseDocx: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/parse-docx",
			tags: ["AI"],
			operationId: "parseResumeDocx",
			summary: "Parse a DOCX file into resume data",
			description: "Word import is not available. Use native PDF import or manual entry.",
			successDescription: "The DOCX was successfully parsed into structured resume data.",
		})
		.input(
			z.object({
				aiProviderId: z.string().optional(),
				file: fileInputSchema,
				mediaType: z.enum([
					"application/msword",
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				]),
			}),
		)
		.use(aiRequestRateLimit)
		.errors(aiErrors)
		.output(resumeDataSchema)
		.handler(() => {
			throw new ORPCError("FORBIDDEN", {
				message: "Attachment processing by AI is unavailable. Use native PDF import and review.",
			});
		}),

	atsReview: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/ats-review",
			tags: ["AI"],
			operationId: "atsReview",
			summary: "Review extracted resume text",
			description:
				"Unavailable until approved consent, model routing and payload minimization are implemented in T005/T006.",
			successDescription: "Qualitative review returned successfully.",
		})
		.input(atsReviewInputSchema)
		.use(aiRequestRateLimit)
		.output(atsReviewOutputSchema)
		.errors(aiErrors)
		.handler(() => {
			throw new ORPCError("FORBIDDEN", { message: "AI writing review is not available." });
		}),

	improve: protectedProcedure
		.route({
			method: "POST",
			path: "/ai/improve",
			tags: ["AI"],
			operationId: "improveLine",
			summary: "Suggest a rewrite of one line",
			description:
				"Suggests a rewrite of one line of a resume or cover letter: a stronger verb, an added result, a shorter version, or the user's own request. Returns the new line, a short reason, and whether it states anything the input didn't, so the user can check it. Writes nothing. Requires authentication and AI credentials.",
			successDescription: "The suggested line.",
		})
		.input(improveInputSchema)
		.use(aiRequestRateLimit)
		.output(improveOutputSchema)
		.errors(aiErrors)
		.handler(async ({ context, input }) => {
			try {
				const provider = await getRunnableProvider(context.user.id, input.aiProviderId);

				return await improveLine({
					...input,
					provider: provider.provider,
					model: provider.model,
					apiKey: provider.apiKey,
					baseURL: provider.baseURL ?? "",
				});
			} catch (error) {
				rethrowAiError(error, "Invalid suggestion structure");
			}
		}),
};
