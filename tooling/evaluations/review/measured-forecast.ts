import type { ModelConfig } from "./config";
import type { ExecutionCase } from "./execution";
import { z } from "zod";
import { variantCases } from "./config";
import { goldOutput, prepareCase } from "./execution";
import baseline from "./measured-baseline.json";
import rejudging from "./rejudging-baseline.json";
import judgeCosts from "./verifier-cost-baseline.json";

export function estimatedWriterInputTokens(prepared: Pick<ReturnType<typeof prepareCase>, "handler" | "payload">) {
	const wire = {
		system: prepared.handler.systemPrompt,
		payload: prepared.payload,
		schema: z.toJSONSchema(prepared.handler.output, { unrepresentable: "any" }),
	};
	return Math.ceil(Buffer.byteLength(JSON.stringify(wire)) / 3);
}

/** Historical measured costs are expectations, never request reservation limits. */
export function measuredForecast(models: ModelConfig[], cases: ExecutionCase[], runs: number, stage: "smoke" | "full") {
	let writerMicros = 0;
	let verifierMicros = 0;
	let sessions = 0;
	let extraJudgeCalls = 0;
	let wallTimeMs = 0;
	let writerWallTimeMs = 0;
	let verifierWallTimeMs = 0;
	for (const model of models) {
		const measured = baseline.models.find((m) => m.model === model.model && m.reasoning === model.reasoning);
		if (!measured) throw new Error("MEASURED_BASELINE_MISSING");
		for (const c of variantCases(model, cases, stage)) {
			const group = rejudging.groups.find(
				(g) => g.model === model.model && g.reasoning === model.reasoning && g.category === c.category,
			);
			if (!group) throw new Error("REJUDGING_BASELINE_MISSING");
			const extra = 2 * group.rejectionRate;
			const judge = judgeCosts.categories[c.category as keyof typeof judgeCosts.categories];
			if (!judge) throw new Error("VERIFIER_COST_BASELINE_MISSING");
			extraJudgeCalls += runs * extra;
			writerWallTimeMs += runs * Math.max(0, group.meanSessionLatencyMs - group.meanVerifierLatencyMs);
			verifierWallTimeMs += runs * (1 + extra) * judge.meanLatencyMs * judge.requestsPerLogicalJudgment;
			wallTimeMs +=
				runs *
				(Math.max(0, group.meanSessionLatencyMs - group.meanVerifierLatencyMs) +
					(1 + extra) * judge.meanLatencyMs * judge.requestsPerLogicalJudgment);
			const inputTokens = estimatedWriterInputTokens(prepareCase(c));
			const verifierInput = inputTokens + Math.ceil(Buffer.byteLength(JSON.stringify(goldOutput(c))) / 3);
			writerMicros +=
				runs *
				(measured.writerMicros +
					Math.max(0, inputTokens - measured.writerInputTokens) * measured.writerInputPerMillion);
			verifierMicros +=
				runs *
				(1 + extra) *
				judge.requestsPerLogicalJudgment *
				(judge.meanRequestMicros +
					Math.max(0, verifierInput - judge.meanInputTokens) * baseline.verifierInputPerMillion);
			sessions += runs;
		}
	}
	const canaryProbes = stage === "smoke" ? 72 : 0;
	const canaryJudgments = canaryProbes ? judgeCosts.canaryLogicalJudgments : 0;
	const canaryMicros =
		canaryJudgments * judgeCosts.overall.meanRequestMicros * judgeCosts.overall.requestsPerLogicalJudgment;
	const canaryWallTimeMs =
		canaryJudgments * judgeCosts.overall.meanLatencyMs * judgeCosts.overall.requestsPerLogicalJudgment;
	wallTimeMs += canaryWallTimeMs;
	const parallelWallTimeMs =
		(canaryWallTimeMs / 8 +
			Math.max(writerWallTimeMs / 8, verifierWallTimeMs / 8, (writerWallTimeMs + verifierWallTimeMs) / 16)) /
			0.8 +
		(stage === "smoke" ? 2 : 1) * 180000;
	return {
		sessions,
		canaryProbes,
		canaryJudgments,
		extraJudgeCalls,
		expectedJudgeCalls: sessions + extraJudgeCalls + canaryJudgments,
		sequentialWallTimeHours: wallTimeMs / 3_600_000,
		parallelWallTimeHours: parallelWallTimeMs / 3_600_000,
		parallelism: {
			sessions: 16,
			openai: 8,
			together: 8,
			canaries: 8,
			initialProviderSlots: 2,
			assumedUtilization: 0.8,
			rampAllowanceMinutesPerPhase: 3,
		},
		openRouterUsd: (verifierMicros + canaryMicros) / 1e6,
		openaiUsd: writerMicros / 1e6,
		canaryOpenRouterUsd: canaryMicros / 1e6,
		byokFeeAllowance: "Provider usage.cost only; no credit-purchase surcharge or reservation is recorded as spend",
		basis:
			"Paid 20261117T050828Z request costs and latencies; bounded protocol retry expectation 1+p+p² from observed call faults; canary early-majority estimate; conservative writer repeat allowance. Historical 54-session writer costs. Fresh smoke calibrates full.",
		verifierSourceSha256: judgeCosts.callsSha256,
		sourceSha256: baseline.sourceSha256,
	};
}
