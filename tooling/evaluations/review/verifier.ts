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
import { captureResponse } from "./attempt";
import {
	taskContractFor,
	taskVerifierFor as scopedTaskVerifierFor,
	type TaskVerifierAdapter,
} from "./contracts/runtime";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { isRateLimited, type ProviderCooldown } from "./cooldown";
import { prepareCase as prepareCoreCase } from "./corpus";
import { prepareCase, goldOutput, evaluateOutput, minimizeTaskPayload, type ExecutionCase } from "./execution";
import { fakeCost } from "./production";
import { executeApprovedStep, withAiRuntime, completionTokenLimit, type ApprovedRoute } from "./production";

const benchmarkVerifierSchema = reviewVerifierSchema.extend({
	usefulness: z.strictObject({
		status: z.enum(["improved", "unchanged", "unclear", "not_applicable"]),
		reason: z.string().trim().min(1).max(600),
	}),
});
const benchmarkPrompt = readFileSync(new URL("./benchmark-verifier.md", import.meta.url), "utf8");
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
		if (!adapter.schema.safeParse(raw).success) return "INVALID_VERIFIER_OUTPUT";
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
	if (c.kind === "task") return minimizeTaskPayload(taskVerifierFor().buildInput(c, output));
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
		micros: Math.ceil(inputTokens * model.inputPerMillion + outputTokens * model.outputPerMillion),
	};
}

export async function verifyBenchmark(input: {
	options: RunOptions;
	cooldown?: ProviderCooldown;
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
}) {
	const { options, model, c, route, output, parentKey, runIndex, promptHash, fixtureHash, cached } = input;
	const verifier = c.kind === "task" ? null : prepareCoreCase(c).handler.verifier;
	if (c.kind !== "task" && !verifier) throw new Error("VERIFIER_REQUIRED");
	const key = parentKey + ":verify";
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
	let rateLimited = false;
	let provider: string | null = null;
	let rawVerdict: unknown = null;
	const start = performance.now();
	const transport: typeof fetch = async (url, init) => {
		const body = JSON.parse(String(init?.body));
		body.provider.max_price = { prompt: model.inputPerMillion, completion: model.outputPerMillion };
		if (!cached && input.stopped?.()) throw new Error("BENCHMARK_STOPPED");
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
											message: { role: "assistant", content: JSON.stringify(verdict) },
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
					? options.fakeTransport(target, request, next, { key: parentKey, role: "verifier", model, route })
					: next();
			},
			url,
			{ ...init, body: JSON.stringify(body) },
			!cached && (!options.fake || Boolean(options.fakeTransport)),
		);
		const received = await response.text();
		if (Buffer.byteLength(received) > 1048576) throw new Error("AI_RESPONSE_LIMIT");
		const raw = options.key ? received.replaceAll(options.key, "[REDACTED]") : received;
		rateLimited = isRateLimited(response.status, raw);
		if (!cached && rateLimited) input.cooldown?.record(model, true, "transient");
		input.pool?.observe(model, rateLimited, response.ok && !rateLimited);
		if (!cached)
			await options.onRaw?.({
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
			rawVerdict = JSON.parse(data.choices?.[0]?.message?.content ?? "null");
		} catch {
			/* Strict adapter rejects malformed output. */
		}
		return new Response(raw, { status: response.status, headers: response.headers });
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
					payload: benchmarkInput(c, output),
					outputSchema: benchmarkVerifierSpec(c).schema,
					systemPrompt: benchmarkVerifierSpec(c).systemPrompt,
					signal: new AbortController().signal,
				},
				{
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
	// No provider identity means there is no attributable verifier output to audit.
	// Keep unknown billing reserved; an unavailable judge is a session transient.
	const result =
		provider === null && !["ACCOUNT_ERROR", "PAYER_MISMATCH", "REQUEST_SCHEMA_ERROR"].includes(measured.outcome)
			? { ...measured, outcome: "transient" as const }
			: measured;
	if (!cached && !rateLimited) input.cooldown?.record(model, false, result.outcome);
	let accepted = false;
	let taskAssessment: ReturnType<TaskVerifierAdapter["assess"]> | null = null;
	const fault =
		result.outcome === "transient" || result.outcome === "REQUEST_SCHEMA_ERROR"
			? null
			: result.outcome === "truncated"
				? "VERIFIER_TRUNCATED"
				: result.outcome !== "valid"
					? "INVALID_VERIFIER_OUTPUT"
					: verifierAuditFault(c, output, result.output);
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
		verdict: rawVerdict,
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
