import type { ModelConfig } from "./config";
import type { ProviderDispatch } from "./dispatch";
import type { RawRecord, RunOptions } from "./runner";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { normalizeFact } from "@reactive-resume/api/features/ai/hard-facts";
import {
	verificationClaims,
	reviewVerifierSchema,
	hasReviewEdits,
} from "@reactive-resume/api/features/ai/review-verifier";
import {
	VARIANT_VERIFIER_VERSION,
	variantVerifierPrompt,
	variantVerifierSchema,
} from "@reactive-resume/api/features/ai/variant-verifier";
import { captureResponse } from "./attempt";
import {
	taskContractFor,
	taskVerifierFor as scopedTaskVerifierFor,
	type TaskVerifierAdapter,
} from "./contracts/runtime";
import { isProductionVariantCase } from "./contracts/runtime";
import { tasksVerifierSchema, mqmErrorsSchema, productionVerdict } from "./contracts/verifier/schema";
import { tasksVerifierVersion } from "./contracts/verifier/verifier";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { isRateLimited, type ProviderCooldown } from "./cooldown";
import { prepareCase as prepareCoreCase } from "./corpus";
import { prepareCase, goldOutput, evaluateOutput, minimizeTaskPayload, type ExecutionCase } from "./execution";
import { fakeCost } from "./production";
import { executeApprovedStep, withAiRuntime, completionTokenLimit, type ApprovedRoute } from "./production";
import { normalizeCapacityResponse, requestTokenAllowance } from "./provider-rate-policy";
import {
	mergeScopedJudgment,
	rejectionTargets,
	scopedJudgment,
	voteRejections,
	type RejectionTarget,
} from "./rejection-vote";
import { required } from "./required";
import { verifierBudgetRoute, usesExpandedVerifierBudget } from "./verifier-budget";
import {
	canonicalVerifierVerdict,
	degenerateVerifierContent,
	VERIFIER_WHITESPACE_STOPS,
	MAX_VERIFIER_PROTOCOL_RETRIES,
} from "./verifier-protocol";

