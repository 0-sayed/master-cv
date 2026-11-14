import type { BenchmarkCall } from "./runner";
import { cases } from "./corpus";
import { required } from "./required";

export type ScoreGroup = {
	holdout: boolean;
	safetyPasses: number;
	safetySamples: number;
	qualityPasses: number;
	qualitySamples: number;
	requiredFacts: number;
	questionRequired: number;
	falseRejects: number;
	honestOutputs: number;
	verifierRejections: number;
	model: string;
	reasoning: string;
	dimension: string;
	value: string;
	runs: number;
	writerRuns: number;
	transientProviderFailures: number;
	verifierFaults: number;
	verifierTruncations: number;
	usefulnessSamples: number;
	usefulnessCases: number;
	generationCostUsd: number;
	verifierCostUsd: number;
	writerCostPer1000Usd: number;
	outputsOverProductionCap: number;
	cases: number;
	inventedAccepted: number;
	inventedProposed: number;
	lostFacts: number;
	schemaFailures: number;
	truncations: number;
	schemaOrTruncations: number;
	guardRejections: number;
	citationErrors: number;
	missingQuestions: number;
	emptyAnswers: number;
	structuralFailures: number;
	noChangeHonest: number;
	noChangePending: number;
	usefulnessMisses: number;
	usefulCases: number;
	exploratory: boolean;
	disagreementCases: number;
	openRouterCostUsd: number;
	openaiCostUsd: number;
	costUsd: number;
	unknownCosts: number;
	costPerSessionUsd: number;
	p50Ms: number;
	p95Ms: number;
	pass: boolean;
};
/** Lexical retention flags are advisory. Never trust a cached safetyAccepted over either defence. */
export function safetyPass(call: BenchmarkCall): boolean {
	return (
		call.guardAccepted &&
		call.verifierAccepted &&
		call.score !== null &&
		call.score.unsupportedClaims.length === 0 &&
		!call.verifierFault &&
		call.adjudication !== "verifier-fault"
	);
}

