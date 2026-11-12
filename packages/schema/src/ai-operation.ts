import { z } from "zod";

const identifier = z.string().min(1).max(200);
export const operationStateSchema = z.enum([
	"queued",
	"running",
	"waiting_review",
	"succeeded",
	"failed",
	"cancel_requested",
	"cancelled",
]);
export type OperationState = z.infer<typeof operationStateSchema>;
export const routeBindingSchema = z.strictObject({
	routeId: identifier,
	routeRevision: identifier,
	configRevision: identifier,
});
export type RouteBinding = z.infer<typeof routeBindingSchema>;
export const sourceRevisionSchema = z.strictObject({
	kind: z.enum(["resume", "career", "job"]),
	id: identifier,
	revision: identifier,
});
export type SourceRevision = z.infer<typeof sourceRevisionSchema>;
export const operationRequestSchema = z.strictObject({
	requestKey: identifier,
	kind: identifier,
	sources: z.array(sourceRevisionSchema).min(1).max(10),
	route: routeBindingSchema,
	consentVersion: identifier,
	parameters: z.record(z.string(), z.unknown()),
});
export type OperationRequest = z.infer<typeof operationRequestSchema>;
export const operationViewSchema = z
	.strictObject({
		id: identifier,
		state: operationStateSchema,
		resultId: identifier.nullable(),
		failureCode: identifier.nullable(),
	})
	.refine(
		(v) => !["waiting_review", "succeeded"].includes(v.state) || v.resultId !== null,
		"Delivered operations require a result",
	);
export type OperationView = z.infer<typeof operationViewSchema>;
export const operationPreflightSchema = z.strictObject({
	operationCost: z.literal(1),
	available: z.boolean(),
	reason: identifier.nullable(),
	requestFingerprint: identifier,
});
export type OperationPreflight = z.infer<typeof operationPreflightSchema>;
export const aiAvailabilitySchema = z.strictObject({
	state: z.enum(["not_enabled", "unavailable", "ready"]),
	reason: identifier.nullable(),
});
export type AiAvailability = z.infer<typeof aiAvailabilitySchema>;
export const resumeOutcomeSchema = z.strictObject({
	capability: z.enum(["resumed", "completed", "expired", "unsupported", "unavailable"]),
	operation: operationViewSchema,
});
export type ResumeOutcome = z.infer<typeof resumeOutcomeSchema>;

const transitions: Record<OperationState, readonly OperationState[]> = {
	queued: ["running", "cancelled", "failed"],
	running: ["waiting_review", "succeeded", "cancel_requested", "failed"],
	cancel_requested: ["cancelled", "failed"],
	waiting_review: ["succeeded"],
	succeeded: [],
	failed: [],
	cancelled: [],
};
export function canTransitionOperation(from: OperationState, to: OperationState): boolean {
	return transitions[from].includes(to);
}
