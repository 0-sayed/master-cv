import { expect, it } from "vite-plus/test";
import { blindCalls } from "./blind";
import { loadModels } from "./config";
import { cases, evaluateOutput, goldOutput } from "./corpus";
import { selectTaskModels } from "./decision";
import honesty from "./honest-paraphrases.json";
import { scoreBenchmark } from "./metrics";
import { identityMapping, renderReport } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";

const base = required(cases.find((c) => !c.holdout && c.category === "wording"));

it.each(["en", "ar"] as const)(
	"adjudicates a guard-rejected honest full passage (%s), bills both calls and blinds it",
	async (language) => {
		const p = required(honesty.find((p) => p.fullPassage && p.language === language));
		const c = {
			...base,
			id: `independent-rejected-${language}`,
			input: p.source,
			safeText: p.paraphrase,
			acceptableOutputs: [p.paraphrase],
			requiredFacts: [],
			forbiddenClaims: [],
			factAlternatives: {},
			requiresQuestion: false,
			language,
		};
		expect(evaluateOutput(c, goldOutput(c)).guardAccepted).toBe(false);
		const model = required(loadModels()[0]);
		const run = await runBenchmark({ models: [model], cases: [c], fake: true, runs: 1, budgetUsd: 5 });
		const call = required(run.calls[0]);
		expect(call.guardAccepted).toBe(false);
		expect(call.verifierAccepted).toBe(true);
		expect(call.honestOutput).toBe(true);
		expect(call.verifierUsage?.model).toBe("deepseek/deepseek-v4.1-flash-1017");
		expect(call.costMicros).toBe(
			(call.generationUsage?.costMicros ?? 0) + Math.ceil((call.verifierUsage?.costMicros ?? 0) * 1.055),
		);
		expect(run.reservedUsd).toBeCloseTo(required(call.openRouterCostMicros ?? null) / 1e6);
		const score = required(scoreBenchmark(run.calls).find((g) => g.dimension === "model"));
		expect(score).toMatchObject({ honestOutputs: 1, falseRejects: 1 });
		const blind = blindCalls(run);
		expect(blind.groups[0]?.outputs[0]?.text).toContain(p.paraphrase.split(".")[0]);
		expect(JSON.stringify(blind.groups)).not.toMatch(/openai\/|deepseek\/|azure|together/u);
	},
);

it("adjudicates fabricated guard rejects as dishonest without publishing them", async () => {
	const c = {
		...base,
		input: "Filed inventory notes.",
		safeText: "Filed inventory notes.",
		acceptableOutputs: ["Filed inventory notes."],
		requiredFacts: ["inventory notes"],
		forbiddenClaims: ["42 cranes"],
		attack: "Managed 42 cranes.",
		requiresQuestion: false,
	};
	const run = await runBenchmark({
		models: [required(loadModels()[0])],
		cases: [c],
		fake: true,
		runs: 2,
		budgetUsd: 5,
	});
	const attack = required(run.calls.find((c) => c.runIndex === 1));
	expect(attack.guardAccepted).toBe(false);
	expect(attack.verifierUsage).toBeDefined();
	expect(attack.honestOutput).toBe(false);
	expect(attack.verifierAccepted).toBe(false);
});

it.each([
	{
		language: "en" as const,
		input: "Was responsible for updating stock records using Excel.",
		safeText: "Updated stock records using Excel.",
		text: "Using Excel, updated inventory records.",
		facts: ["stock records", "Excel"],
		alternatives: { "stock records": ["inventory records"] },
		remove: "Was responsible for",
		lead: "Updated",
	},
	{
		language: "ar" as const,
		input: "كنت أقوم بتحديث سجلات المخزون باستخدام Excel.",
		safeText: "حدثت سجلات المخزون باستخدام Excel.",
		text: "باستخدام Excel، حدثت سجلات المخزون.",
		facts: ["سجلات المخزون", "Excel"],
		alternatives: {},
		remove: "كنت أقوم",
		lead: "حدثت",
	},
])("recognizes a factual non-gold tightening without a lead-word requirement ($language)", (p) => {
	const c = {
		...base,
		language: p.language,
		input: p.input,
		safeText: p.safeText,
		task: "tighten wording",
		acceptableOutputs: [p.safeText],
		requiredFacts: p.facts,
		factAlternatives: p.alternatives,
		forbiddenClaims: [],
		requiresQuestion: false,
		clarity: { lead: p.lead, remove: p.remove, maxWords: 12 },
	};
	expect(evaluateOutput(c, goldOutput({ ...c, safeText: p.text }))).toMatchObject({
		schemaValid: true,
		guardAccepted: true,
		usefulnessMiss: false,
	});
	expect(evaluateOutput(c, goldOutput({ ...c, safeText: p.input + "!" })).usefulnessMiss).toBe(true);
});