const benchmarkVerifierSchema = reviewVerifierSchema.extend({
	usefulness: z.strictObject({
		status: z.enum(["improved", "unchanged", "unclear", "not_applicable"]),
		reason: z.string().trim().min(1).max(600),
	}),
});
const benchmarkPrompt = readFileSync(new URL("./benchmark-verifier.md", import.meta.url), "utf8");
export const variantBenchmarkProtocol = readFileSync(
	new URL("./contracts/verifier/variant-protocol.md", import.meta.url),
	"utf8",
);
export const variantBenchmarkVerifierVersion = `${VARIANT_VERIFIER_VERSION}+benchmark-protocol-v4-compact-json`;
const taskVerifierFor = () => scopedTaskVerifierFor(tasksVerifier);
/** A judge cannot repair a writer's reference to a nonexistent source. */
export function writerEvidenceValid(c: ExecutionCase, output: Record<string, unknown>): boolean {
	const ids = new Set(
		c.kind === "task"
			? c.cv.map((f) => f.id)
			: prepareCase(c).payload.selections.flatMap((s) => ("id" in s && s.id !== "intent" ? [s.id] : [])),
	);
	const valid = (value: unknown): boolean => {
		if (Array.isArray(value)) return value.every(valid);
		if (!value || typeof value !== "object") return true;
		return Object.entries(value).every(([key, field]) =>
			key === "evidenceIds"
				? Array.isArray(field) && field.every((id) => typeof id === "string" && ids.has(id))
				: valid(field),
		);
	};
	if (c.kind === "task") {
		const contract = taskContractFor(c);
		const parsed = contract.outputSchema.safeParse(output);
		if (
			!parsed.success ||
			contract.claims(c, parsed.data).some((claim) => claim.evidenceIds.some((id) => !ids.has(id)))
		)
			return false;
	}
	return valid(output);
}
/** Validate the judge's own evidence before trusting either positive or negative judgments. */
export function verifierAuditFault(c: ExecutionCase, output: Record<string, unknown>, raw: unknown): string | null {
	if (c.kind === "task") {
		const adapter = taskVerifierFor();
		const auditSchema = adapter.version === tasksVerifierVersion ? tasksVerifierSchema : adapter.schema;
		if (!auditSchema.safeParse(raw).success) return "INVALID_VERIFIER_OUTPUT";
		return adapter.auditFault(c, output, raw);
	}
	const parsed = benchmarkVerifierSchema.safeParse(raw);
	if (!parsed.success) return "INVALID_VERIFIER_OUTPUT";
	const claims = verificationClaims(output);
	const verdict = parsed.data;
	const sources = prepareCase(c).payload.selections;
	const ids = new Set(sources.flatMap((s) => ("id" in s && s.id !== "intent" ? [s.id] : [])));
	if (
		[...verdict.factRetention.evidenceIds, ...verdict.verdicts.flatMap((v) => v.evidenceIds)].some((id) => !ids.has(id))
	)
		return "VERIFIER_UNKNOWN_EVIDENCE";
	if (
		verdict.verdicts.length !== claims.length ||
		new Set(verdict.verdicts.map((v) => v.claimId)).size !== claims.length ||
		verdict.verdicts.some(
			(v) =>
				!claims.some(
					(claim) => claim.claimId === v.claimId && v.evidenceIds.every((id) => claim.evidenceIds.includes(id)),
				),
		)
	)
		return "VERIFIER_UNKNOWN_CLAIM";
	const quoteText = (text: string) =>
		normalizeFact(text)
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim();
	const input = quoteText(
		benchmarkInput(c, output)
			.selections.map((s) => s.text)
			.join("\n"),
	);
	for (const reason of [
		verdict.responseAssessment.reason,
		verdict.factRetention.reason,
		...verdict.verdicts.map((v) => v.reason),
	])
		for (const match of reason.matchAll(/(?<!\p{L})["“'«]([^"”'»\n]{4,})["”'»]/gu))
			if (!input.includes(quoteText(match[1] ?? ""))) return "VERIFIER_UNSUPPLIED_QUOTE";
	return null;
}
export function benchmarkVerifierSpec(c: ExecutionCase) {
	if (c.kind === "task") {
		if (isProductionVariantCase(c))
			return {
				version: variantBenchmarkVerifierVersion,
				systemPrompt: `${variantVerifierPrompt}\n\n${variantBenchmarkProtocol}`,
				schema:
					c.category === "translation"
						? variantVerifierSchema.extend({
								quality: tasksVerifierSchema.shape.quality.extend({ mqm: mqmErrorsSchema }),
							})
						: variantVerifierSchema,
			};
		const adapter = taskVerifierFor();
		return { version: adapter.version, systemPrompt: adapter.systemPrompt, schema: adapter.schema };
	}
	const verifier = prepareCoreCase(c).handler.verifier;
	if (!verifier) throw new Error("VERIFIER_REQUIRED");
	return {
		version: "a02-benchmark-verifier-v4",
		systemPrompt: `${verifier.systemPrompt}\n\n${benchmarkPrompt}`,
		schema: benchmarkVerifierSchema,
	};
}
export function benchmarkInput(c: ExecutionCase, output: Record<string, unknown>) {
	if (c.kind === "task") {
		const payload = taskVerifierFor().buildInput(c, output);
		if (isProductionVariantCase(c)) return payload;
		const minimized = minimizeTaskPayload(payload);
		const structuredPools = new Set([
			"task-cv-evidence",
			"task-job-context",
			"task-verification-task",
			"task-verification-response",
		]);
		return {
			...minimized,
			// IDs stay escaped through contact minimization, then become readable at the final wire boundary.
			selections: minimized.selections.map((selection) =>
				"id" in selection && structuredPools.has(selection.id)
					? { ...selection, text: JSON.stringify(JSON.parse(selection.text)) }
					: selection,
			),
		};
	}
	const verifier = prepareCoreCase(c).handler.verifier;
	if (!verifier) throw new Error("VERIFIER_REQUIRED");
	return {
		selections: [
			...verifier.buildInput(prepareCase(c).payload, output).selections,
			{
				id: "benchmark-task",
				kind: "model_proposed" as const,
				section: "summary" as const,
				text: JSON.stringify({
					task: c.task,
					intent: c.intent,
					improvementExpected: c.improvementExpected,
					requiredFacts: c.requiredFacts,
					factAlternatives: c.factAlternatives,
				}),
			},
		],
	};
}

