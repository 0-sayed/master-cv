import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases, evaluateOutput, goldOutput } from "./corpus";
import { selectModel } from "./decision";
import { renderReport, identityMapping } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";

it("uses disjoint passages and four holdout cases per category and language", () => {
	expect(cases.length).toBeGreaterThanOrEqual(70);
	expect(cases.length).toBeLessThanOrEqual(90);
	const passages = new Map(cases.map((c) => [c.passageId, c]));
	expect(passages.size).toBeGreaterThanOrEqual(24);
	expect(new Set([...passages.values()].map((c) => c.sector)).size).toBe(12);
	expect([...passages.values()].filter((c) => c.holdout).length / passages.size).toBeGreaterThanOrEqual(0.25);
	for (const c of cases) {
		expect(c.exploratory).toBe(false);
		expect(c.acceptableOutputs.length).toBeGreaterThan(0);
		expect(cases.filter((r) => r.passageId === c.passageId).every((r) => r.holdout === c.holdout)).toBe(true);
	}
	for (const category of ["wording", "extraction", "missing-info", "injection"])
		for (const language of ["ar", "en", "mixed"])
			expect(
				cases.filter((c) => c.holdout && c.category === category && c.language === language).length,
			).toBeGreaterThanOrEqual(4);
});
it("rejects copying, punctuation, generic questions and injection obedience", () => {
	for (const c of cases.filter((c) => !c.holdout && c.kind === "wording")) {
		if (c.requiresQuestion) {
			const out = goldOutput(c);
			out.questions = [{ id: "q", passageId: "selected", prompt: "Hello?", evidenceIds: ["selected"] }];
			expect(evaluateOutput(c, out).missingQuestion, c.id).toBe(true);
		} else {
			for (const safeText of [c.input, c.input + "!"])
				expect(evaluateOutput(c, goldOutput({ ...c, safeText })).usefulnessMiss, c.id).toBe(true);
			if (c.attack)
				expect(
					evaluateOutput(c, goldOutput({ ...c, safeText: c.attack })).score?.unsupportedClaims.length,
					c.id,
				).toBeGreaterThan(0);
		}
	}
});
it("uses holdout-only safety thresholds and keeps question quality advisory", () => {
	const row = {
		model: "cheap",
		reasoning: "none",
		inventedAccepted: 0,
		guardRejections: 0,
		schemaFailures: 0,
		truncations: 0,
		runs: 100,
		costPerSessionUsd: 0.001,
		emptyAnswers: 0,
		usefulnessMisses: 0,
		holdout: true,
		lostFacts: 0,
		requiredFacts: 100,
		missingQuestions: 0,
		questionRequired: 100,
		falseRejects: 0,
		honestOutputs: 100,
	};
	const human = [
		{ model: "cheap", reasoning: "none", arabic: 4.4, fidelity: 4.5, reviewers: 2, fabricationsPassing: 0 },
	];
	expect(selectModel([row], human).model).toBe("cheap");
	expect(selectModel([{ ...row, missingQuestions: 6 }], human).model).toBe("cheap");
	expect(selectModel([{ ...row, lostFacts: 2 }], human).model).toBe("cheap");
	for (const change of [{ falseRejects: 11 }, { holdout: false }])
		expect(selectModel([{ ...row, ...change }], human).model).toBe("openai/gpt-6.1-terra");
});
it("rating HTML contains no model identities, including its source", async () => {
	const a = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	const html = await renderReport(a);
	for (const model of loadModels()) expect(html).not.toContain(model.model);
	expect(html).toContain(
		"Luna/Terra measured via OpenAI first-party (BYOK) for the benchmark; production routes via Azure ZDR; quality same model, latency may differ",
	);
	expect(
		html.replace(
			"Luna/Terra measured via OpenAI first-party (BYOK) for the benchmark; production routes via Azure ZDR; quality same model, latency may differ.",
			"",
		),
	).not.toMatch(/\b(?:Terra|Luna|DeepSeek|Azure|Together)\b/iu);
	expect(html).not.toContain('"identities":{');
});
it("reuses one blind assignment for HTML and its private identity mapping", async () => {
	const a = await runBenchmark({
		models: loadModels().slice(0, 2),
		cases: cases.slice(0, 2),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	const mapping = identityMapping(a);
	const html = await renderReport(a, mapping);
	const publicData = JSON.parse(required(html.match(/id="report-data">(.*?)<\/script>/su)?.[1]));
	expect(publicData.groups).toEqual(mapping.groups);
	for (const group of publicData.groups)
		for (const output of group.outputs) expect(mapping.identities[output.id]).toBeDefined();
});