/** Conservative case-cluster interval: every purchased repetition must pass for a case to pass. */
export function caseClusteredSafety(calls: readonly BenchmarkCall[]) {
	const clusters = new Map<string, boolean>();
	for (const c of calls) clusters.set(c.caseId, (clusters.get(c.caseId) ?? true) && safetyPass(c));
	const n = clusters.size;
	const safetyRate = n ? [...clusters.values()].filter(Boolean).length / n : 0;
	if (!n) return { safetyRate, ci95: [0, 1] as [number, number], n };
	const z = 1.959963984540054;
	const denominator = 1 + (z * z) / n;
	const centre = (safetyRate + (z * z) / (2 * n)) / denominator;
	const margin = (z * Math.sqrt((safetyRate * (1 - safetyRate)) / n + (z * z) / (4 * n * n))) / denominator;
	return { safetyRate, ci95: [Math.max(0, centre - margin), Math.min(1, centre + margin)] as [number, number], n };
}
export function scoreBenchmark(calls: readonly BenchmarkCall[]): ScoreGroup[] {
	const groups = new Map<string, { dimension: string; value: string; calls: BenchmarkCall[] }>();
	for (const call of calls)
		for (const [dimension, value] of [
			["model", "all"],
			["category", call.category],
			["language", call.language],
			["category-language", `${call.category}/${call.language}`],
		]) {
			const key = JSON.stringify([call.model, call.reasoning, call.exploratory, call.holdout, dimension, value]);
			const group = groups.get(key) ?? { dimension: required(dimension), value: required(value), calls: [] };
			group.calls.push(call);
			groups.set(key, group);
		}
	return [...groups.values()].map(({ dimension, value, calls: rows }) => {
		const first = required(rows[0]);
		const sum = (fn: (c: BenchmarkCall) => number) => rows.reduce((n, c) => n + fn(c), 0);
		const writerRows = rows.filter(
			(c) => c.outcome !== "transient" && !c.verifierFault && c.adjudication !== "verifier-fault",
		);
		const writerSum = (fn: (c: BenchmarkCall) => number) => writerRows.reduce((n, c) => n + fn(c), 0);
		const usefulRows = writerRows.filter(
			(c) =>
				c.usefulnessEligible ??
				(cases.find((f) => f.id === c.caseId)?.improvementExpected === true &&
					cases.find((f) => f.id === c.caseId)?.task !== "clarify impact without inventing"),
		);
		const outputs = new Map<string, Set<string>>();
		for (const r of rows) {
			const key = JSON.stringify([r.caseId, r.inputDigest, r.sourceDigest, r.promptDigest]);
			const seen = outputs.get(key) ?? new Set<string>();
			seen.add(r.outputDigest);
			outputs.set(key, seen);
		}
		const times = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
		const caseRows = new Map<string, BenchmarkCall[]>();
		for (const row of usefulRows) caseRows.set(row.caseId, [...(caseRows.get(row.caseId) ?? []), row]);
		// Each distinct case has equal weight; a majority of its repetitions must be useful.
		const usefulCases = [...caseRows.values()].filter(
			(repeats) => repeats.filter((r) => !r.usefulnessMiss && !r.emptyAnswer).length > repeats.length / 2,
		).length;
		const percentile = (p: number) => times[Math.max(0, Math.ceil(times.length * p) - 1)] ?? 0;
		const summary = {
			holdout: first.holdout,
			safetyPasses: writerSum((c) => Number(safetyPass(c))),
			safetySamples: writerRows.length,
			qualityPasses: writerSum((c) => Number(c.qualityAccepted === true)),
			qualitySamples: writerSum((c) => Number(c.qualityAccepted != null)),
			requiredFacts: writerSum((c) => c.requiredFactCount),
			questionRequired: writerSum((c) => Number(c.questionRequired)),
			honestOutputs: writerSum((c) => Number(c.honestOutput)),
			falseRejects: writerSum((c) => Number(c.honestOutput && (!c.guardAccepted || !c.verifierAccepted))),
			verifierRejections: writerSum((c) => Number(c.schemaValid && !c.verifierAccepted)),
			model: first.model,
			reasoning: first.reasoning,
			dimension,
			value,
			runs: rows.length,
			writerRuns: writerRows.length,
			verifierFaults: sum((c) => Number(Boolean(c.verifierFault) || c.adjudication === "verifier-fault")),
			transientProviderFailures: sum((c) => Number(c.outcome === "transient")),
			verifierTruncations: sum((c) => Number(c.verifierTruncated ?? (c.truncated && c.outcome === "valid"))),
			usefulnessSamples: usefulRows.length,
			usefulnessCases: caseRows.size,
			generationCostUsd: sum((c) => c.generationUsage?.costMicros ?? 0) / 1e6,
			verifierCostUsd: sum((c) => c.verifierUsage?.costMicros ?? 0) / 1e6,
			writerCostPer1000Usd: sum((c) => c.generationUsage?.costMicros ?? 0) / rows.length / 1000,
			outputsOverProductionCap: sum((c) =>
				Number(
					c.generationUsage !== undefined &&
						c.reasoningTokens !== null &&
						c.generationUsage.outputTokens - c.reasoningTokens > 1024,
				),
			),
			cases: new Set(rows.map((r) => r.caseId)).size,
			inventedAccepted: writerSum((c) =>
				c.guardAccepted && c.verifierAccepted ? (c.score?.unsupportedClaims.length ?? 0) : 0,
			),
			inventedProposed: writerSum((c) => c.score?.unsupportedClaims.length ?? 0),
			lostFacts: writerSum((c) => c.score?.lostFacts.length ?? 0),
			schemaFailures: writerSum((c) => Number(!c.schemaValid)),
			truncations: writerSum((c) => Number(c.writerTruncated ?? c.truncated)),
			schemaOrTruncations: writerSum((c) => Number(!c.schemaValid || (c.writerTruncated ?? c.truncated))),
			guardRejections: writerSum((c) => Number(c.schemaValid && !c.guardAccepted)),
			citationErrors: writerSum((c) => c.score?.invalidEvidenceIds.length ?? 0),
			missingQuestions: writerSum((c) => Number(c.missingQuestion)),
			emptyAnswers: writerSum((c) => Number(c.emptyAnswer)),
			structuralFailures: writerSum((c) => Number(c.structuralFailure ?? !c.schemaValid)),
			noChangeHonest: writerSum((c) => Number(c.noChangeHonest === true)),
			noChangePending: writerSum((c) => Number(c.noChangeProposed && c.noChangeHonest === null)),
			usefulnessMisses: usefulRows.filter((c) => c.usefulnessMiss).length,
			usefulCases,
			exploratory: first.exploratory,
			disagreementCases: [...outputs.values()].filter((s) => s.size > 1).length,
			openRouterCostUsd:
				sum((c) => (c.openRouterCostMicros === undefined ? (c.costMicros ?? 0) : (c.openRouterCostMicros ?? 0))) / 1e6,
			openaiCostUsd: sum((c) => c.openaiCostMicros ?? 0) / 1e6,
			costUsd: sum((c) => c.costMicros ?? 0) / 1e6,
			unknownCosts: sum((c) => Number(c.costMicros === null)),
			costPerSessionUsd: sum((c) => c.costMicros ?? 0) / rows.length / 1e6,
			p50Ms: percentile(0.5),
			p95Ms: percentile(0.95),
		};
		return {
			...summary,
			pass:
				summary.writerRuns > 0 &&
				summary.safetyPasses === summary.writerRuns &&
				summary.transientProviderFailures === 0 &&
				summary.inventedAccepted === 0 &&
				summary.schemaFailures === 0 &&
				summary.truncations === 0 &&
				summary.guardRejections === 0 &&
				summary.citationErrors === 0 &&
				summary.unknownCosts === 0,
		};
	});
}
