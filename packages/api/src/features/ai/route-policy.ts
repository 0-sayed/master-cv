import type { ResumeCreateInput } from "../resume/service";
import type { ModelPayloadInput } from "./payload";
import type { AiAvailability, OperationRequest, RouteBinding } from "@reactive-resume/schema/ai-operation";
import type { ResumeCreationKind } from "@reactive-resume/schema/ai-usage";
import type { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, eq, isNull } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiProcessingConsent } from "@reactive-resume/db/schema";

export type ApprovedRoute = RouteBinding & {
	endpoint: string;
	model: string;
	downstreamProvider: string;
	apiKey: string;
	noticeVersion: string;
	evidenceVersion: string;
	maxCalls: number;
	maxRepairs: number;
	callTimeoutMs: number;
	deadlineMs: number;
	maxInputCodePoints: number;
	maxOutputTokens: number;
	requestCapMicros: number;
	/** Reviewed conservative per-call bound from exact model pricing and input/output limits. */
	maxCallCostMicros: number;
	dayCapMicros: number;
};
export type OperationHandler = {
	promptVersion: string;
	schemaVersion: string;
	parameters: z.ZodType<Record<string, unknown>>;
	output: z.ZodType<Record<string, unknown>>;
	buildInput: (ownerId: string, request: OperationRequest) => Promise<ModelPayloadInput>;
	copyClaim?: (request: OperationRequest) => ResumeCreationKind;
	createCopy?: (output: Record<string, unknown>) => Pick<ResumeCreateInput, "name" | "locale" | "data">;
	resultState: "waiting_review" | "succeeded";
};
export type AiRuntime = {
	routes: readonly ApprovedRoute[];
	handlers: Readonly<Record<string, OperationHandler>>;
	workerAvailable: boolean;
	/** Composition-time test transport only. Never enabled by an HTTP flag or configuration credential. */
	fetch?: typeof globalThis.fetch;
};

const runtimeScope = new AsyncLocalStorage<AiRuntime>();
// Release has no approved manifest/consumer. A future register is reviewed server source, not client input.
const defaultRuntime: AiRuntime = { routes: [], handlers: {}, workerAvailable: false };
export const getAiRuntime = (): AiRuntime => runtimeScope.getStore() ?? defaultRuntime;
export const withAiRuntime = <T>(runtime: AiRuntime, work: () => T): T => runtimeScope.run(runtime, work);

export function getAiAvailability(): AiAvailability {
	const runtime = getAiRuntime();
	if (!runtime.routes.length) return { state: "not_enabled", reason: "NO_APPROVED_ROUTE" };
	if (!runtime.workerAvailable) return { state: "unavailable", reason: "WORKER_UNAVAILABLE" };
	return { state: "ready", reason: null };
}
function denyAiProcessing(): never {
	throw new ORPCError("PRECONDITION_FAILED", {
		message: "AI processing is not enabled.",
		data: { reason: "AI_NOT_ENABLED" },
	});
}
export const assertLegacyAiDenied: () => void = denyAiProcessing;
export function getOperationHandler(kind: string): OperationHandler {
	const handler = Object.hasOwn(getAiRuntime().handlers, kind) ? getAiRuntime().handlers[kind] : undefined;
	if (!handler) throw new ORPCError("PRECONDITION_FAILED", { data: { reason: "AI_NOT_ENABLED" } });
	return handler;
}

export async function resolveApprovedRoute(userId: string, request: OperationRequest): Promise<ApprovedRoute> {
	const runtime = getAiRuntime();
	const route = runtime.routes.find(
		(r) =>
			r.routeId === request.route.routeId &&
			r.routeRevision === request.route.routeRevision &&
			r.configRevision === request.route.configRevision,
	);
	if (!route || route.noticeVersion !== request.consentVersion || !route.evidenceVersion) denyAiProcessing();
	const positive = [
		route.maxCalls,
		route.callTimeoutMs,
		route.deadlineMs,
		route.maxInputCodePoints,
		route.maxOutputTokens,
		route.requestCapMicros,
		route.maxCallCostMicros,
		route.dayCapMicros,
	];
	if (
		positive.some((v) => !Number.isSafeInteger(v) || v <= 0) ||
		route.maxCalls > 3 ||
		route.maxRepairs < 0 ||
		route.maxRepairs > 1 ||
		route.callTimeoutMs > 30000 ||
		route.deadlineMs > 120000 ||
		route.maxInputCodePoints > 32000 ||
		route.maxOutputTokens > 4096 ||
		route.requestCapMicros > route.dayCapMicros ||
		!Number.isSafeInteger(route.maxCalls * route.maxCallCostMicros) ||
		route.maxCalls * route.maxCallCostMicros > route.requestCapMicros ||
		!route.model ||
		!route.downstreamProvider ||
		!Number.isSafeInteger(route.maxRepairs)
	)
		denyAiProcessing();
	if (!runtime.workerAvailable) throw new ORPCError("PRECONDITION_FAILED", { data: { reason: "AI_UNAVAILABLE" } });
	const [consent] = await withOwnerDatabase(userId, (tx) =>
		tx
			.select()
			.from(aiProcessingConsent)
			.where(
				and(
					eq(aiProcessingConsent.userId, userId),
					eq(aiProcessingConsent.routeId, route.routeId),
					eq(aiProcessingConsent.routeRevision, route.routeRevision),
					eq(aiProcessingConsent.configRevision, route.configRevision),
					eq(aiProcessingConsent.noticeVersion, request.consentVersion),
					eq(aiProcessingConsent.purpose, request.kind),
					isNull(aiProcessingConsent.revokedAt),
				),
			),
	);
	if (!consent) throw new ORPCError("PRECONDITION_FAILED", { data: { reason: "AI_CONSENT_REQUIRED" } });
	return route;
}

export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
			.join(",")}}`;
	return JSON.stringify(value);
}
export function operationFingerprint(
	request: OperationRequest,
	handler: Pick<OperationHandler, "promptVersion" | "schemaVersion">,
): string {
	const { requestKey: _key, ...binding } = request;
	return createHash("sha256")
		.update(canonicalJson({ ...binding, promptVersion: handler.promptVersion, schemaVersion: handler.schemaVersion }))
		.digest("hex");
}
