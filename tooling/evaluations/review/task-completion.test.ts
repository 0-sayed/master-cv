import type { BenchmarkArtifact, BenchmarkCall } from "./runner";
import { expect, it } from "vite-plus/test";
import {
	completionKeys,
	mergeCompletion,
	rateTranslations,
	estimateCompletion,
	translationSeed,
} from "./task-completion";

const call = (key: string, patch: Partial<BenchmarkCall> = {}) =>
	({
		key,
		id: key,
		category: "translation",
		model: "openai/gpt-6-luna",
		provider: "openai",
		reasoning: "low",
		caseId: key,
		runIndex: 0,
		outputDigest: `digest-${key}`,
		fixtureHash: "fixture",
		promptDigest: "prompt",
		inputDigest: "input",
		sourceDigest: "source",
		outcome: "valid",
		costMicros: 20,
		openRouterCostMicros: 15,
		openaiCostMicros: 5,
		generationUsage: { costMicros: 5 },
		latencyMs: 1000,
		...patch,
	}) as BenchmarkCall;
const artifact = (calls: BenchmarkCall[], incomplete: BenchmarkArtifact["incomplete"] = []) =>
	({ calls, incomplete, mode: "live", stopReason: null, modelStops: [] }) as unknown as BenchmarkArtifact;

it("selects the exact unfinished translation slots instead of all transient or rejected answers", () => {
	const a = call("one", { outcome: "transient", costMicros: null });
	const b = call("two", { guardAccepted: false });
	expect(
		completionKeys(
			artifact(
				[a, b],
				[{ model: a.model, provider: a.provider, reasoning: a.reasoning, caseId: a.caseId, runIndex: 0 }],
			),
		),
	).toEqual(["one"]);
	expect(() => completionKeys(artifact([a, a], []))).toThrow("DUPLICATE");
});
it("merges only the authorized completion slots and retains every other writer and call", () => {
	const a = call("one", { costMicros: null });
	const b = call("two");
	const source = artifact(
		[a, b],
		[{ model: a.model, provider: a.provider, reasoning: a.reasoning, caseId: a.caseId, runIndex: 0 }],
	);
	const completed = call("one", { costMicros: 30 });
	const merged = mergeCompletion(
		source,
		artifact([completed, b]),
		artifact([call("letter", { category: "cover-letter" })]),
	);
	expect(merged.map((c) => c.key).sort()).toEqual(["letter", "one", "two"]);
	expect(merged.find((c) => c.key === "two")).toBe(b);
	expect(() => mergeCompletion(source, artifact([call("one", { outputDigest: "changed" }), b]), artifact([]))).toThrow(
		"WRITER_CHANGED",
	);
	expect(() => mergeCompletion(source, artifact([completed, call("two", { costMicros: 99 })]), artifact([]))).toThrow(
		"FINISHED_CALL_CHANGED",
	);
	expect(() => mergeCompletion(source, artifact([completed, b]), { ...artifact([]), mode: "fake" })).toThrow(
		"LIVE_EVIDENCE_REQUIRED",
	);
	expect(
		mergeCompletion(source, { ...artifact([completed, b]), mode: "fake" }, { ...artifact([]), mode: "fake" }, true),
	).toHaveLength(2);
	expect(() => mergeCompletion(source, artifact([completed, completed, b]), artifact([]))).toThrow(
		"DUPLICATE_COMPLETION_KEY",
	);
});

it("keeps unfinished billing history separate while holding its unknown exposure", () => {
	const a = call("held", { costMicros: null, unknownExposureMicros: 90_000, reservedOpenRouterMicros: 600_000 });
	const b = call("done");
	const seed = translationSeed(
		artifact([a, b], [{ model: a.model, provider: a.provider, reasoning: a.reasoning, caseId: a.caseId, runIndex: 0 }]),
	);
	expect(seed.previousCalls).toEqual([b]);
	expect(seed.heldExposureMicros).toBe(90_000);
	expect(a.costMicros).toBeNull();
});
it("requires two complete, independent AI ratings and validates target offsets", () => {
	const packet = {
		version: 1,
		outputs: [
			{
				id: "blind-1",
				key: "secret",
				writerDigest: "d",
				requiresArabic: true,
				segments: [{ sourceId: "s", text: "مرحبا" }],
			},
		],
	};
	const vote = {
		outputId: "blind-1",
		fidelity: 5,
		naturalness: 4,
		arabic: 4,
		unsupportedFact: false,
		notes: "Reviewed.",
		mqm: [],
	};
	const pass = (n: number) => ({
		version: 1,
		reviewKind: "ai",
		model: "gpt-6-astra",
		reviewer: `Astra pass ${n}`,
		sessionId: `independent-${n}`,
		ratings: [vote],
	});
	expect(rateTranslations(packet, [pass(1), pass(2)]).get("secret")?.quality).toBe(0);
	expect(() => rateTranslations(packet, [pass(1)])).toThrow("TWO_INDEPENDENT");
	expect(() => rateTranslations(packet, [pass(1), pass(1)])).toThrow("TWO_INDEPENDENT");
	expect(() => rateTranslations(packet, [pass(1), { ...pass(2), ratings: [] }])).toThrow("INCOMPLETE_RATINGS");
	expect(() =>
		rateTranslations(packet, [
			pass(1),
			{
				...pass(2),
				ratings: [{ ...vote, mqm: [{ sourceId: "s", start: 0, end: 99, severity: "major", category: "fluency" }] }],
			},
		]),
	).toThrow("INVALID_MQM");
	expect(() =>
		rateTranslations(packet, [pass(1), { ...pass(2), ratings: [{ ...vote, unsupportedFact: null }] }]),
	).toThrow("INVALID_RATING");
	const scripted = [1, 2].map((n) => ({ ...pass(n), reviewKind: "fixture", model: "scripted" }));
	expect(() => rateTranslations(packet, scripted)).toThrow("REAL_ASTRA_RATINGS_REQUIRED");
	expect(rateTranslations(packet, scripted, true).size).toBe(1);
});
it("forecasts only new verifier expense for cached translation writers, and scales cover-letter smoke per cell", () => {
	const translation = estimateCompletion([call("t")], 11, true);
	expect(translation.openaiUsd).toBe(0);
	expect(translation.openRouterUsd).toBeCloseTo(0.000165);
	const letters = estimateCompletion([call("l")], 324, false);
	expect(letters.openaiUsd).toBeCloseTo(0.00162);
	expect(letters.openRouterUsd).toBeCloseTo(0.00486);
});