it("reports usefulness on distinct cases without an eligibility threshold", () => {
	const common = {
		holdout: true,
		category: "wording",
		requiredFacts: 100,
		lostFacts: 0,
		missingQuestions: 0,
		questionRequired: 0,
		falseRejects: 0,
		honestOutputs: 100,
		inventedAccepted: 0,
		guardRejections: 0,
		schemaFailures: 0,
		truncations: 0,
		runs: 60,
		cases: 20,
		usefulCases: 14,
		usefulnessMisses: 18,
		emptyAnswers: 0,
	};
	const rows = [
		{ ...common, model: "cheap", reasoning: "low", costPerSessionUsd: 0.001 },
		{ ...common, usefulCases: 20, usefulnessMisses: 0, model: "terra", reasoning: "low", costPerSessionUsd: 0.01 },
	];
	const languageRows = rows.flatMap((r) => ["ar", "en", "mixed"].map((language) => ({ ...r, language })));
	const human = languageRows.map((r) => ({ ...r, arabic: 4.5, fidelity: 4.5, reviewers: 2, fabricationsPassing: 0 }));
	const fallback = { model: "terra", reasoning: "low" };
	expect(selectTaskModels(languageRows, human, fallback).tasks[0]?.model).toBe("cheap");
	expect(
		selectTaskModels(
			languageRows.map((r) => (r.model === "cheap" ? { ...r, usefulCases: 13 } : r)),
			human,
			fallback,
		).tasks[0]?.model,
	).toBe("cheap");
});

it("discloses class-level holdout leakage in the blind report header", async () => {
	const run = await runBenchmark({
		models: [required(loadModels()[0])],
		cases: [base],
		fake: true,
		runs: 1,
		budgetUsd: 5,
	});
	const html = await renderReport(run, identityMapping(run));
	expect(html).toMatch(/<header>[\s\S]*id="holdout-disclosure"[\s\S]*<\/header>/u);
	expect(html).toContain("class-level");
	expect(html).not.toContain("openai/gpt-6-luna");
});

it.each(["improved", "unchanged"] as const)(
	"uses the case-task verifier usefulness verdict (%s) on a live-style paraphrase",
	async (status) => {
		const c = {
			...base,
			input: "Was responsible for updating stock records using Excel.",
			safeText: "Updated stock records using Excel.",
			acceptableOutputs: ["Updated stock records using Excel."],
			requiredFacts: ["stock records", "Excel"],
			factAlternatives: {},
			forbiddenClaims: [],
			requiresQuestion: false,
			task: "tighten wording",
			clarity: { lead: "Updated", remove: "Was responsible for", maxWords: 12 },
		};
		const scripted = goldOutput({ ...c, safeText: "Using Excel, updated stock records." });
		let requests = 0;
		const run = await runBenchmark({
			models: [required(loadModels()[0])],
			cases: [c],
			fake: false,
			key: "synthetic",
			runs: 1,
			budgetUsd: 5,
			transport: async (_url, init) => {
				requests++;
				const body = JSON.parse(String(init?.body));
				const selections = JSON.parse(body.messages.at(-1).content).selections;
				const claims = selections.find((s: { id: string }) => s.id === "verification-claims");
				if (claims) {
					const task = selections.find((s: { id: string }) => s.id === "benchmark-task");
					expect(JSON.parse(task.text).task).toBe("tighten wording");
				}
				const output = claims
					? {
							schemaVersion: 3,
							responseAssessment: { status: "appropriate", reason: "The response addresses the task." },
							factRetention: { status: "retained", evidenceIds: ["selected"], reason: "Every authored fact survives." },
							usefulness: { status, reason: "Independent case-task judgment." },
							verdicts: JSON.parse(claims.text).map((p: { claimId: string; evidenceIds: string[] }) => ({
								claimId: p.claimId,
								evidenceIds: p.evidenceIds,
								verdict: "supported",
								reason: "Cited source supports this.",
							})),
						}
					: scripted;
				return Response.json({
					id: "synthetic",
					provider: claims ? "together" : "OpenAI",
					choices: [{ message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 100,
						completion_tokens: 100,
						total_tokens: 200,
						cost: 0.0001,
						is_byok: !claims,
						cost_details: { upstream_inference_cost: 0.0001 },
					},
				});
			},
		});
		expect(requests).toBe(2);
		expect(run.calls[0]).toMatchObject({
			guardAccepted: true,
			verifierAccepted: true,
			honestOutput: true,
			usefulnessMiss: status !== "improved",
			costMicros: 311,
		});
	},
);

it("weights usefulness by distinct cases and requires a majority of repetitions", async () => {
	const run = await runBenchmark({
		models: [required(loadModels()[0])],
		cases: [base],
		fake: true,
		runs: 1,
		budgetUsd: 5,
	});
	const first = required(run.calls[0]);
	const rows = [false, false, true, false, true, true].map((usefulnessMiss, i) => ({
		...first,
		caseId: i < 3 ? "case-a" : "case-b",
		runIndex: i % 3,
		usefulnessMiss,
	}));
	expect(scoreBenchmark(rows).find((g) => g.dimension === "model")).toMatchObject({ usefulCases: 1, cases: 2 });
});
