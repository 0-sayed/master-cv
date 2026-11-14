import type { ResumeCreateInput } from "../resume/service";
import type { ModelPayload, ModelPayloadInput } from "./payload";
import type { WriterRouteApproval } from "./writer-policy";
import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import type { AiAvailability, OperationRequest, RouteBinding } from "@reactive-resume/schema/ai-operation";
import type { ResumeCreationKind } from "@reactive-resume/schema/ai-usage";
import type { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, eq, isNull } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiProcessingConsent } from "@reactive-resume/db/schema";
import { resolveReviewVerifierRoute } from "./verifier-policy";
import { resolveWriterRoute } from "./writer-policy";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type ApprovedRoute = RouteBinding & {
	/** Additional exact writer/effort approvals in this same versioned consent/config bundle. */
	writers?: readonly WriterRouteApproval[];
	/** Explicitly approved cross-family verification in this consent/config bundle. */
	verifier?:
		| { evidenceVersion: string; maxCallCostMicros: number; policy?: import("./verifier-policy").VerifierPolicy }
		| undefined;
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
	/** Visible-output allowance; completionTokenLimit includes reasoning overhead. */
	maxOutputTokens: number;
	/** Explicit completion allowance for a large verifier response; visible writer limits stay unchanged. */
	completionTokenCap?: number;
	reasoningEffort?: ReasoningEffort;
	requestCapMicros: number;
	/** Reviewed conservative per-call bound from exact model pricing and input/output limits. */
	maxCallCostMicros: number;
	dayCapMicros: number;
};
/** Effort allocations are OpenRouter approximations, not a guarantee of visible output. */
export function completionTokenLimit(
	route: Pick<ApprovedRoute, "maxOutputTokens" | "reasoningEffort" | "completionTokenCap">,
): number {
	const visiblePercent = { none: 100, minimal: 90, low: 80, medium: 50, high: 20, xhigh: 5, max: 5 };
	const effort = route.reasoningEffort ?? "none";
	if (
		!Object.hasOwn(visiblePercent, effort) ||
		!Number.isSafeInteger(route.maxOutputTokens) ||
		route.maxOutputTokens <= 0 ||
		route.maxOutputTokens > 4096
	)
		throw new Error("AI_INVALID_OUTPUT_LIMIT");
	const scaled = Math.ceil((route.maxOutputTokens * 100) / visiblePercent[effort]);
	if (
		route.completionTokenCap !== undefined &&
		(!Number.isSafeInteger(route.completionTokenCap) ||
			route.completionTokenCap < scaled ||
			route.completionTokenCap > 12288)
	)
		throw new Error("AI_INVALID_OUTPUT_LIMIT");
	return route.completionTokenCap ?? scaled;
}

export type OperationHandler = {
	verifier?: {
		output: z.ZodType<Record<string, unknown>>;
		systemPrompt: string;
		buildInput: (payload: ModelPayload, output: Record<string, unknown>) => ModelPayload;
		validate: (output: Record<string, unknown>, verdict: unknown) => void;
	};
	systemPrompt?: string;
	validateResult?: (
		tx: OwnerTransaction,
		ownerId: string,
		request: OperationRequest,
		output: Record<string, unknown>,
	) => Promise<Record<string, unknown>>;
	promptVersion: string;
	schemaVersion: string;
	parameters: z.ZodType<Record<string, unknown>>;
	output: z.ZodType<Record<string, unknown>>;
	buildInput: (ownerId: string, request: OperationRequest, signal?: AbortSignal) => Promise<ModelPayloadInput>;
	copyClaim?: (request: OperationRequest) => ResumeCreationKind;
	createCopy?: (output: Record<string, unknown>) => Pick<ResumeCreateInput, "name" | "locale" | "data">;
	resultState: "waiting_review" | "succeeded";
};
export type AiRuntime = {
	/** Reviewed server composition only: model/effort overrides, never credentials or public request input. */
	writerConfig?: unknown;
	/** Local composition only; ignored in production. Never configured by a public request. */
	localOwnerAllowance?: { ownerId: string; limit: number } | undefined;
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
	let route = runtime.routes.find(
		(r) =>
			r.routeId === request.route.routeId &&
			r.routeRevision === request.route.routeRevision &&
			r.configRevision === request.route.configRevision,
	);
	if (!route || route.noticeVersion !== request.consentVersion || !route.evidenceVersion) denyAiProcessing();
	try {
		route = resolveWriterRoute(route, request, runtime.writerConfig);
	} catch {
		denyAiProcessing();
	}
	if (runtime.handlers[request.kind]?.verifier) {
		try {
			const verifier = resolveReviewVerifierRoute(route);
			completionTokenLimit(verifier);
			if ((route.maxCalls - 1) * route.maxCallCostMicros + verifier.maxCallCostMicros > route.requestCapMicros)
				denyAiProcessing();
		} catch {
			denyAiProcessing();
		}
	}
	try {
		completionTokenLimit(route);
	} catch {
		denyAiProcessing();
	}
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
