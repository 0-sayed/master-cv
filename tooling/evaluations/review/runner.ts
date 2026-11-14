import type { Evaluation } from "./corpus";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { captureResponse } from "./attempt";
import { Budget, withOpenRouterFee, openRouterFeeMultiplier } from "./budget";
import { loadModels, variantCases, type ModelConfig } from "./config";
import { buildTaskRoute } from "./contracts/route";
import { taskContractFor } from "./contracts/runtime";
import { ProviderCooldown, isRateLimited } from "./cooldown";
import { dispatchLimits, ProviderDispatch, type DispatchLimits } from "./dispatch";
import { prepareCase, goldOutput, evaluateOutput, assertTaskGoldFits, type ExecutionCase } from "./execution";
import {
	fakeCost,
	completionTokenLimit,
	reviewVerifierPolicy,
	executeApprovedStep,
	withAiRuntime,
	type ApprovedRoute,
	type ReasoningEffort,
} from "./production";
import { settlementCharges, type BillingSettlement } from "./reconcile";
import { repairSlot, sessionPromptHash, type RepairPlan } from "./repair";
import { required } from "./required";
import { fixtureHash, returnedProvider } from "./study";
import { benchmarkInput, verifierBound, verifyBenchmark, writerEvidenceValid } from "./verifier";
import { MAX_VERIFIER_FAULT_RETRIES, systemicVerifierFault } from "./verifier-health";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type BenchmarkCall = Evaluation & {
	providerErrorCode?: string;
	schemaErrorCount?: number;
	sessionAttempts?: number;
	billingReconciled?: string;
	/** Raw OpenRouter charges across all purchased attempts, before the single fee rounding. */
	totalOpenRouterBaseMicros?: number | null;
	/** Calibrated/estimated exposure only; the full payer ceiling remains reserved. */
	unknownExposureMicros?: number;
	writerBilling?: { openRouterCostMicros: number | null; openaiCostMicros: number | null };

	/** A request-schema repair reuses the historical slot; original events remain immutable. */
	schemaRepair?: { fromPromptHash: string; toPromptHash: string };
	/** Settled charges (or held reservations) from earlier transient attempts, excluding a reused writer. */
	priorAttemptOpenRouterMicros?: number;
	priorAttemptOpenaiMicros?: number;
	verifierAccepted: boolean;
	safetyAccepted?: boolean;
	qualityAccepted?: boolean | null;
	responseAssessment?: { status: string; reason: string } | null;
	verifierVerdict: unknown;
	honestOutput: boolean;
	adjudication?: "verifier" | "pending-human" | "verifier-fault";
	verifierFault?: string | null;
	/** Durable fault retry count; legacy sessions have not used their one retry. */
	verifierFaultRetries?: number;
	writerTruncated?: boolean;
	writerProvenanceRejected?: boolean;
	verifierTruncated?: boolean;
	usefulnessEligible?: boolean;
	generationUsage?: { inputTokens: number; outputTokens: number; costMicros: number };
	verifierUsage?: {
		model: string;
		provider: string;
		reasoning: string;
		inputTokens: number;
		outputTokens: number;
		costMicros: number;
	};
	factRetention?: "retained" | "lost" | "unclear" | "not_applicable" | null;
	lexicalLostFacts?: string[];
	requiredFactCount: number;
	questionRequired: boolean;
	key: string;
	generationId: string | null;
	fixtureHash: string;
	holdout: boolean;
	exploratory: boolean;
	difficulty: string;
	estimatedInputTokens: number;
	estimatedOutputTokens: number;
	inputTokenCap: number;
	outputTokenCap: number;
	writerCompletionTokenCap?: number;
	verifierCompletionTokenCap?: number;
	id: string;
	caseId: string;
	category: string;
	language: ExecutionCase["language"];
	input: string;
	intent: string;
	runIndex: number;
	model: string;
	provider: string;
	actualProvider: string | null;
	reasoning: ReasoningEffort;
	inputTokens: number | null;
	outputTokens: number | null;
	reasoningTokens: number | null;
	cachedTokens: number | null;
	openRouterCostMicros?: number | null;
	openaiCostMicros?: number | null;
	reservedOpenRouterMicros?: number;
	reservedOpenaiMicros?: number;
	costMicros: number | null;
	reservedMicros: number;
	latencyMs: number;
	outcome: string;
	truncated: boolean;
	output: string;
	outputDigest: string;
	inputDigest: string;
	sourceDigest: string;
	promptDigest: string;
	promptVersion: string;
	schemaVersion: string;
	routeVersion: string;
};
type PlannedSession = { model: string; provider: string; reasoning: string; caseId: string; runIndex: number };
export type BenchmarkArtifact = {
	dispatch?: ReturnType<typeof dispatchLimits> & { worstCaseUnverifiedWriterUsd: number };
	incomplete?: PlannedSession[];
	study?: {
		judgeCanaries?: import("./canaries").JudgeCanaryReceipt;
		name?: import("./config").StudyName;
		approvalProvenance?: ReturnType<typeof import("./study").arabicApprovalProvenance>;
		phase: "smoke" | "full";
		smokeCategory?: "extraction" | "wording-extraction" | undefined;
		hash: string;
		gitCommit: string;
		controls: ReturnType<typeof import("./study").controls>;
		calibration: Calibration[];
		variantStatus?: import("./study").SmokeVariant[];
	};
	id: string;
	createdAt: string;
	mode: "fake" | "live";
	calls: BenchmarkCall[];
	stopReason: string | null;
	modelStops: { model: string; reasoning: string; reason: string }[];
	openaiBudgetUsd?: number;
	reservedOpenaiUsd?: number;
	priorOpenaiSpendUsd?: number;
	budgetUsd: number;
	reservedUsd: number;
	priorSpendUsd: number;
	estimate: ReturnType<typeof estimateBenchmark>;
};
export type AttemptRecord = {
	key: string;
	reservedMicros: number;
	outcome: string;
	failure: import("@reactive-resume/api/features/ai/adapter").AttemptFailure;
};
export type RawRecord = {
	key: string;
	model: string;
	provider: string;
	reasoning: string;
	caseId: string;
	runIndex: number;
	fixtureHash: string;
	promptHash: string;
	reservedOpenRouterMicros?: number;
	reservedOpenaiMicros?: number;
	reservedMicros: number;
	latencyMs: number;
	status: number;
	body: string;
};
export type Calibration = {
	model: string;
	provider: string;
	reasoning: string;
	inputTokens: number;
	outputTokens: number;
	samples: number;
	pairCostMicros?: number;
	pairOpenRouterCostMicros?: number;
	pairOpenaiCostMicros?: number;
	referenceInputTokens?: number;
	generationInputTokens?: number;
	generationOutputTokens?: number;
	verifierInputTokens?: number;
	verifierOutputTokens?: number;
};
const visibleOutputTokens = 2048;
const verifierVisibleOutputTokens = 4096;
/** Equal visible allowance; reasoning consumes the effort-scaled total completion ceiling. */
export function benchmarkCaps(reasoning: ReasoningEffort, category?: string | ExecutionCase) {
	if (typeof category === "object" && category.kind === "task") {
		const contract = taskContractFor(category);
		const model = { ...required(loadModels()[0]), reasoning };
		return {
			writerVisibleOutputTokens: contract.visibleCap(reasoning),
			writerCompletionTokenCap: completionTokenLimit(routeFor(model, "unused", false, category)),
			verifierCompletionTokenCap: completionTokenLimit(
				routeFor({ ...model, reasoning: "low" }, "unused", true, category),
			),
		};
	}
	const name = typeof category === "object" ? category.category : category;
	return {
		writerVisibleOutputTokens: visibleOutputTokens,
		writerCompletionTokenCap: completionTokenLimit({
			maxOutputTokens: visibleOutputTokens,
			reasoningEffort: reasoning,
		}),
		verifierCompletionTokenCap: completionTokenLimit({
			maxOutputTokens: verifierVisibleOutputTokens,
			...(name === "extraction" ? { completionTokenCap: 12288 } : {}),
			reasoningEffort: "low",
		}),
	};
}
export function routeFor(
	model: ModelConfig,
	key: string,
	verification = false,
	category?: string | ExecutionCase,
): ApprovedRoute {
	const task = typeof category === "object" && category.kind === "task" ? category : null;
	const name = typeof category === "object" ? category.category : category;
	const binding: ApprovedRoute = {
		routeId: "a02-benchmark",
		routeRevision: "synthetic-v1",
		configRevision: "eval-v1",
		endpoint: "https://openrouter.ai/api/v1",
		model: model.model,
		downstreamProvider: model.providerEndpoint ?? model.provider,
		apiKey: key,
		noticeVersion: "synthetic-only",
		evidenceVersion: "a02-gold-v1",
		maxCalls: 1,
		maxRepairs: 0,
		callTimeoutMs: verification || ["high", "xhigh", "max"].includes(model.reasoning) ? 90000 : 60000,
		deadlineMs: 60000,
		maxInputCodePoints: 32000,
		maxOutputTokens: verification ? verifierVisibleOutputTokens : visibleOutputTokens,
		...(verification && name === "extraction" ? { completionTokenCap: 12288 } : {}),
		reasoningEffort: model.reasoning,
		requestCapMicros: 1000000,
		maxCallCostMicros: 1000000,
		dayCapMicros: 1000000,
	};
	return task ? buildTaskRoute(taskContractFor(task), model.reasoning, binding, verification) : binding;
}
export function verifierModelFor(writer: ModelConfig, available: ModelConfig[] = loadModels()): ModelConfig {
	const policy = reviewVerifierPolicy(writer.model);
	return required(
		[...available, ...loadModels()].find(
			(m) =>
				m.model === policy.model && m.provider === policy.downstreamProvider && m.reasoning === policy.reasoningEffort,
		),
	);
}
function callBound(model: ModelConfig, c: ExecutionCase, calibration: Calibration[] = [], available?: ModelConfig[]) {
	const { handler, payload } = prepareCase(c);
	// UTF-8 bytes bound byte-level tokens; include actual schema/system and framing slack.
	const inputTokens =
		Buffer.byteLength(
			JSON.stringify({
				system: handler.systemPrompt,
				payload,
				schema: z.toJSONSchema(handler.output, { unrepresentable: "any" }),
			}),
			"utf8",
		) + 4096;
	const writerRoute = routeFor(model, "unused", false, c);
	assertTaskGoldFits(c, writerRoute);
	const outputTokens = completionTokenLimit(writerRoute);
	const vm = verifierModelFor(model, available);
	const verify = verifierBound(vm, c, routeFor(vm, "unused", true, c));
	const generationInput = Math.ceil((inputTokens - 4096) / 3);
	const measured = calibration.find(
		(m) => m.model === model.model && m.provider === model.provider && m.reasoning === model.reasoning,
	);
	const generationMicros = Math.ceil(inputTokens * model.inputPerMillion + outputTokens * model.outputPerMillion);
	const routerBound = withOpenRouterFee(
		(model.provider === "openai" ? 0 : generationMicros) + (vm.provider === "openai" ? 0 : verify.micros),
	);
	const openaiBound =
		(model.provider === "openai" ? generationMicros : 0) + (vm.provider === "openai" ? verify.micros : 0);
	const calibrated = (value: number | undefined, fallback: number) =>
		value === undefined
			? fallback
			: Math.ceil(value * 1.25 * Math.max(1, generationInput / (measured?.referenceInputTokens ?? generationInput)));
	const routerMicros = calibrated(measured?.pairOpenRouterCostMicros, routerBound);
	const openaiMicros = calibrated(measured?.pairOpenaiCostMicros, openaiBound);
	const generationExpected =
		generationInput * model.inputPerMillion +
		Math.ceil(((Buffer.byteLength(JSON.stringify(goldOutput(c))) / 3) * outputTokens) / writerRoute.maxOutputTokens) *
			model.outputPerMillion;
	const verificationExpected =
		verify.estimatedInputTokens * vm.inputPerMillion + verify.estimatedOutputTokens * vm.outputPerMillion;
	const expectedMicros =
		measured?.pairOpenRouterCostMicros !== undefined && measured.pairOpenaiCostMicros !== undefined
			? routerMicros + openaiMicros
			: withOpenRouterFee(
					Math.ceil(
						(model.provider === "openai" ? 0 : generationExpected) +
							(vm.provider === "openai" ? 0 : verificationExpected),
					),
				) +
				Math.ceil(
					(model.provider === "openai" ? generationExpected : 0) +
						(vm.provider === "openai" ? verificationExpected : 0),
				);
	return {
		expectedMicros,
		generationMicros,
		generationInput: Math.ceil((inputTokens - 4096) / 3),
		generationOutput: Math.ceil(
			((Buffer.byteLength(JSON.stringify(goldOutput(c))) / 3) * outputTokens) / visibleOutputTokens,
		),
		verifier: verify,
		inputTokens: inputTokens + verify.inputTokens,
		outputTokens: outputTokens + verify.outputTokens,
		openRouterMicros: routerMicros,
		openaiMicros,
		micros: routerMicros + openaiMicros,
		estimatedInputTokens: verify.estimatedInputTokens + Math.ceil((inputTokens - 4096) / 3),
		estimatedOutputTokens:
			verify.estimatedOutputTokens +
			Math.ceil(
				((Buffer.byteLength(JSON.stringify(goldOutput(c)), "utf8") / 3) * outputTokens) / writerRoute.maxOutputTokens,
			),
	};
}
export function estimateBenchmark(
	models: ModelConfig[],
	cases: ExecutionCase[],
	runs: number,
	calibration: Calibration[] = [],
	verifierModels?: ModelConfig[],
	phase: "smoke" | "full" = "full",
	smokeCategory?: "extraction" | "wording-extraction",
) {
	const perModel = models.map((m) => {
		const vm = verifierModelFor(m, verifierModels ?? models);
		let generation = 0;
		let verification = 0;
		let reservation = 0;
		let routerReservation = 0;
		let openaiReservation = 0;
		const eligible = variantCases(m, cases, phase, smokeCategory);
		for (const c of eligible) {
			const b = callBound(m, c, calibration, verifierModels ?? models);
			generation += b.generationInput * m.inputPerMillion + b.generationOutput * m.outputPerMillion;
			verification +=
				b.verifier.estimatedInputTokens * vm.inputPerMillion + b.verifier.estimatedOutputTokens * vm.outputPerMillion;
			reservation += b.micros;
			routerReservation += b.openRouterMicros;
			openaiReservation += b.openaiMicros;
		}
		const routerExpected =
			((m.provider === "openai" ? 0 : generation) + (vm.provider === "openai" ? 0 : verification)) *
			openRouterFeeMultiplier;
		const openaiExpected = (m.provider === "openai" ? generation : 0) + (vm.provider === "openai" ? verification : 0);
		return {
			...benchmarkCaps(m.reasoning),
			openRouterEstimatedUsd: ((calibration.length ? routerReservation : routerExpected) * runs) / 1e6,
			openaiEstimatedUsd: ((calibration.length ? openaiReservation : openaiExpected) * runs) / 1e6,
			openRouterUpperBoundUsd: (routerReservation * runs) / 1e6,
			openaiUpperBoundUsd: (openaiReservation * runs) / 1e6,
			model: m.model,
			provider: m.provider,
			providerEndpoint: m.providerEndpoint,
			reasoning: m.reasoning,
			inputPerMillion: m.inputPerMillion,
			outputPerMillion: m.outputPerMillion,
			verifier: {
				model: vm.model,
				provider: vm.provider,
				reasoning: vm.reasoning,
				inputPerMillion: vm.inputPerMillion,
				outputPerMillion: vm.outputPerMillion,
			},
			generationEstimatedUsd: (generation * runs * (m.provider === "openai" ? 1 : openRouterFeeMultiplier)) / 1e6,
			verifierEstimatedUsd: (verification * runs * (vm.provider === "openai" ? 1 : openRouterFeeMultiplier)) / 1e6,
			calls: eligible.length * runs,
			providerCalls: eligible.length * runs * 2,
			upperBoundUsd: (reservation * runs) / 1e6,
			estimatedUsd: ((calibration.length ? reservation : routerExpected + openaiExpected) * runs) / 1e6,
		};
	});
	return {
		openRouterEstimatedUsd: perModel.reduce((n, m) => n + m.openRouterEstimatedUsd, 0),
		openaiEstimatedUsd: perModel.reduce((n, m) => n + m.openaiEstimatedUsd, 0),
		openRouterUpperBoundUsd: perModel.reduce((n, m) => n + m.openRouterUpperBoundUsd, 0),
		openaiUpperBoundUsd: perModel.reduce((n, m) => n + m.openaiUpperBoundUsd, 0),
		calls: perModel.reduce((n, m) => n + m.calls, 0),
		providerCalls: perModel.reduce((n, m) => n + m.providerCalls, 0),
		upperBoundUsd: perModel.reduce((n, m) => n + m.upperBoundUsd, 0),
		estimatedUsd: perModel.reduce((n, m) => n + m.estimatedUsd, 0),
		calibrated: calibration.length > 0,
		perModel,
		generationAndVerifier: true,
		openRouterFeePercent: 5.5,
		basis:
			"Independent writer/verifier prices. Calibrated reservation = largest measured pair cost x 1.25 x max(1, source token estimate / smoke reference). Catalog bounds apply before smoke. Unknown billing is held within 3 sessions/$0.05; excess billing stops the run; calibration is an estimate, not a provider billing guarantee.",
	};
}
const endpointSchema = z.object({
	tag: z.string(),
	status: z.number().optional(),
	supported_parameters: z.array(z.string()),
	pricing: z.record(z.string(), z.unknown()),
	max_completion_tokens: z.number().nullable().optional(),
});
export async function refreshModels(
	models: ModelConfig[],
	transport: typeof fetch = globalThis.fetch,
	onSnapshot?: (snapshot: { url: string; fetchedAt: string; body: unknown }) => void | Promise<void>,
): Promise<ModelConfig[]> {
	const refreshed: ModelConfig[] = [];
	for (const m of models) {
		const response = await transport(`https://openrouter.ai/api/v1/models/${m.model}/endpoints`, {
			redirect: "error",
			signal: AbortSignal.timeout(15000),
		});
		if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
		const catalogBody: unknown = await response.json();
		await onSnapshot?.({
			url: `https://openrouter.ai/api/v1/models/${m.model}/endpoints`,
			fetchedAt: new Date().toISOString(),
			body: catalogBody,
		});
		const catalog = z
			.object({ data: z.object({ id: z.string(), endpoints: z.array(endpointSchema) }) })
			.parse(catalogBody);
		if (catalog.data.id !== m.model) throw new Error("CATALOG_MODEL_MISMATCH");
		const endpoints = catalog.data.endpoints.filter((e) =>
			m.providerEndpoint ? e.tag === m.providerEndpoint : e.tag === m.provider || e.tag.startsWith(`${m.provider}/`),
		);
		if (m.providerEndpoint && endpoints.some((e) => e.status !== 0)) throw new Error("PINNED_PROVIDER_UNHEALTHY");
		if (
			!endpoints.length ||
			endpoints.some(
				(e) =>
					!["structured_outputs", "reasoning", "reasoning_effort", "response_format"].every((p) =>
						e.supported_parameters.includes(p),
					) || !["max_tokens", "max_completion_tokens"].some((p) => e.supported_parameters.includes(p)),
			)
		)
			throw new Error("PINNED_PROVIDER_UNSUPPORTED");
		const prices = (keys: string[]) =>
			endpoints.flatMap((e) =>
				[e.pricing, ...(Array.isArray(e.pricing.overrides) ? e.pricing.overrides : [])].flatMap((p) =>
					keys.map((k) => Number((p as Record<string, unknown>)[k] ?? 0) * 1e6),
				),
			);
		if (endpoints.some((e) => Number(e.pricing.request ?? 0) !== 0)) throw new Error("PER_REQUEST_PRICING_UNSUPPORTED");
		const inputPerMillion = Math.max(...prices(["prompt", "input_cache_write", "input_cache_read"]));
		const outputPerMillion = Math.max(...prices(["completion", "internal_reasoning"]));
		if (
			!Number.isFinite(inputPerMillion) ||
			inputPerMillion <= 0 ||
			!Number.isFinite(outputPerMillion) ||
			outputPerMillion <= 0
		)
			throw new Error("CATALOG_PRICE_UNKNOWN");
		if (
			endpoints.some(
				(e) => e.max_completion_tokens != null && e.max_completion_tokens < completionTokenLimit(routeFor(m, "unused")),
			)
		)
			throw new Error("OUTPUT_LIMIT_UNSUPPORTED");
		refreshed.push({ ...m, inputPerMillion, outputPerMillion });
	}
	return refreshed;
}
export type FakeTransport = (
	url: Parameters<typeof fetch>[0],
	init: RequestInit | undefined,
	next: () => Promise<Response>,
	context: { key: string; role: "writer" | "verifier"; model: ModelConfig; route?: ApprovedRoute },
) => Promise<Response>;
export type RunOptions = DispatchLimits & {
	/** Guard-only revision: whitelist paid judges; a missing saved writer is fatal. */
	reverifyKeys?: string[];
	fakeTransport?: FakeTransport;
	billingSettlements?: BillingSettlement[];
	/** Explicit recovery after correcting a systemic upstream cause; never rewrites old journal evidence. */
	recoverSystemic?: boolean;

	/** Abort dispatch only; already dispatched work drains and settles. */
	signal?: AbortSignal;
	repairPlan?: RepairPlan;
	phase?: "smoke" | "full";
	smokeCategory?: "extraction" | "wording-extraction" | undefined;
	models: ModelConfig[];
	verifierModels?: ModelConfig[];
	cases: ExecutionCase[];
	runs: number;
	budgetUsd: number;
	openaiBudgetUsd?: number;
	priorOpenaiSpendMicros?: number;
	fake: boolean;
	key?: string;
	transport?: typeof fetch;
	onCall?: (call: BenchmarkCall) => Promise<void>;
	id?: string;
	previousCalls?: BenchmarkCall[];
	unsettledRetryReservations?: {
		key: string;
		reservedMicros: number;
		reservedOpenRouterMicros?: number;
		reservedOpenaiMicros?: number;
	}[];
	rawRecords?: RawRecord[];
	pendingReservations?: {
		key: string;
		reservedMicros: number;
		reservedOpenRouterMicros?: number;
		reservedOpenaiMicros?: number;
	}[];
	onReserve?: (r: {
		key: string;
		reservedMicros: number;
		reservedOpenRouterMicros?: number;
		reservedOpenaiMicros?: number;
	}) => Promise<void>;
	onRaw?: (r: RawRecord) => Promise<void>;
	onAttempt?: (r: AttemptRecord) => Promise<void>;
	calibration?: Calibration[];
	priorSpendMicros?: number;
};
function unknownBillingExceeded(calls: BenchmarkCall[]) {
	const held = calls.filter((c) => c.costMicros === null);

	return (
		held.length > 3 ||
		held.reduce((n, c) => n + (c.unknownExposureMicros ?? 0), 0) +
			calls
				.filter((c) => c.unknownExposureMicros === undefined && c.costMicros === null)
				.reduce(
					(n, c) =>
						n +
						(c.openRouterCostMicros == null ? (c.reservedOpenRouterMicros ?? c.reservedMicros) : 0) +
						(c.openaiCostMicros === null ? (c.reservedOpenaiMicros ?? 0) : 0),
					0,
				) >
			50000
	);
}
export async function runBenchmark(inputOptions: RunOptions): Promise<BenchmarkArtifact> {
	let options = inputOptions;
	const { models, cases, runs, fake } = options;
	if (!fake && !options.key && options.reverifyKeys?.length !== 0) throw new Error("KEY_REQUIRED");
	const openaiBudget = new Budget(Math.floor((options.openaiBudgetUsd ?? 10) * 1e6));
	const budget = new Budget(Math.floor(options.budgetUsd * 1e6));
	if (!Number.isSafeInteger(options.priorSpendMicros ?? 0) || (options.priorSpendMicros ?? 0) < 0)
		throw new Error("INVALID_PRIOR_SPEND");
	if (!Number.isSafeInteger(options.priorOpenaiSpendMicros ?? 0) || (options.priorOpenaiSpendMicros ?? 0) < 0)
		throw new Error("INVALID_PRIOR_SPEND");
	openaiBudget.consumed = options.priorOpenaiSpendMicros ?? 0;
	budget.consumed = options.priorSpendMicros ?? 0;
	const invalidated = (c: BenchmarkCall | undefined) =>
		c &&
		repairSlot(options.repairPlan, c)?.action === "rerun" &&
		c.promptDigest === repairSlot(options.repairPlan, c)?.fromPromptHash;
	const forceReverification = new Set(options.reverifyKeys);
	const retryable = (c: BenchmarkCall) =>
		forceReverification.has(c.key) ||
		([
			"transient",
			"REQUEST_SCHEMA_ERROR",
			...(options.recoverSystemic
				? ["ACCOUNT_ERROR", "PAYER_MISMATCH", "PROVIDER_MISMATCH", "VERIFIER_PROVIDER_MISMATCH"]
				: []),
		].includes(c.outcome) &&
			c.costMicros !== null) ||
		invalidated(c) ||
		(Boolean(c.verifierFault) && (c.verifierFaultRetries ?? 0) < MAX_VERIFIER_FAULT_RETRIES);
	const completed = new Map((options.previousCalls ?? []).map((c) => [c.key, c]));
	const raws = new Map((options.rawRecords ?? []).map((r) => [r.key, r]));
	if (options.reverifyKeys) {
		for (const key of options.reverifyKeys) {
			const previous = completed.get(key);
			const raw = raws.get(key);
			if (
				!previous ||
				!raw ||
				previous.costMicros === null ||
				raw.status !== 200 ||
				JSON.parse(raw.body).choices?.[0]?.message?.content !== previous.output
			)
				throw new Error("CACHED_WRITER_REQUIRED");
		}
	}
	const settlements = new Map((options.billingSettlements ?? []).map((r) => [r.key, r]));
	for (const [key, receipt] of settlements) {
		const previous = completed.get(key);
		if (!previous || previous.billingReconciled === receipt.evidenceSha256) continue;
		if (previous.costMicros !== null && !(options.unsettledRetryReservations ?? []).some((r) => r.key === key))
			throw new Error("RECONCILIATION_ALREADY_SETTLED");
		const charge = settlementCharges(receipt);
		completed.set(key, {
			...previous,
			openRouterCostMicros: charge.openRouterMicros,
			openaiCostMicros: charge.openaiMicros,
			totalOpenRouterBaseMicros: receipt.writer.openRouterBaseMicros + receipt.verifier.openRouterBaseMicros,
			costMicros: charge.openRouterMicros + charge.openaiMicros,
			priorAttemptOpenRouterMicros: 0,
			priorAttemptOpenaiMicros: 0,
			outcome: "transient",
			billingReconciled: receipt.evidenceSha256,
			writerBilling: {
				openRouterCostMicros: receipt.writer.openRouterBaseMicros,
				openaiCostMicros: receipt.writer.openaiMicros,
			},
		});
	}
	for (const [key, receipt] of settlements)
		if (!completed.has(key)) {
			const charge = settlementCharges(receipt);
			budget.consumed += charge.openRouterMicros;
			openaiBudget.consumed += charge.openaiMicros;
		}
	// An interrupted multi-attempt sequence has no durable aggregate settlement.
	// Keep its parent reservation; replaying just the last body would lose earlier charges.
	const rawCounts = new Map<string, number>();
	for (const raw of options.rawRecords ?? []) rawCounts.set(raw.key, (rawCounts.get(raw.key) ?? 0) + 1);
	const interruptedRetry = (options.rawRecords ?? []).some((raw) => {
		if (completed.has(raw.key.replace(/:verify$/u, "")) || settlements.has(raw.key.replace(/:verify$/u, "")))
			return false;
		if ((rawCounts.get(raw.key) ?? 0) > 1) return true;
		try {
			// A single recorded error is also unfinished; replaying it would invent retry charges.
			return Boolean(JSON.parse(raw.body)?.error);
		} catch {
			return false;
		}
	});
	for (const c of completed.values()) {
		budget.consumed += c.priorAttemptOpenRouterMicros ?? 0;
		openaiBudget.consumed += c.priorAttemptOpenaiMicros ?? 0;
		budget.consumed +=
			c.openRouterCostMicros === undefined
				? (c.costMicros ?? c.reservedMicros)
				: (c.openRouterCostMicros ?? c.reservedOpenRouterMicros ?? c.reservedMicros);
		openaiBudget.consumed += c.openaiCostMicros ?? c.reservedOpenaiMicros ?? 0;
	}
	for (const r of raws.values())
		if (!completed.has(r.key.replace(/:verify$/u, "")) && !settlements.has(r.key.replace(/:verify$/u, ""))) {
			budget.consumed += r.reservedOpenRouterMicros ?? r.reservedMicros;
			openaiBudget.consumed += r.reservedOpenaiMicros ?? 0;
		}
	const pending = (options.pendingReservations ?? []).filter(
		(r) =>
			r.reservedMicros > 0 &&
			!settlements.has(r.key) &&
			!completed.has(r.key.replace(/:verify$/u, "")) &&
			!raws.has(r.key),
	);
	budget.consumed += pending.reduce((n, r) => n + (r.reservedOpenRouterMicros ?? r.reservedMicros), 0);
	openaiBudget.consumed += pending.reduce((n, r) => n + (r.reservedOpenaiMicros ?? 0), 0);
	const unsettledRetries = (options.unsettledRetryReservations ?? []).filter((r) => !settlements.has(r.key));
	for (const r of unsettledRetries) {
		budget.consumed += r.reservedOpenRouterMicros ?? r.reservedMicros;
		openaiBudget.consumed += r.reservedOpenaiMicros ?? 0;
	}
	const artifact: BenchmarkArtifact = {
		id: options.id ?? randomUUID(),
		createdAt: new Date().toISOString(),
		mode: fake ? "fake" : "live",
		calls: [...completed.values()],
		stopReason: null,
		modelStops: [],
		openaiBudgetUsd: options.openaiBudgetUsd ?? 10,
		priorOpenaiSpendUsd: (options.priorOpenaiSpendMicros ?? 0) / 1e6,
		budgetUsd: options.budgetUsd,
		reservedUsd: 0,
		priorSpendUsd: (options.priorSpendMicros ?? 0) / 1e6,
		estimate: estimateBenchmark(
			models,
			cases,
			runs,
			options.calibration,
			options.verifierModels ?? models,
			options.phase,
			options.smokeCategory,
		),
	};
	const planned = models.flatMap((m) =>
		variantCases(m, cases, options.phase, options.smokeCategory).flatMap((c) =>
			Array.from({ length: runs }, (_, runIndex) => ({
				model: m.model,
				provider: m.provider,
				reasoning: m.reasoning,
				caseId: c.id,
				runIndex,
			})),
		),
	);
	const finish = () => {
		const key = (s: PlannedSession) => JSON.stringify([s.model, s.provider, s.reasoning, s.caseId, s.runIndex]);
		const done = new Set(artifact.calls.filter((c) => c.costMicros !== null && !retryable(c)).map(key));
		artifact.incomplete = planned.filter((s) => !done.has(key(s)));
		artifact.reservedUsd = budget.consumed / 1e6;
		artifact.reservedOpenaiUsd = openaiBudget.consumed / 1e6;
		return artifact;
	};
	const accountAbort = !options.recoverSystemic
		? artifact.calls.find((c) => ["ACCOUNT_ERROR", "PAYER_MISMATCH"].includes(c.outcome))?.outcome
		: undefined;
	const previousAbort =
		accountAbort ??
		(artifact.calls.some((c) => c.outcome === "REQUEST_SCHEMA_ERROR" && (c.schemaErrorCount ?? 2) >= 2) &&
		!options.recoverSystemic
			? "REQUEST_SCHEMA_ERROR"
			: !options.recoverSystemic &&
				  artifact.calls.some((c) => c.actualProvider !== null && returnedProvider(c.actualProvider) !== c.provider)
				? "PROVIDER_MISMATCH"
				: !options.recoverSystemic &&
					  artifact.calls.some(
							(c) =>
								c.verifierUsage &&
								c.verifierUsage.provider !== "unknown" &&
								returnedProvider(c.verifierUsage.provider) !== reviewVerifierPolicy(c.model).downstreamProvider,
					  )
					? "VERIFIER_PROVIDER_MISMATCH"
					: unknownBillingExceeded(artifact.calls)
						? "BILLING_UNKNOWN"
						: artifact.calls.some((c) => (c.costMicros ?? 0) > c.reservedMicros)
							? "BILLING_BOUND_EXCEEDED"
							: null);
	if (previousAbort) {
		artifact.stopReason = previousAbort;
		return finish();
	}
	if (pending.length || interruptedRetry || unsettledRetries.length) {
		artifact.stopReason = "PENDING_BILLING";
		return finish();
	}

	const limits = dispatchLimits(options);
	const cooldown = new ProviderCooldown();
	const verifierCooldown = new ProviderCooldown();
	const pool = new ProviderDispatch(limits, () => Boolean(artifact.stopReason));
	const verifierKey = (m: ModelConfig) => JSON.stringify([m.providerEndpoint ?? m.provider, m.model]);
	const variantKey = (m: ModelConfig) => JSON.stringify([m.model, m.provider, m.reasoning]);
	const unverified = new Map<string, number>();
	// One durable event at a time; in-memory raw cache and journal observe the same ordering.
	let journal = Promise.resolve();
	let journalError: unknown;
	const serial = (work: () => Promise<void>) => {
		const next = journal.then(() => {
			if (journalError) throw journalError;
			return work();
		});
		journal = next.then(
			() => {},
			(error: unknown) => {
				journalError = error;
				artifact.stopReason ??= "JOURNAL_IO_FAILED";
			},
		);
		return next;
	};
	const callbacks = options;
	options = {
		...options,
		onReserve: (r) =>
			serial(async () => {
				await callbacks.onReserve?.(r);
			}),
		onRaw: (r) =>
			serial(async () => {
				await callbacks.onRaw?.(r);
				raws.set(r.key, r);
			}),
		onAttempt: (r) =>
			serial(async () => {
				await callbacks.onAttempt?.(r);
			}),
		onCall: (c) =>
			serial(async () => {
				await callbacks.onCall?.(c);
			}),
	};
	const jobs = [...cases].flatMap((c) =>
		Array.from({ length: runs }, (_, runIndex) =>
			models
				.filter((model) => variantCases(model, cases, options.phase, options.smokeCategory).includes(c))
				.map((model) => {
					const estimated = callBound(model, c, options.calibration, options.verifierModels ?? models);
					const ceiling = callBound(model, c, [], options.verifierModels ?? models);
					const bound = {
						...estimated,
						openRouterMicros: ceiling.openRouterMicros * 5,
						openaiMicros: ceiling.openaiMicros * 5,
						micros: ceiling.micros * 5,
					};
					const { handler, payload, snapshot } = prepareCase(c);
					const promptHash = sessionPromptHash(c);
					const key = digest([
						model.model,
						model.provider,
						model.reasoning,
						c.id,
						runIndex,
						promptHash,
						fixtureHash(c),
					]);
					const slot = options.repairPlan?.slots.find(
						(s) =>
							s.model === model.model &&
							s.provider === model.provider &&
							s.reasoning === model.reasoning &&
							s.caseId === c.id &&
							s.runIndex === runIndex,
					);
					if (slot && slot.toPromptHash !== promptHash) throw new Error("REPAIR_TARGET_MISMATCH");
					const oldSlot = [...completed.values()].find(
						(old) =>
							old.model === model.model &&
							old.provider === model.provider &&
							old.reasoning === model.reasoning &&
							old.caseId === c.id &&
							old.runIndex === runIndex,
					);
					if (!slot && oldSlot && oldSlot.key !== key) throw new Error("SESSION_IDENTITY_MISMATCH");
					const resumeKey = slot?.key ?? key;

					return {
						c,
						runIndex,
						model,
						bound,
						handler,
						payload,
						snapshot,
						promptHash,
						key: resumeKey,
						vm: verifierModelFor(model, options.verifierModels ?? models),
					};
				}),
		).flat(),
	);
	const outageBounds = new Map<string, number>();
	for (const job of jobs) {
		const chargedWriter =
			job.model.provider === "openai" ? job.bound.generationMicros : withOpenRouterFee(job.bound.generationMicros);
		outageBounds.set(
			verifierKey(job.vm),
			Math.max(outageBounds.get(verifierKey(job.vm)) ?? 0, chargedWriter * 5 * limits.maxUnverified),
		);
	}
	artifact.dispatch = {
		...limits,
		worstCaseUnverifiedWriterUsd: [...outageBounds.values()].reduce((a, b) => a + b, 0) / 1e6,
	};
	const awaitingVerification = new Set<string>();
	const successfulWriter = (record: RawRecord | undefined) => {
		if (!record || record.status < 200 || record.status >= 300) return false;
		try {
			return !JSON.parse(record.body).error;
		} catch {
			return false;
		}
	};
	for (const job of jobs) {
		const previous = completed.get(job.key);
		if ((!previous || retryable(previous)) && !invalidated(previous) && successfulWriter(raws.get(job.key))) {
			awaitingVerification.add(job.key);
			unverified.set(verifierKey(job.vm), (unverified.get(verifierKey(job.vm)) ?? 0) + 1);
		}
	}
	const order = new Map(jobs.map((job, index) => [job.key, index]));
	const schemaFailures = new Map<string, number>();
	const observeFailure = (
		model: ModelConfig,
		r: import("@reactive-resume/api/features/ai/adapter").ApprovedStepResult,
	) => {
		if (r.outcome === "ACCOUNT_ERROR" || r.outcome === "PAYER_MISMATCH") artifact.stopReason = r.outcome;
		if (r.outcome === "REQUEST_SCHEMA_ERROR" && r.failure?.providerErrorCode) {
			const k = JSON.stringify([model.provider, model.model, r.failure.providerErrorCode]);
			const count = (schemaFailures.get(k) ?? 0) + 1;
			schemaFailures.set(k, count);
			if (count >= 2) artifact.stopReason = "REQUEST_SCHEMA_ERROR";
		}
	};
	const tries = new Map<string, number>();
	const active = new Map<string, Promise<void>>();
	const activeVariants = new Set<string>();
	const attempted = new Set<string>();
	const progress = new Map(
		models.map((m) => [
			variantKey(m),
			jobs.filter(
				(j) =>
					variantKey(j.model) === variantKey(m) && completed.has(j.key) && !retryable(required(completed.get(j.key))),
			).length,
		]),
	);
	const execute = async (job: (typeof jobs)[number], releaseWriter: () => void) => {
		const { c, runIndex, model, bound, handler, payload, snapshot, promptHash, key, vm } = job;
		const previous = completed.get(key);
		const settlement = !previous ? settlements.get(key) : undefined;
		const settled = settlement ? settlementCharges(settlement) : undefined;
		// A transient writer must be sent again; only a successful writer can be reused.
		const recorded = raws.get(key);
		const reusableWriter =
			!invalidated(previous) &&
			successfulWriter(recorded) &&
			(!previous || previous.actualProvider !== null) &&
			(!recorded || returnedProvider(JSON.parse(recorded.body).provider) === model.provider) &&
			!(model.provider === "openai" && JSON.parse(recorded?.body ?? "{}").usage?.is_byok === false);
		if (options.reverifyKeys && !reusableWriter) throw new Error("CACHED_WRITER_REQUIRED");
		if (previous?.verifierFault && !reusableWriter) {
			artifact.stopReason = "CACHED_WRITER_REQUIRED";
			return;
		}
		const cached = previous ? (reusableWriter ? recorded : undefined) : recorded;
		if (!cached || previous || settlement) {
			if (bound.openRouterMicros > budget.capMicros - budget.consumed) {
				artifact.stopReason = "BUDGET_LIMIT";
				return;
			}
			if (bound.openaiMicros > openaiBudget.capMicros - openaiBudget.consumed) {
				artifact.stopReason = "OPENAI_BUDGET_LIMIT";
				return;
			}
			budget.reserve(bound.openRouterMicros);
			openaiBudget.reserve(bound.openaiMicros);
			await options.onReserve?.({
				key,
				reservedMicros: bound.micros,
				reservedOpenRouterMicros: bound.openRouterMicros,
				reservedOpenaiMicros: bound.openaiMicros,
			});
		}
		let rateLimited = false;
		let rawOutput = "";
		let actualProvider: string | null = null;
		let reasoningTokens: number | null = null;
		let generationId: string | null = null;
		let rawFinish: string | null = null;
		let rawInput: number | null = null;
		let rawTokens: number | null = null;
		const scripted = goldOutput(c);
		// The final repetition is an explicit adversarial double; never model evidence.
		if (fake && runs > 1 && runIndex === runs - 1 && c.kind === "wording" && c.attack)
			scripted.proposals = [
				{
					id: "p",
					passageId: "selected",
					text: c.attack,
					claims: splitReviewClaims(c.attack, ["selected"]),
					reason: "Synthetic attack",
					evidenceIds: ["selected"],
				},
			];
		const scriptedBase: typeof fetch = cached
			? () =>
					Promise.resolve(
						new Response(cached.body, { status: cached.status, headers: { "content-type": "application/json" } }),
					)
			: fake
				? () =>
						Promise.resolve(
							Response.json({
								id: "fake-response",
								model: model.model,
								provider: model.provider === "openai" ? "OpenAI" : model.provider,
								choices: [
									{
										index: 0,
										message: { role: "assistant", content: JSON.stringify(scripted) },
										finish_reason: "stop",
									},
								],
								usage: {
									prompt_tokens: bound.generationInput,
									completion_tokens: bound.generationOutput,
									total_tokens: bound.generationInput + bound.generationOutput,
									completion_tokens_details: { reasoning_tokens: model.reasoning === "none" ? 0 : 10 },
									...fakeCost(
										model.provider,
										(bound.generationInput * model.inputPerMillion + bound.generationOutput * model.outputPerMillion) /
											1e6,
									),
								},
							}),
						)
				: (options.transport ?? globalThis.fetch);
		const base: typeof fetch =
			fake && options.fakeTransport && !cached
				? (url, init) =>
						required(options.fakeTransport)(url, init, () => scriptedBase(url, init), {
							key,
							role: "writer",
							model,
							route: routeFor(model, options.key ?? "fake-key", false, c),
						})
				: scriptedBase;
		const transport: typeof fetch = async (url, init) => {
			// Price ceilings prevent a catalog change from invalidating reservations.
			const body = JSON.parse(String(init?.body)) as { provider: Record<string, unknown> };
			body.provider.max_price = { prompt: model.inputPerMillion, completion: model.outputPerMillion };
			if (artifact.stopReason && !cached) throw new Error("BENCHMARK_STOPPED");

			const response = await captureResponse(
				base,
				url,
				{ ...init, body: JSON.stringify(body) },
				!cached && (!fake || Boolean(options.fakeTransport)),
			);
			const received = await response.text();
			const rawBody = options.key ? received.replaceAll(options.key, "[REDACTED]") : received;
			rateLimited = isRateLimited(response.status, rawBody);
			if (!cached && rateLimited) cooldown.record(model, true, "transient");
			pool.observe(model, rateLimited, response.ok && !rateLimited);
			if (!cached)
				await options.onRaw?.({
					key,
					model: model.model,
					provider: model.provider,
					reasoning: model.reasoning,
					caseId: c.id,
					runIndex,
					fixtureHash: fixtureHash(c),
					promptHash,
					reservedMicros: bound.micros,
					reservedOpenRouterMicros: bound.openRouterMicros,
					reservedOpenaiMicros: bound.openaiMicros,
					latencyMs: performance.now() - start,
					status: response.status,
					body: rawBody,
				});
			try {
				const data = z
					.object({
						id: z.string().optional(),
						provider: z.string().optional(),
						choices: z
							.array(
								z.object({
									message: z.object({ content: z.string().nullable().optional() }),
									finish_reason: z.string().optional(),
								}),
							)
							.optional(),
						usage: z
							.object({
								prompt_tokens: z.number().int().nonnegative().optional(),
								completion_tokens: z.number().int().nonnegative().optional(),
								completion_tokens_details: z
									.object({ reasoning_tokens: z.number().int().nonnegative().optional() })
									.optional(),
							})
							.optional(),
					})
					.parse(JSON.parse(rawBody));
				generationId = data.id ?? null;
				rawFinish = data.choices?.[0]?.finish_reason ?? null;
				rawInput = data.usage?.prompt_tokens ?? null;
				rawTokens = data.usage?.completion_tokens ?? null;
				rawOutput = data.choices?.[0]?.message.content ?? "";
				actualProvider = data.provider ?? null;
				reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
			} catch {
				/* Adapter retains schema/error outcomes; never log provider error bodies. */
			}
			return new Response(rawBody, { status: response.status, headers: response.headers });
		};
		const start = performance.now();
		let result;
		try {
			result = await withAiRuntime({ routes: [], handlers: {}, workerAvailable: false, fetch: transport }, () =>
				executeApprovedStep(
					{
						route: routeFor(model, options.key ?? "fake-key", false, c),
						operationId: "a02",
						attemptId: String(runIndex),
						stepId: c.id,
						payload,
						outputSchema: handler.output,
						systemPrompt: required(handler.systemPrompt),
						signal: new AbortController().signal,
					},
					{
						concurrencyLimit: pool.limit(model),
						onAttempt: async (r) => {
							observeFailure(model, r);
							if (r.failure)
								await options.onAttempt?.({ key, reservedMicros: 0, outcome: r.outcome, failure: r.failure });
						},
					},
				),
			);
		} finally {
			releaseWriter();
		}
		const paidWriter =
			previous?.writerBilling ??
			(settlement
				? {
						openRouterCostMicros: settlement.writer.openRouterBaseMicros,
						openaiCostMicros: settlement.writer.openaiMicros,
					}
				: undefined);
		if (cached && paidWriter)
			result = {
				...result,
				...paidWriter,
				costMicros:
					paidWriter.openRouterCostMicros === null || paidWriter.openaiCostMicros === null
						? null
						: paidWriter.openRouterCostMicros + paidWriter.openaiCostMicros,
			};
		if (["ACCOUNT_ERROR", "PAYER_MISMATCH"].includes(result.outcome)) observeFailure(model, result);
		if (!cached && !rateLimited) cooldown.record(model, false, result.outcome);
		let evaluation = evaluateOutput(c, result.output);
		const writerProvenanceRejected =
			result.outcome === "valid" && evaluation.schemaValid && !writerEvidenceValid(c, result.output ?? {});
		let payloadRejected = false;
		if (result.outcome === "valid" && evaluation.schemaValid) {
			try {
				benchmarkInput(c, result.output ?? {});
			} catch (error) {
				if (
					!(error instanceof Error) ||
					!["AI_PAYLOAD_ENCODING", "AI_EMPTY_SELECTION", "AI_INPUT_LIMIT"].includes(error.message)
				)
					throw error;
				payloadRejected = true;
				evaluation.guardAccepted = false;
				evaluation.guardError = error.message;
			}
		}

		// Benchmark audit only: adjudicate rejected wording independently, never publish it.
		// The parent already reserves generation plus this one pinned verifier call.
		const verification =
			result.outcome === "valid" &&
			evaluation.schemaValid &&
			!writerProvenanceRejected &&
			!payloadRejected &&
			result.costMicros !== null &&
			returnedProvider(actualProvider) === model.provider
				? await verifyBenchmark({
						options,
						onResult: (r) => observeFailure(vm, r),
						cooldown: verifierCooldown,
						pool,
						stopped: () => Boolean(artifact.stopReason),
						model: verifierModelFor(model, options.verifierModels ?? models),
						c,
						route: routeFor(
							verifierModelFor(model, options.verifierModels ?? models),
							options.key ?? "fake-key",
							true,
							c,
						),
						output: result.output ?? {},
						parentKey: key,
						runIndex,
						promptHash,
						fixtureHash: fixtureHash(c),
						...(!previous && raws.get(key + ":verify") ? { cached: raws.get(key + ":verify") } : {}),
					})
				: null;
		if (c.kind === "task" && verification?.result.outcome === "valid" && !verification.fault)
			evaluation = evaluateOutput(c, result.output, verification.verdict);
		if (verification && ["ACCOUNT_ERROR", "PAYER_MISMATCH"].includes(verification.result.outcome))
			observeFailure(vm, verification.result);
		const combine = (a: number | null, b: number | null | undefined) =>
			a === null || b === null ? null : a + (b ?? 0);
		const routerRaw = combine(result.openRouterCostMicros, verification?.result.openRouterCostMicros);
		const priorRouter = previous
			? (previous.priorAttemptOpenRouterMicros ?? 0) +
				(previous.openRouterCostMicros ?? previous.reservedOpenRouterMicros ?? previous.reservedMicros) -
				(cached ? withOpenRouterFee(result.openRouterCostMicros ?? 0) : 0)
			: (settled?.openRouterMicros ?? 0) -
				(settlement && cached ? withOpenRouterFee(result.openRouterCostMicros ?? 0) : 0);
		const previousBase =
			previous?.totalOpenRouterBaseMicros ??
			(settlement ? settlement.writer.openRouterBaseMicros + settlement.verifier.openRouterBaseMicros : 0);
		const totalOpenRouterBaseMicros =
			routerRaw === null
				? null
				: previousBase + routerRaw - ((previous || settlement) && cached ? (result.openRouterCostMicros ?? 0) : 0);
		const hasBase = !previous || previous.totalOpenRouterBaseMicros !== undefined;
		const openRouterCostMicros =
			routerRaw === null
				? null
				: hasBase && totalOpenRouterBaseMicros !== null
					? withOpenRouterFee(totalOpenRouterBaseMicros) - priorRouter
					: withOpenRouterFee(routerRaw);
		const openaiCostMicros = combine(result.openaiCostMicros, verification?.result.openaiCostMicros);
		const costMicros = combine(openRouterCostMicros, openaiCostMicros);
		const inputTokens =
			result.inputTokens === null || (verification && verification.result.inputTokens === null)
				? null
				: (result.inputTokens ?? rawInput ?? 0) + (verification?.result.inputTokens ?? 0);
		const outputTokens =
			result.outputTokens === null || (verification && verification.result.outputTokens === null)
				? null
				: (result.outputTokens ?? rawTokens ?? 0) + (verification?.result.outputTokens ?? 0);
		if (
			verification &&
			verification.provider !== null &&
			returnedProvider(verification.provider) !== verifierModelFor(model, options.verifierModels ?? models).provider
		)
			artifact.stopReason = "VERIFIER_PROVIDER_MISMATCH";

		const call: BenchmarkCall = {
			...evaluation,
			writerProvenanceRejected,
			sessionAttempts: (previous?.sessionAttempts ?? 0) + 1,
			...(previous?.billingReconciled || settlement
				? { billingReconciled: previous?.billingReconciled ?? required(settlement).evidenceSha256 }
				: {}),
			unknownExposureMicros: bound.expectedMicros,
			writerBilling: { openRouterCostMicros: result.openRouterCostMicros, openaiCostMicros: result.openaiCostMicros },
			...(hasBase ? { totalOpenRouterBaseMicros } : {}),
			...(result.failure?.providerErrorCode ? { providerErrorCode: result.failure.providerErrorCode } : {}),
			schemaErrorCount: Math.max(0, ...schemaFailures.values()),
			...(previous && (previous.promptDigest !== promptHash || previous.schemaRepair)
				? { schemaRepair: previous.schemaRepair ?? { fromPromptHash: previous.promptDigest, toPromptHash: promptHash } }
				: {}),
			verifierFaultRetries: (previous?.verifierFaultRetries ?? 0) + Number(Boolean(previous?.verifierFault)),
			priorAttemptOpenRouterMicros: previous
				? (previous.priorAttemptOpenRouterMicros ?? 0) +
					(previous.openRouterCostMicros ?? previous.reservedOpenRouterMicros ?? previous.reservedMicros) -
					(cached ? withOpenRouterFee(result.openRouterCostMicros ?? 0) : 0)
				: (settled?.openRouterMicros ?? 0) -
					(settlement && cached ? withOpenRouterFee(result.openRouterCostMicros ?? 0) : 0),
			priorAttemptOpenaiMicros: previous
				? (previous.priorAttemptOpenaiMicros ?? 0) +
					(previous.openaiCostMicros ?? previous.reservedOpenaiMicros ?? 0) -
					(cached ? (result.openaiCostMicros ?? 0) : 0)
				: (settled?.openaiMicros ?? 0) - (settlement && cached ? (result.openaiCostMicros ?? 0) : 0),
			verifierAccepted: verification?.accepted ?? false,
			safetyAccepted: Boolean(
				verification?.accepted && evaluation.guardAccepted && !evaluation.score?.unsupportedClaims.length,
			),
			qualityAccepted: verification?.qualityAccepted ?? null,
			responseAssessment: verification?.responseAssessment ?? null,
			verifierVerdict: verification?.verdict ?? null,
			honestOutput: verification?.accepted ?? false,
			adjudication: verification?.fault ? "verifier-fault" : verification?.accepted ? "verifier" : "pending-human",
			verifierFault: verification?.fault ?? null,
			writerTruncated: result.outcome === "truncated" || rawFinish === "length",
			verifierTruncated: verification?.result.outcome === "truncated",
			usefulnessEligible:
				(c.kind === "task" ? false : c.improvementExpected) &&
				verification?.assessment !== "no_change_needed" &&
				(c.kind === "task" || c.task !== "clarify impact without inventing") &&
				!verification?.fault,
			noChangeHonest: evaluation.noChangeProposed
				? verification?.fault || !verification
					? null
					: verification.accepted && verification.assessment === "no_change_needed"
				: false,
			factRetention: verification?.retention ?? null,
			lexicalLostFacts: [...(evaluation.score?.lostFacts ?? [])],
			generationUsage: {
				inputTokens: result.inputTokens ?? 0,
				outputTokens: result.outputTokens ?? 0,
				costMicros: result.costMicros ?? 0,
			},
			...(verification
				? {
						verifierUsage: {
							model: verifierModelFor(model, options.verifierModels ?? models).model,
							provider: verification.provider ?? "unknown",
							reasoning: "low",
							inputTokens: verification.result.inputTokens ?? 0,
							outputTokens: verification.result.outputTokens ?? 0,
							costMicros: verification.result.costMicros ?? 0,
						},
					}
				: {}),
			requiredFactCount: evaluation.retentionApplicable
				? c.kind === "task"
					? c.cv.length
					: c.requiredFacts.length
				: 0,
			questionRequired: c.requiresQuestion,
			key,
			generationId: generationId ?? result.responseId,
			fixtureHash: fixtureHash(c),
			holdout: c.holdout,
			exploratory: c.exploratory,
			difficulty: c.kind === "task" ? "unrated" : c.difficulty,
			estimatedInputTokens: bound.estimatedInputTokens,
			estimatedOutputTokens: bound.estimatedOutputTokens,
			inputTokenCap: bound.inputTokens,
			outputTokenCap: bound.outputTokens,
			...benchmarkCaps(model.reasoning, c),
			id: randomUUID(),
			caseId: c.id,
			category: c.category,
			language: c.language,
			input: c.kind === "task" ? JSON.stringify(payload) : c.input,
			intent: c.kind === "task" ? taskContractFor(c).verifierContext(c, goldOutput(c)).taskInstruction : c.intent,
			runIndex,
			model: model.model,
			provider: model.provider,
			actualProvider,
			reasoning: model.reasoning,
			inputTokens,
			outputTokens,
			reasoningTokens,
			cachedTokens: result.cachedTokens,
			openRouterCostMicros,
			openaiCostMicros,
			reservedOpenRouterMicros: previous
				? bound.openRouterMicros
				: (cached?.reservedOpenRouterMicros ?? bound.openRouterMicros),
			reservedOpenaiMicros: previous ? bound.openaiMicros : (cached?.reservedOpenaiMicros ?? bound.openaiMicros),
			costMicros,
			reservedMicros: previous ? bound.micros : (cached?.reservedMicros ?? bound.micros),
			latencyMs: cached?.latencyMs ?? performance.now() - start,
			outcome:
				actualProvider !== null && returnedProvider(actualProvider) !== model.provider
					? "PROVIDER_MISMATCH"
					: verification?.provider && returnedProvider(verification.provider) !== vm.provider
						? "VERIFIER_PROVIDER_MISMATCH"
						: result.outcome === "valid" && actualProvider === null
							? "transient"
							: verification &&
								  ["ACCOUNT_ERROR", "PAYER_MISMATCH", "REQUEST_SCHEMA_ERROR"].includes(verification.result.outcome)
								? verification.result.outcome
								: verification?.result.outcome === "transient"
									? "transient"
									: result.outcome,
			truncated: result.outcome === "truncated" || rawFinish === "length",
			output: rawOutput,
			outputDigest: digest(result.output ?? rawOutput),
			inputDigest: digest(payload),
			sourceDigest: digest(snapshot.evidence),
			promptDigest: promptHash,
			promptVersion: handler.promptVersion,
			schemaVersion: handler.schemaVersion,
			routeVersion: "a02-eval-v1",
		};
		if (call.retentionApplicable && call.score && verification?.retention === "lost" && !call.score.lostFacts.length)
			call.score.lostFacts =
				c.kind === "task"
					? c.cv.map((f) => f.id)
					: c.requiredFacts.length
						? [...c.requiredFacts]
						: ["verifier:omitted-source-fact"];
		if (call.score && verification?.accepted && verification.retention === "retained") call.score.lostFacts = [];
		if (call.usefulnessEligible)
			call.usefulnessMiss = !(
				verification?.qualityAccepted &&
				verification.usefulness === "improved" &&
				!call.emptyAnswer
			);
		if (!call.usefulnessEligible || call.verifierFault) call.usefulnessMiss = false;
		// Fabrication remains visible in unchanged scoring/report safety gates; one lexical hit does not stop dispatch.
		const oldIndex = artifact.calls.findIndex((c) => c.key === key);
		if (oldIndex >= 0) artifact.calls[oldIndex] = call;
		else artifact.calls.push(call);
		completed.set(key, call);
		forceReverification.delete(key);
		if (!artifact.stopReason && systemicVerifierFault(artifact.calls)) artifact.stopReason = "VERIFIER_FAULT";
		awaitingVerification.delete(key);
		unverified.set(verifierKey(vm), Math.max(0, (unverified.get(verifierKey(vm)) ?? 1) - 1));
		await options.onCall?.(call);
		try {
			// Cached writer expense is already charged. Reserve the same pair bound, settle only new work.
			const routerIncrement =
				call.openRouterCostMicros == null
					? null
					: call.openRouterCostMicros -
						((previous || settlement) && cached ? withOpenRouterFee(result.openRouterCostMicros ?? 0) : 0);
			const openaiIncrement =
				call.openaiCostMicros == null
					? null
					: call.openaiCostMicros - ((previous || settlement) && cached ? (result.openaiCostMicros ?? 0) : 0);
			for (const [reserved, actual] of [
				[call.reservedOpenRouterMicros ?? call.reservedMicros, routerIncrement],
				[call.reservedOpenaiMicros ?? 0, openaiIncrement],
			] as const)
				if (actual !== null && (!Number.isSafeInteger(actual) || actual < 0 || actual > required(reserved)))
					throw new Error("BILLING_BOUND_EXCEEDED");
			budget.settle(call.reservedOpenRouterMicros ?? call.reservedMicros, routerIncrement);
			openaiBudget.settle(call.reservedOpenaiMicros ?? 0, openaiIncrement);
		} catch {
			artifact.stopReason = "BILLING_BOUND_EXCEEDED";
			return;
		}
		if (artifact.stopReason) return;
		if (actualProvider !== null && returnedProvider(actualProvider) !== model.provider) {
			call.outcome = "PROVIDER_MISMATCH";
			artifact.stopReason = "PROVIDER_MISMATCH";
			return;
		}
		if (unknownBillingExceeded(artifact.calls)) {
			artifact.stopReason = "BILLING_UNKNOWN";
			return;
		}
	};
	while (!artifact.stopReason) {
		if (options.signal?.aborted) break;
		if (systemicVerifierFault(artifact.calls)) {
			artifact.stopReason = "VERIFIER_FAULT";
			break;
		}

		const fairVariants = models.filter((m) => {
			const vm = verifierModelFor(m, options.verifierModels ?? models);
			return (
				!verifierCooldown.blocked(vm) &&
				cooldown.delay([m]) === 0 &&
				((unverified.get(verifierKey(vm)) ?? 0) < limits.maxUnverified ||
					jobs.some(
						(j) => variantKey(j.model) === variantKey(m) && awaitingVerification.has(j.key) && !attempted.has(j.key),
					)) &&
				!artifact.modelStops.some((stop) => stop.model === m.model && stop.reasoning === m.reasoning) &&
				jobs.some(
					(j) =>
						(!options.reverifyKeys || options.reverifyKeys.includes(j.key)) &&
						variantKey(j.model) === variantKey(m) &&
						!attempted.has(j.key) &&
						(!completed.has(j.key) || retryable(required(completed.get(j.key)))),
				)
			);
		});
		const leastProgress = Math.min(...fairVariants.map((m) => progress.get(variantKey(m)) ?? 0));
		let launched = false;
		let deferredWait = Infinity;
		let budgetBlock: string | null = null;
		for (const job of [...jobs].sort(
			(a, b) => Number(awaitingVerification.has(b.key)) - Number(awaitingVerification.has(a.key)),
		)) {
			if (active.size >= limits.sessionConcurrency || artifact.stopReason || options.signal?.aborted) break;
			const { model, key, vm } = job;
			if (options.reverifyKeys && !options.reverifyKeys.includes(key)) continue;
			const previous = completed.get(key);
			if ((previous && !retryable(previous)) || attempted.has(key)) continue;

			// A failed judge must first recover via resume; never buy another writer to probe it.
			if (!awaitingVerification.has(key) && (unverified.get(verifierKey(vm)) ?? 0) >= limits.maxUnverified) continue;
			if (cooldown.expired([model]) || verifierCooldown.expired([vm])) continue;
			const delay = Math.max(cooldown.delay([model]), verifierCooldown.delay([vm]));
			if (delay > 0) {
				deferredWait = Math.min(deferredWait, delay);
				continue;
			}
			if ((progress.get(variantKey(model)) ?? 0) > leastProgress + 2) continue;
			const cached = raws.has(key) && !previous;
			if (
				!cached &&
				(job.bound.openRouterMicros > budget.capMicros - budget.consumed ||
					job.bound.openaiMicros > openaiBudget.capMicros - openaiBudget.consumed)
			) {
				budgetBlock ??=
					job.bound.openRouterMicros > budget.capMicros - budget.consumed ? "BUDGET_LIMIT" : "OPENAI_BUDGET_LIMIT";
				break;
			}
			const release = pool.tryAcquire(model);
			if (!release) continue;
			attempted.add(key);
			tries.set(key, (tries.get(key) ?? 0) + 1);
			progress.set(variantKey(model), (progress.get(variantKey(model)) ?? 0) + 1);
			if (!awaitingVerification.has(key)) {
				awaitingVerification.add(key);
				unverified.set(verifierKey(vm), (unverified.get(verifierKey(vm)) ?? 0) + 1);
			}
			activeVariants.add(variantKey(model));
			let released = false;
			const releaseOnce = () => {
				if (!released) {
					released = true;
					release();
				}
			};
			const work = execute(job, releaseOnce)
				.catch((error: unknown) => {
					artifact.stopReason ??=
						error instanceof Error && error.message === "BENCHMARK_STOPPED"
							? "PROVIDER_RATE_LIMITED"
							: "JOURNAL_OR_DISPATCH_FAILED";
				})
				.finally(() => {
					releaseOnce();
					active.delete(key);
					activeVariants.delete(variantKey(model));
					const latest = completed.get(key);
					if (!artifact.stopReason && latest && retryable(latest) && (tries.get(key) ?? 0) < 12) attempted.delete(key);
				});
			active.set(key, work);
			launched = true;
		}
		if (active.size) {
			await Promise.race(active.values());
			continue;
		}
		if (budgetBlock) {
			artifact.stopReason = budgetBlock;
			break;
		}

		if (!launched && Number.isFinite(deferredWait)) {
			await cooldown.wait(deferredWait);
			continue;
		}
		break;
	}
	await Promise.all(active.values());
	if (options.signal?.aborted) artifact.stopReason ??= "INTERRUPTED";
	await journal;
	if (journalError) throw journalError;
	artifact.calls.sort((a, b) => (order.get(a.key) ?? -1) - (order.get(b.key) ?? -1));
	for (const c of artifact.calls.filter((c) => c.outcome === "unsupported"))
		if (!artifact.modelStops.some((m) => m.model === c.model && m.reasoning === c.reasoning))
			artifact.modelStops.push({ model: c.model, reasoning: c.reasoning, reason: "UNSUPPORTED_VARIANT" });
	return finish();
}
