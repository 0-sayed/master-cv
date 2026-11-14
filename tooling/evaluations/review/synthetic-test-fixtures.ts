import type { ModelConfig } from "./config";
import type { BenchmarkArtifact, BenchmarkCall, RawRecord } from "./runner";
import { createHash } from "node:crypto";
import { loadModels } from "./config";
import { cases, evaluateOutput } from "./corpus";
import regressions from "./lexical-lost-fact-regressions.json";
import { repairSource } from "./repair";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { vertexFixture } from "./vertex-test-fixture";

/** Synthetic accounting inputs, never calibration or evidence of a provider call. */
export async function syntheticUsageFixture(): Promise<BenchmarkArtifact> {
	const models = loadModels().filter((m) => (m.provider === "openai" ? m.reasoning === "high" : m.reasoning === "low"));
	const run = await runBenchmark({
		models,
		cases: [required(cases.find((c) => c.id === "r2-t01-wording"))],
		runs: 3,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
	});
	return {
		...run,
		id: "synthetic-usage",
		mode: "live",
		calls: run.calls.map((call) => ({
			...call,
			provider: call.provider === "openai" ? "azure" : call.provider,
			generationUsage: { inputTokens: 796, outputTokens: 430, costMicros: 1043 },
			verifierUsage: {
				model: call.model.startsWith("openai/") ? "deepseek/deepseek-v4.1-flash-1017" : "openai/gpt-6-luna",
				provider: call.model.startsWith("openai/") ? "together" : "openai",
				reasoning: "low",
				inputTokens: 200,
				outputTokens: 100,
				costMicros: 250,
			},
		})),
	};
}

/** Explicitly obsolete synthetic identities exercise repairs without the pinned paid journal. */
export async function syntheticRepairFixture() {
	const models: ModelConfig[] = [...loadModels(), vertexFixture];
	const rawRecords: RawRecord[] = [];
	const artifact = await runBenchmark({
		models,
		cases: [
			...new Map(
				[
					...cases.filter((c) =>
						["r2-h01-wording", "r2-h01-extraction", "r2-h02-extraction", "r2-h03-extraction"].includes(c.id),
					),
					...cases.filter((c) => c.category === "extraction").slice(0, 7),
				].map((c) => [c.id, c]),
			).values(),
		],
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		onRaw: (raw) => {
			rawRecords.push(raw);
			return Promise.resolve();
		},
	});
	const previousCalls: BenchmarkCall[] = artifact.calls.map((call) => ({
		...call,
		key: `legacy-${call.key}`,
		promptDigest: "synthetic-obsolete-prompt",
		...(call.provider === "openai" && call.caseId === "r2-h01-extraction" ? { outcome: "unsupported" } : {}),
	}));
	const history = {
		previousCalls,
		rawRecords: rawRecords.map((raw) => ({
			...raw,
			key: `legacy-${raw.key}`,
			promptHash: "synthetic-obsolete-prompt",
		})),
		pendingReservations: [],
		unsettledRetryReservations: [],
		billingSettlements: [],
		attempts: [],
	};
	const manifest = {
		hash: repairSource.studyHash,
		models,
		runs: 1,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		priorSpendMicros: 0,
		priorOpenaiSpendMicros: 0,
		calibration: [],
	};
	return { manifest, history };
}

export async function syntheticLexicalFixture(): Promise<BenchmarkArtifact> {
	const run = await runBenchmark({
		models: [required(loadModels()[0])],
		cases: cases.filter((c) => regressions.some((r) => r.caseId === c.id)),
		runs: 1,
		fake: true,
		budgetUsd: 100,
	});
	return {
		...run,
		calls: regressions.map((r) => {
			const call = required(run.calls.find((c) => c.caseId === r.caseId));
			const evaluation = evaluateOutput(required(cases.find((c) => c.id === r.caseId)), r.output);
			return {
				...call,
				...evaluation,
				key: r.key,
				output: JSON.stringify(r.output),
				outputDigest: createHash("sha256").update(JSON.stringify(r.output)).digest("hex"),
				factRetention: r.verifierRetention as "retained" | "lost",
				lexicalLostFacts: [r.fact],
				score: { ...required(evaluation.score), lostFacts: [r.fact] },
			};
		}),
	};
}

export async function syntheticJournalFixture() {
	const events: string[] = [];
	await runBenchmark({
		models: [required(loadModels()[0])],
		cases: cases.filter((c) => ["r2-t01-wording", "r2-h01-extraction"].includes(c.id)),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		onRaw: (data) => {
			events.push(JSON.stringify({ type: "raw", data }));
			return Promise.resolve();
		},
		onCall: (data) => {
			events.push(JSON.stringify({ type: "scored", data }));
			return Promise.resolve();
		},
	});
	return events.join("\n") + "\n";
}