export function verifierBound(model: ModelConfig, c: ExecutionCase, route: ApprovedRoute) {
	const payload = benchmarkInput(c, goldOutput(c));
	const { systemPrompt, schema } = benchmarkVerifierSpec(c);
	const estimatedBytes =
		Buffer.byteLength(
			JSON.stringify({
				system: systemPrompt,
				payload,
				schema: z.toJSONSchema(schema, { unrepresentable: "any" }),
			}),
		) + 4096;
	const inputTokens =
		4 * route.maxInputCodePoints +
		Buffer.byteLength(systemPrompt) +
		Buffer.byteLength(JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }))) +
		4096;
	const outputTokens = completionTokenLimit(route);
	const retryOutputTokens =
		c.kind === "task" && usesExpandedVerifierBudget(route) ? completionTokenLimit(verifierBudgetRoute(route, true)) : 0;
	const output =
		c.kind === "task"
			? taskVerifierFor().fakeVerdict(c, goldOutput(c))
			: {
					schemaVersion: 3,
					responseAssessment: {
						status: "appropriate",
						reason: "Scripted task response; not measured semantic evidence.",
					},
					usefulness: {
						status: c.improvementExpected ? "improved" : "not_applicable",
						reason: "Scripted case-task judgment; no measured semantic evidence.",
					},
					factRetention: {
						status: hasReviewEdits(goldOutput(c)) ? "retained" : "not_applicable",
						evidenceIds: hasReviewEdits(goldOutput(c)) ? ["selected"] : [],
						reason: "Scripted fixture retention; no measured semantic evidence.",
					},
					verdicts: verificationClaims(goldOutput(c)).map((claim) => ({
						claimId: claim.claimId,
						verdict: "supported",
						evidenceIds: claim.evidenceIds,
						reason: "All stated facts are supported by the cited source.",
					})),
				};
	const estimatedInputTokens = Math.ceil((estimatedBytes - 4096) / 3);
	const estimatedOutputTokens = Math.ceil(
		((Buffer.byteLength(JSON.stringify(output)) / 3) * outputTokens) / route.maxOutputTokens,
	);
	return {
		inputTokens,
		outputTokens,
		estimatedInputTokens,
		estimatedOutputTokens,
		retryOutputTokens,
		micros: Math.ceil(
			inputTokens * (retryOutputTokens ? 2 : 1) * model.inputPerMillion +
				(outputTokens + retryOutputTokens) * model.outputPerMillion,
		),
	};
}

