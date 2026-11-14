import type { TaskCase } from "./contracts/types";
import type { ModelPayload } from "@reactive-resume/api/features/ai/payload";
import type { z } from "zod";
import { taskContractFor } from "./contracts/runtime";
import { isProductionVariantCase } from "./contracts/runtime";
import { toEvaluation } from "./contracts/types";
import {
	prepareCase as prepareCoreCase,
	goldOutput as coreGoldOutput,
	evaluateOutput as evaluateCoreOutput,
	type BenchmarkCase,
	type Evaluation,
} from "./corpus";
import { buildModelPayload } from "./production";
import { required } from "./required";

export type ExecutionCase = BenchmarkCase | TaskCase;

/** Apply the same contact boundary to contract-built writer and verifier selections. */
export function minimizeTaskPayload(payload: ModelPayload): ModelPayload {
	return buildModelPayload({
		selections: payload.selections.map((s) => ("id" in s ? s : { ...s, confirmed: true })),
		contactValues: [],
	});
}

export function prepareCase(c: ExecutionCase) {
	if (c.kind !== "task") return prepareCoreCase(c);
	const contract = taskContractFor(c);
	const input = contract.buildInput(c);
	const jobSegments = c.jobAd?.segments ?? [];
	if (input.selections.length + jobSegments.length > 50) throw new Error("TASK_SELECTION_LIMIT");
	// Reapply contact minimisation to contract input and job text; keep the two pools distinct.
	const payload = isProductionVariantCase(c)
		? input
		: {
				...minimizeTaskPayload(input),
				jobAd: c.jobAd
					? {
							trust: "untrusted",
							segments: jobSegments.length
								? buildModelPayload({
										selections: jobSegments.map((s) => ({ ...s, section: "summary", kind: "user_supplied" })),
										contactValues: [],
									}).selections.map((s, i) => ({ id: required(jobSegments[i]).id, text: s.text }))
								: [],
						}
					: null,
			};
	return {
		handler: {
			output: contract.outputSchema as z.ZodType<Record<string, unknown>>,
			systemPrompt: contract.systemPrompt,
			promptVersion: contract.promptVersion,
			schemaVersion: contract.schemaVersion,
		},
		payload,
		snapshot: { evidence: c.cv },
	};
}
export function goldOutput(c: ExecutionCase): Record<string, unknown> {
	if (c.kind !== "task") return coreGoldOutput(c);
	const parsed = taskContractFor(c).outputSchema.parse(c.gold);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("TASK_OBJECT_OUTPUT_REQUIRED");
	return structuredClone(parsed) as Record<string, unknown>;
}
export function evaluateOutput(c: ExecutionCase, raw: unknown, verdict: unknown = null): Evaluation {
	if (c.kind !== "task") return evaluateCoreOutput(c, raw);
	const contract = taskContractFor(c);
	const parsed = contract.outputSchema.safeParse(raw);
	if (!parsed.success)
		return toEvaluation({
			caseId: c.id,
			structuralFailure: true,
			safetyDeterministic: { pass: false, reasons: ["AI_INVALID_RESULT"] },
			missingQuestion: c.requiresQuestion,
			emptyAnswer: true,
			quality: { metric: "unparsed", value: null, pass: null },
			lostFacts: [],
			unsupportedClaims: [],
		});
	return {
		...toEvaluation(contract.score(c, parsed.data, verdict)),
		retentionApplicable: contract.verifierContext(c, parsed.data).retention === "applicable",
	};
}

/** Conservative byte-level token upper bound, including JSON and claim overhead, without tokenizer dependencies. */
export function assertTaskGoldFits(c: ExecutionCase, route: { maxOutputTokens: number }): void {
	if (c.kind === "task" && Buffer.byteLength(JSON.stringify(goldOutput(c)), "utf8") > route.maxOutputTokens / 2)
		throw new Error("TASK_GOLD_OUTPUT_LIMIT");
}
