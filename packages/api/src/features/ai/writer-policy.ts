import type { ApprovedRoute, ReasoningEffort } from "./route-policy";
import type { OperationRequest } from "@reactive-resume/schema/ai-operation";
import { z } from "zod";
import defaults from "./writer-config.json";

const selectionSchema = z.strictObject({
	model: z.enum(["openai/gpt-6-luna", "openai/gpt-6.1-terra", "deepseek/deepseek-v4.1-flash-1017"]),
	reasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
});
const configurationSchema = z.strictObject({
	"review.wording": selectionSchema,
	"review.extraction": selectionSchema,
	"review.questions": selectionSchema,
});

export type WriterRouteApproval = Pick<
	ApprovedRoute,
	"model" | "downstreamProvider" | "evidenceVersion" | "maxCallCostMicros"
> & { reasoningEffort: ReasoningEffort };

/**
 * Reviewed server configuration selects within a consented bundle; it grants no route approval.
 * Change the bundle's configRevision and consent evidence when changing its writer configuration.
 * review.questions is the existing wording action=result without answers, not a new operation/consent purpose.
 * Other wording/extraction requests may also return questions as part of their normal output.
 */
export function resolveWriterRoute(
	route: ApprovedRoute,
	request: Pick<OperationRequest, "kind" | "parameters">,
	overrides?: unknown,
): ApprovedRoute {
	const configuration = configurationSchema.parse({
		...configurationSchema.parse(defaults),
		...configurationSchema.partial().parse(overrides === undefined ? {} : overrides),
	});
	const { kind, parameters } = request;
	const mode =
		kind === "review.wording" &&
		parameters.action === "result" &&
		(parameters.answerIds === undefined || (Array.isArray(parameters.answerIds) && parameters.answerIds.length === 0))
			? "review.questions"
			: kind;
	if (!Object.hasOwn(configuration, mode)) return route;
	const selection = configuration[mode as keyof typeof configuration];
	const approved = [route, ...(route.writers ?? [])].find(
		(writer) => writer.model === selection.model && writer.reasoningEffort === selection.reasoningEffort,
	);
	if (
		!approved?.evidenceVersion ||
		!approved.downstreamProvider ||
		(approved.model.startsWith("openai/") && approved.downstreamProvider !== "azure")
	)
		throw new Error("AI_WRITER_ROUTE_UNAPPROVED");
	// Keep all route/consent/usage limits; only the explicitly approved writer and its call bound vary.
	return {
		...route,
		model: approved.model,
		reasoningEffort: selection.reasoningEffort,
		downstreamProvider: approved.downstreamProvider,
		evidenceVersion: approved.evidenceVersion,
		maxCallCostMicros: approved.maxCallCostMicros,
	};
}