async function verifyBenchmarkOnce(input: {
	options: RunOptions;
	cooldown?: ProviderCooldown;
	reserveRetry?: (provider: string, micros: number) => Promise<void>;
	pool?: ProviderDispatch;
	stopped?: () => boolean;
	onResult?: (result: import("@reactive-resume/api/features/ai/adapter").ApprovedStepResult) => void;
	model: ModelConfig;
	c: ExecutionCase;
	route: ApprovedRoute;
	output: Record<string, unknown>;
	parentKey: string;
	runIndex: number;
	promptHash: string;
	fixtureHash: string;
	cached?: RawRecord | undefined;
	cachedJudgments?: RawRecord[];
	judgmentIndex?: number | undefined;
	focus?: RejectionTarget[] | undefined;
	initialVerdict?: unknown;
	budgetSuffix?: string;
}) {
	const { options, model, c, route, output, parentKey, runIndex, promptHash, fixtureHash, cached } = input;
	const verifier = c.kind === "task" ? null : prepareCoreCase(c).handler.verifier;
	if (c.kind !== "task" && !verifier) throw new Error("VERIFIER_REQUIRED");
	const key =
		parentKey + ":verify" + (input.judgmentIndex ? `:judge:${input.judgmentIndex}` : "") + (input.budgetSuffix ?? "");
	if (
		cached &&
		(cached.key !== key ||
			cached.caseId !== c.id ||
			cached.model !== model.model ||
			cached.provider !== model.provider ||
			cached.reasoning !== model.reasoning ||
			cached.promptHash !== promptHash ||
			cached.fixtureHash !== fixtureHash)
	)
		throw new Error("VERIFIER_REPLAY_MISMATCH");
	const bound = verifierBound(model, c, route);
	if (!cached) await options.onReserve?.({ key, reservedMicros: 0 }); // Parent reserves BOTH calls before generation.
	const verdict =
		c.kind === "task"
			? taskVerifierFor().fakeVerdict(c, output)
			: {
					schemaVersion: 3,
					responseAssessment: {
						status: "appropriate",
						reason: "Scripted task response; not measured semantic evidence.",
					},
					usefulness: {
						status: !c.improvementExpected
							? "not_applicable"
							: evaluateOutput(c, output).usefulnessMiss
								? "unchanged"
								: "improved",
						reason: "Scripted case-task judgment; no measured semantic evidence.",
					},
					factRetention: {
						status: hasReviewEdits(output) ? "retained" : "not_applicable",
						evidenceIds: hasReviewEdits(output) ? ["selected"] : [],
						reason: "Scripted fixture retention; no measured semantic evidence.",
					},
					verdicts: verificationClaims(output).map((claim) => ({
						claimId: claim.claimId,
						verdict: isDeepStrictEqual(output, goldOutput(c)) ? "supported" : "unsupported",
						evidenceIds: claim.evidenceIds,
						reason: "Scripted oracle only; this is not measured model fidelity.",
					})),
				};
	const scoped = input.focus ? scopedJudgment(verdict, input.focus) : verdict;
	const scriptedVerdict =
		input.focus && c.kind === "task" && isProductionVariantCase(c) && c.category !== "translation"
			? productionVerdict(scoped)
			: scoped;
	let rateLimited = false;
	let provider: string | null = null;
	let rawVerdict: unknown = null;
	let degenerate = false;
	const start = performance.now();
	let requestsSent = 0;
	const transport: typeof fetch = async (url, init) => {
		const body = JSON.parse(String(init?.body));
		if (c.kind === "task") body.stop = VERIFIER_WHITESPACE_STOPS;
		body.provider.max_price = { prompt: model.inputPerMillion, completion: model.outputPerMillion };
		if (!cached && input.stopped?.()) throw new Error("BENCHMARK_STOPPED");
		if (!cached && !options.fake) {
			const pacing = input.pool?.beforeRequest(model, requestTokenAllowance(body));
			if (pacing) await pacing;
		}
		if (!cached) {
			if (requestsSent > 0)
				await input.reserveRetry?.(
					model.provider,
					Math.ceil(bound.inputTokens * model.inputPerMillion + bound.outputTokens * model.outputPerMillion),
				);
			requestsSent++;
		}
		const response = await captureResponse(
			(target, request) => {
				const next = async () =>
					cached
						? new Response(cached.body, { status: cached.status })
						: options.fake
							? Response.json({
									id: "fake-verifier",
									provider: model.provider === "openai" ? "OpenAI" : model.provider,
									model: model.model,
									choices: [
										{
											index: 0,
											message: { role: "assistant", content: JSON.stringify(scriptedVerdict) },
											finish_reason: "stop",
										},
									],
									usage: {
										prompt_tokens: bound.estimatedInputTokens,
										completion_tokens: bound.estimatedOutputTokens,
										total_tokens: bound.estimatedInputTokens + bound.estimatedOutputTokens,
										...fakeCost(
											model.provider,
											(bound.estimatedInputTokens * model.inputPerMillion +
												bound.estimatedOutputTokens * model.outputPerMillion) /
												1e6,
										),
									},
								})
							: await (options.transport ?? fetch)(target, request);
				return options.fake && options.fakeTransport && !cached
					? options.fakeTransport(target, request, next, {
							key: parentKey,
							requestKey: key,
							role: "verifier",
							model,
							route,
						})
					: next();
			},
			url,
			{ ...init, body: JSON.stringify(body) },
			!cached && (!options.fake || Boolean(options.fakeTransport)),
		);
		const received = await response.text();
		if (Buffer.byteLength(received) > 1048576) throw new Error("AI_RESPONSE_LIMIT");
		const raw = options.key ? received.replaceAll(options.key, "[REDACTED]") : received;
		const normalized = normalizeCapacityResponse(
			new Response(raw, { status: response.status, headers: response.headers }),
			raw,
		);
		rateLimited = isRateLimited(normalized.status, raw);
		if (!cached && !options.fake) input.pool?.observeResponse(model, response, raw);
		if (!cached && rateLimited) input.cooldown?.record(model, true, "transient");
		if (!cached) input.pool?.observe(model, rateLimited, response.ok && !rateLimited);
		if (!cached)
			await options.onRaw?.({
				billingPrice: { inputPerMillion: model.inputPerMillion, outputPerMillion: model.outputPerMillion },
				key,
				model: model.model,
				provider: model.provider,
				reasoning: model.reasoning,
				caseId: c.id,
				runIndex,
				fixtureHash,
				promptHash,
				reservedMicros: 0,
				latencyMs: performance.now() - start,
				status: response.status,
				body: raw,
			});
		try {
			const data = JSON.parse(raw);
			provider = typeof data.provider === "string" && data.provider.trim() ? data.provider : null;
			degenerate = c.kind === "task" && degenerateVerifierContent(data.choices?.[0]?.message?.content);
			rawVerdict = JSON.parse(data.choices?.[0]?.message?.content ?? "null");
		} catch {
			/* Strict adapter rejects malformed output. */
		}
		return normalized;
	};
	const release = cached ? undefined : await input.pool?.acquire(model).catch(() => undefined);
	let measured;
	try {
		measured = await withAiRuntime({ routes: [], handlers: {}, workerAvailable: false, fetch: transport }, () =>
			executeApprovedStep(
				{
					route,
					operationId: "a02",
					attemptId: String(runIndex),
					stepId: c.id + ":verify",
					payload: input.focus
						? {
								...benchmarkInput(c, output),
								selections: [
									...benchmarkInput(c, output).selections,
									{
										id: "benchmark-rejudge-scope",
										kind: "user_supplied",
										section: "summary",
										text: JSON.stringify({ requested: input.focus }),
									},
								],
							}
						: benchmarkInput(c, output),
					outputSchema: benchmarkVerifierSpec(c).schema,
					systemPrompt:
						benchmarkVerifierSpec(c).systemPrompt +
						(input.focus
							? "\nIndependent assessment: evaluate ONLY identifiers in benchmark-rejudge-scope.requested. Return only those IDs in verdicts, absence, and premises. Do not evaluate other claims. Judge against the CV evidence without guessing any prior judgment. Set unrequested coverage to complete and unrequested retention to null. Quality is advisory. The requested scope overrides the full inventory for this request."
							: ""),
					signal: new AbortController().signal,
				},
				{
					billingPrice: model,
					concurrencyLimit: input.pool?.limit(model) ?? 2,
					onAttempt: async (r) => {
						input.onResult?.(r);
						if (r.failure)
							await options.onAttempt?.({ key, reservedMicros: 0, outcome: r.outcome, failure: r.failure });
					},
				},
			),
		);
	} finally {
		release?.();
	}
	// A campaign stop before transport sends a request incurs no verifier charge.
	if (!cached && requestsSent === 0 && input.stopped?.())
		measured = {
			...measured,
			costMicros: 0,
			openRouterCostMicros: 0,
			openaiCostMicros: 0,
			inputTokens: 0,
			outputTokens: 0,
		};
	// No provider identity means there is no attributable verifier output to audit.
	// Keep unknown billing reserved; an unavailable judge is a session transient.
	let result =
		provider === null && !["ACCOUNT_ERROR", "PAYER_MISMATCH", "REQUEST_SCHEMA_ERROR"].includes(measured.outcome)
			? { ...measured, outcome: "transient" as const }
			: measured;
	if (!cached && !rateLimited) input.cooldown?.record(model, false, result.outcome);
	let normalizationFault: string | null = null;
	if (c.kind === "task" && result.outcome === "valid")
		result = { ...result, output: canonicalVerifierVerdict(result.output) };
	let normalizedVerdict = result.output ?? rawVerdict;
	if (input.focus && result.outcome === "valid") {
		try {
			normalizedVerdict = mergeScopedJudgment(input.initialVerdict, result.output, input.focus);
			result = { ...result, output: normalizedVerdict as Record<string, unknown> };
		} catch {
			normalizationFault = "VERIFIER_MISSING_VOTE_TARGET";
		}
	}
	let accepted = false;
	let taskAssessment: ReturnType<TaskVerifierAdapter["assess"]> | null = null;
	const fault =
		(degenerate ? "VERIFIER_DEGENERATE_OUTPUT" : null) ??
		normalizationFault ??
		(result.outcome === "transient" || result.outcome === "REQUEST_SCHEMA_ERROR"
			? null
			: result.outcome === "truncated"
				? "VERIFIER_TRUNCATED"
				: result.outcome !== "valid"
					? "INVALID_VERIFIER_OUTPUT"
					: verifierAuditFault(c, output, result.output));
	try {
		if (fault || result.outcome === "transient") throw new Error("AI_VERIFIER_UNAVAILABLE");
		if (c.kind === "task") {
			taskAssessment = taskVerifierFor().assess(c, output, result.output ?? {});
			accepted = taskAssessment.accepted;
		} else {
			const { usefulness: _usefulness, ...productionVerdict } = benchmarkVerifierSchema.parse(result.output);
			if (!verifier) throw new Error("VERIFIER_REQUIRED");
			verifier.validate(output, productionVerdict);
			accepted = true;
		}
	} catch {
		/* Fail closed. */
	}
	const parsedQuality = fault || result.outcome !== "valid" ? null : benchmarkVerifierSchema.safeParse(rawVerdict).data;
	const responseAssessment = parsedQuality?.responseAssessment ?? null;
	return {
		qualityAccepted: responseAssessment
			? ["appropriate", "no_change_needed"].includes(responseAssessment.status)
			: null,
		responseAssessment,
		result,
		provider,
		accepted,
		fault,
		verdict: normalizedVerdict,
		rawVerdict,
		latencyMs: cached?.latencyMs ?? performance.now() - start,
		retention:
			fault || result.outcome === "transient"
				? null
				: !hasReviewEdits(output)
					? ("not_applicable" as const)
					: (benchmarkVerifierSchema.safeParse(rawVerdict).data?.factRetention.status ?? null),
		assessment:
			fault || result.outcome === "transient"
				? null
				: (benchmarkVerifierSchema.safeParse(rawVerdict).data?.responseAssessment.status ?? null),
		usefulness:
			fault || result.outcome === "transient"
				? null
				: (benchmarkVerifierSchema.safeParse(rawVerdict).data?.usefulness.status ?? null),
		...taskAssessment,
	};
}

