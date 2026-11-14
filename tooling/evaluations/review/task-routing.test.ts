import { createHash } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { loadModels, variantCases, applyReasoning, applyCatalogPrices } from "./config";
import { cases } from "./corpus";
import { selectTaskModels } from "./decision";
import { frozenStudy } from "./freeze";
import { required } from "./required";
import { estimateBenchmark, runBenchmark } from "./runner";
import { assessSmoke, smokeCases, studyHash, recordedControls } from "./study";

const base = required(cases.find((c) => !c.holdout && c.category === "wording"));
const synthetic = ["ar", "en", "mixed"].flatMap((language) =>
	[false, true].flatMap((holdout) =>
		["wording", "extraction", "missing-info", "injection"].map((category) => ({
			...base,
			id: `synthetic-${language}-${holdout}-${category}`,
			language: language as typeof base.language,
			category: category as typeof base.category,
			holdout,
		})),
	),
);
const high = () => required(loadModels().find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "high"));
it("requires a complete hash-bound final control receipt before reusing its verdict", () => {
	const freezeHash = createHash("sha256").update(JSON.stringify(frozenStudy)).digest("hex");
	const all = { checked: 54, pass: true, failures: [], knownLimitations: [], honestFalseRejects: [] };
	expect(recordedControls(() => JSON.stringify({ freezeHash, all }))).toBeNull();
	expect(recordedControls(() => JSON.stringify({ freezeHash: "stale", all: { ...all, checked: 126 } }))).toBeNull();
	expect(recordedControls(() => JSON.stringify({ freezeHash, all: { ...all, checked: 126 } }))?.pass).toBe(true);
});
it("keeps canonical effort constraints and selected scopes through catalog refresh", () => {
	const low = required(loadModels().find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "low"));
	expect(applyReasoning([low], ["high"])[0]).toMatchObject({ reasoning: "high" });
	expect(applyReasoning(loadModels(), ["low"]).find((m) => m.model === low.model)?.categories).toBeUndefined();
	const scoped = { ...low, categories: ["wording"] as const, sets: ["holdout"] as const };
	const [refreshed] = applyCatalogPrices(
		[{ ...scoped, categories: [...scoped.categories], sets: [...scoped.sets] }],
		[{ ...low, inputPerMillion: 2, outputPerMillion: 3 }],
	);
	expect(refreshed).toMatchObject({
		categories: ["wording"],
		sets: ["holdout"],
		inputPerMillion: 2,
		outputPerMillion: 3,
	});
});
it("runs high on the same tasks and partitions as every other variant", async () => {
	const m = high();
	expect(m).toMatchObject({ provider: "openai" });
	expect(variantCases(m, synthetic)).toHaveLength(synthetic.length);
	const run = await runBenchmark({ models: [m], cases: synthetic, runs: 1, fake: true, budgetUsd: 5 });
	expect(run.calls).toHaveLength(synthetic.length);
	expect(new Set(run.calls.map((c) => c.category)).size).toBe(4);
	expect(run.calls.every((c) => c.verifierUsage?.model === "deepseek/deepseek-v4.1-flash-1017")).toBe(true);
	expect(estimateBenchmark([m], synthetic, 3).calls).toBe(synthetic.length * 3);
	expect(studyHash([m], synthetic, 3)).not.toBe(studyHash([{ ...m, sets: ["tuning"] }], synthetic, 3));
});
it("calibrates every category across three languages per restricted variant", async () => {
	const models = loadModels();
	const selected = smokeCases(synthetic, models);
	const run = await runBenchmark({ models, cases: selected, phase: "smoke", runs: 1, fake: true, budgetUsd: 5 });
	expect(run.calls).toHaveLength(models.length * 12);
	const status = assessSmoke(run, models, selected);
	expect(status.every((v) => v.calibration?.samples === 12)).toBe(true);
	expect(variantCases(high(), selected, "smoke").every((c) => !c.holdout)).toBe(true);
});
it("chooses model and effort independently per task and weights chosen costs by cases", () => {
	const common = {
		holdout: true,
		lostFacts: 0,
		requiredFacts: 100,
		missingQuestions: 0,
		questionRequired: 0,
		falseRejects: 0,
		honestOutputs: 20,
		inventedAccepted: 0,
		guardRejections: 0,
		schemaFailures: 0,
		truncations: 0,
		runs: 20,
		emptyAnswers: 0,
		usefulnessMisses: 0,
	};
	const rows = [
		{ ...common, category: "wording", cases: 12, model: "luna", reasoning: "high", costPerSessionUsd: 0.002 },
		{ ...common, category: "wording", cases: 12, model: "terra", reasoning: "low", costPerSessionUsd: 0.009 },
		{
			...common,
			category: "extraction",
			cases: 4,
			model: "luna",
			reasoning: "low",
			costPerSessionUsd: 0.001,
			inventedAccepted: 1,
		},
		{ ...common, category: "extraction", cases: 4, model: "terra", reasoning: "low", costPerSessionUsd: 0.01 },
		{
			...common,
			holdout: false,
			category: "wording",
			cases: 100,
			model: "free",
			reasoning: "low",
			costPerSessionUsd: 0,
		},
	];
	const languageRows = rows.flatMap((r) => ["ar", "en", "mixed"].map((language) => ({ ...r, language })));
	const ratings = languageRows
		.filter((r) => r.holdout)
		.map((r) => ({ ...r, arabic: 4.5, fidelity: 4.5, reviewers: 2, fabricationsPassing: 0 }));
	const d = selectTaskModels(languageRows, ratings, { model: "terra", reasoning: "low" });
	expect(d.tasks).toMatchObject([
		{ category: "wording", model: "luna", reasoning: "high" },
		{ category: "extraction", model: "terra", reasoning: "low" },
	]);
	expect(d.overallCostPerSessionUsd).toBeCloseTo((12 * 0.002 + 4 * 0.01) / 16);
	expect(d.ready).toBe(true);
	const missing = selectTaskModels(
		languageRows,
		ratings.filter((r) => r.category !== "extraction"),
		{ model: "terra", reasoning: "low" },
	);
	expect(missing.ready).toBe(false);
	expect(missing.overallCostPerSessionUsd).toBeNull();
});

it("enables eleven supported variants on identical full-corpus cases and excludes Google by owner decision", () => {
	const models = loadModels();
	expect(models).toHaveLength(11);
	for (const model of models) expect(variantCases(model, synthetic)).toEqual(synthetic);
	expect(models.every((m) => !m.optional)).toBe(true);
});

it("propagates injection fabrication failures across task recommendations", () => {
	const common = {
		holdout: true,
		lostFacts: 0,
		requiredFacts: 10,
		missingQuestions: 0,
		questionRequired: 0,
		falseRejects: 0,
		honestOutputs: 10,
		inventedAccepted: 0,
		guardRejections: 0,
		schemaFailures: 0,
		truncations: 0,
		runs: 10,
		emptyAnswers: 0,
		usefulnessMisses: 0,
		cases: 10,
		costPerSessionUsd: 0.001,
		model: "cheap",
		reasoning: "low",
	};
	const rows = [
		{ ...common, category: "wording" },
		{ ...common, category: "injection", inventedAccepted: 1 },
	];
	const languageRows = rows.flatMap((r) => ["ar", "en", "mixed"].map((language) => ({ ...r, language })));
	const ratings = languageRows.map((r) => ({ ...r, arabic: 4.5, fidelity: 4.5, reviewers: 2, fabricationsPassing: 0 }));
	expect(
		selectTaskModels(languageRows, ratings, { model: "terra", reasoning: "low" }).tasks.every((t) => !t.ready),
	).toBe(true);
});