export async function verifyBenchmark(input: Parameters<typeof verifyBenchmarkOnce>[0]) {
	const cachedJudgments = [...(input.cachedJudgments ?? [])];
	const cache = (index: number, suffix = "") =>
		cachedJudgments.findLast(
			(r) => r.status === 200 && r.key === input.parentKey + ":verify" + (index > 1 ? `:judge:${index}` : "") + suffix,
		);
	const judge = async (index: number, focus?: RejectionTarget[], initialVerdict?: unknown) => {
		const attempts: (Awaited<ReturnType<typeof verifyBenchmarkOnce>> & { attemptKey: string; reused: boolean })[] = [];
		let attemptRoute = input.route;
		for (let retry = 0; retry <= MAX_VERIFIER_PROTOCOL_RETRIES; retry++) {
			const suffix = retry ? `:retry:${retry}` : "";
			const previous = attempts.at(-1);
			if (
				previous?.result.outcome === "truncated" &&
				previous.fault !== "VERIFIER_DEGENERATE_OUTPUT" &&
				usesExpandedVerifierBudget(input.route)
			)
				attemptRoute = verifierBudgetRoute(input.route, true);
			const cached = index === 1 && retry === 0 ? (input.cached ?? cache(index)) : cache(index, suffix);
			const bound = verifierBound(input.model, input.c, attemptRoute);
			// Parent holds the initial request plus the legacy expanded retry where applicable.
			if (retry && !cached && (retry > 1 || !verifierBound(input.model, input.c, input.route).retryOutputTokens))
				await input.reserveRetry?.(
					input.model.provider,
					Math.ceil(
						bound.inputTokens * input.model.inputPerMillion +
							completionTokenLimit(attemptRoute) * input.model.outputPerMillion,
					),
				);
			const attempt = await verifyBenchmarkOnce({
				...input,
				judgmentIndex: index > 1 ? index : undefined,
				focus,
				initialVerdict,
				budgetSuffix: suffix,
				route: attemptRoute,
				cached,
			});
			attempts.push({
				...attempt,
				attemptKey: input.parentKey + ":verify" + (index > 1 ? `:judge:${index}` : "") + suffix,
				reused: Boolean(cached),
			});
			if (
				!attempt.fault ||
				["ACCOUNT_ERROR", "PAYER_MISMATCH", "SYSTEMIC_REQUEST_ERROR"].includes(attempt.result.outcome)
			)
				break;
		}
		const selected = required(attempts.at(-1));
		const total = (key: "costMicros" | "openRouterCostMicros" | "openaiCostMicros" | "inputTokens" | "outputTokens") =>
			attempts.some((a) => a.result[key] === null) ? null : attempts.reduce((n, a) => n + (a.result[key] ?? 0), 0);
		return {
			...selected,
			attempts,
			latencyMs: attempts.reduce((n, a) => n + a.latencyMs, 0),
			result: {
				...selected.result,
				costMicros: total("costMicros"),
				openRouterCostMicros: total("openRouterCostMicros"),
				openaiCostMicros: total("openaiCostMicros"),
				inputTokens: total("inputTokens"),
				outputTokens: total("outputTokens"),
			},
			reusedCosts: {
				openRouterMicros: attempts.reduce((n, a) => n + (a.reused ? (a.result.openRouterCostMicros ?? 0) : 0), 0),
				openaiMicros: attempts.reduce((n, a) => n + (a.reused ? (a.result.openaiCostMicros ?? 0) : 0), 0),
			},
		};
	};
	const initial = await judge(1);
	const judgments = [initial];
	const targets =
		input.c.kind === "task" && !initial.fault && initial.result.outcome === "valid"
			? rejectionTargets(initial.verdict)
			: [];
	let vote: ReturnType<typeof voteRejections> | null = null;
	if (targets.length) {
		for (const index of [2, 3]) {
			judgments.push(await judge(index, targets, initial.verdict));
			if (
				judgments.some((j) => ["ACCOUNT_ERROR", "PAYER_MISMATCH", "SYSTEMIC_REQUEST_ERROR"].includes(j.result.outcome))
			)
				break;
			vote = voteRejections(
				initial.verdict,
				judgments.slice(1).map((j) => (j.fault || j.result.outcome !== "valid" ? null : j.verdict)),
			);
			if (vote.complete) break;
		}
	}
	const fault =
		targets.length && !vote?.complete
			? (judgments.find((j) => j.fault)?.fault ?? "VERIFIER_VOTE_UNRESOLVED")
			: initial.fault;
	const finalVerdict = vote?.verdict ?? initial.verdict;
	let assessment: ReturnType<ReturnType<typeof taskVerifierFor>["assess"]> | null = null;
	if (vote?.complete && input.c.kind === "task" && !fault) {
		try {
			assessment = taskVerifierFor().assess(input.c, input.output, finalVerdict as Record<string, unknown>);
		} catch {
			/* Keep the initial rejection when assessment fails. */
		}
	}
	const sum = (key: "costMicros" | "openRouterCostMicros" | "openaiCostMicros" | "inputTokens" | "outputTokens") =>
		judgments.some((j) => j.result[key] === null) ? null : judgments.reduce((n, j) => n + (j.result[key] ?? 0), 0);
	const fatal = judgments.find((j) =>
		["ACCOUNT_ERROR", "PAYER_MISMATCH", "SYSTEMIC_REQUEST_ERROR"].includes(j.result.outcome),
	);
	const result = {
		...(fatal?.result ?? initial.result),
		output: vote?.verdict ?? initial.result.output,
		costMicros: sum("costMicros"),
		openRouterCostMicros: sum("openRouterCostMicros"),
		openaiCostMicros: sum("openaiCostMicros"),
		inputTokens: sum("inputTokens"),
		outputTokens: sum("outputTokens"),
		billingNotes: judgments.flatMap((j) => j.result.billingNotes ?? []),
	};
	return {
		...initial,
		...assessment,
		result,
		verdict: finalVerdict,
		accepted: !fault && !fatal && (assessment?.accepted ?? initial.accepted),
		fault,
		boundedProtocolRetryExhausted: judgments.some(
			(j) => Boolean(fault) && j.attempts.length === MAX_VERIFIER_PROTOCOL_RETRIES + 1 && Boolean(j.fault),
		),
		reusedCosts: {
			openRouterMicros: judgments.reduce((n, j) => n + j.reusedCosts.openRouterMicros, 0),
			openaiMicros: judgments.reduce((n, j) => n + j.reusedCosts.openaiMicros, 0),
		},
		rejectionVote: vote,
		judgments: judgments.map((j, index) => ({
			key: input.parentKey + ":verify" + (index ? `:judge:${index + 1}` : ""),
			attempts: j.attempts.map((attempt) => ({
				key: attempt.attemptKey,
				verdict: attempt.rawVerdict,
				normalizedVerdict: attempt.verdict,
				outcome: attempt.result.outcome,
				fault: attempt.fault,
				costMicros: attempt.result.costMicros,
				openRouterCostMicros: attempt.result.openRouterCostMicros,
				openaiCostMicros: attempt.result.openaiCostMicros,
			})),
			verdict: j.rawVerdict,
			normalizedVerdict: j.verdict,
			accepted: j.accepted,
			fault: j.fault,
			provider: j.provider,
			outcome: j.result.outcome,
			latencyMs: j.latencyMs,
			costMicros: j.result.costMicros,
			openRouterCostMicros: j.result.openRouterCostMicros,
			openaiCostMicros: j.result.openaiCostMicros,
			inputTokens: j.result.inputTokens,
			outputTokens: j.result.outputTokens,
		})),
	};
}
export type VerifierJudgment = Awaited<ReturnType<typeof verifyBenchmark>>["judgments"][number];
