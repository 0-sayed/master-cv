import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { required } from "./required";
import { runBenchmark, estimateBenchmark } from "./runner";
import { scoreReviewCase } from "./score";
import { controls } from "./study";
import { validateSmoke, smokeCases } from "./study";
it("requires the requested factual order change instead of accepting copied bullets", () => {
	const c = {
		...required(cases.find((c) => !c.holdout && c.kind === "wording" && !c.requiresQuestion)),
		task: "reorder bullets",
		input: "Filed dispatch receipts. Checked inventory notes.",
		safeText: "Checked inventory notes. Filed dispatch receipts.",
		acceptableOutputs: ["Checked inventory notes. Filed dispatch receipts."],
		requiredFacts: ["dispatch receipts", "inventory notes"],
		clarity: { lead: "Filed", remove: "not-present", maxWords: 20 },
		forbiddenClaims: [],
	};
	expect(evaluateOutput(c, goldOutput({ ...c, safeText: c.input })).usefulnessMiss).toBe(true);
	expect(evaluateOutput(c, goldOutput(c)).usefulnessMiss).toBe(false);
});
it.each(["lost", "not_applicable"])(
	"rejects %s retention for benchmark edits even when authored fact tokens survive",
	async (retention) => {
		const model = required(loadModels()[0]);
		const c = required(cases.find((c) => !c.holdout && c.kind === "wording" && !c.requiresQuestion));
		const a = await runBenchmark({
			models: [model],
			cases: [c],
			runs: 1,
			fake: false,
			key: "synthetic",
			budgetUsd: 5,
			transport: async (_url, init) => {
				const b = JSON.parse(String(init?.body));
				const claims = JSON.parse(b.messages.at(-1).content).selections.find(
					(s: { id: string }) => s.id === "verification-claims",
				);
				const output = claims
					? {
							schemaVersion: 3,
							responseAssessment: { status: "appropriate", reason: "The response addresses the task." },
							usefulness: { status: "improved", reason: "Independent synthetic task judgment." },
							factRetention: {
								status: retention,
								evidenceIds: ["selected"],
								reason: "The source contains an omitted career detail.",
							},
							verdicts: JSON.parse(claims.text).map((p: { claimId: string; evidenceIds: string[] }) => ({
								...p,
								verdict: "supported",
								reason: "Supported claim.",
							})),
						}
					: goldOutput(c);
				if (claims)
					for (const v of output.verdicts) {
						delete v.text;
						delete v.claimKinds;
					}
				return Response.json({
					id: "synthetic",
					provider: claims ? "together" : "OpenAI",
					choices: [{ message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 100,
						completion_tokens: 100,
						total_tokens: 200,
						cost: 0.0001,
						cost_details: { upstream_inference_cost: 0.0001 },
					},
				});
			},
		});
		expect(a.calls[0]?.honestOutput).toBe(false);
		expect(a.calls[0]?.verifierAccepted).toBe(false);
		if (retention === "lost") expect(a.calls[0]?.score?.lostFacts.length).toBeGreaterThan(0);
	},
);
it("never calibrates a generation-only smoke as a verified pair", async () => {
	const models = loadModels().slice(0, 1);
	const corpus = smokeCases(cases, models);
	const a = await runBenchmark({ phase: "smoke", models, cases: corpus, runs: 1, fake: true, budgetUsd: 5 });
	const broken = { ...a, calls: a.calls.map(({ verifierUsage: _usage, ...c }) => c) };
	expect(() => validateSmoke(broken, models, corpus)).toThrow("SMOKE_VARIANT_FAILED");
});
it("retains a provable remaining-cap check even with small calibrated reservations", async () => {
	const models = loadModels().slice(0, 1);
	const c = required(smokeCases(cases)[0]);
	const calibration = [
		{
			model: required(models[0]).model,
			provider: required(models[0]).provider,
			reasoning: required(models[0]).reasoning,
			inputTokens: 100,
			outputTokens: 100,
			samples: 3,
			pairCostMicros: 1,
		},
	];
	const a = await runBenchmark({ models, cases: [c], runs: 1, fake: true, budgetUsd: 0.001, calibration });
	expect(a.calls).toHaveLength(0);
	expect(a.stopReason).toBe("BUDGET_LIMIT");
});
it("preserves planned case order and reserves a calibrated pair with margin", async () => {
	const models = loadModels().slice(0, 1);
	const smoke = await runBenchmark({
		phase: "smoke",
		models,
		cases: smokeCases(cases, models),
		runs: 1,
		fake: true,
		budgetUsd: 5,
	});
	const calibration = validateSmoke(smoke, models, smokeCases(cases, models));
	const tuning = required(cases.find((c) => !c.holdout && !c.requiresQuestion && c.kind === "wording"));
	const holdout = { ...tuning, id: "fresh-order-control", holdout: true };
	const result = await runBenchmark({
		models,
		cases: [tuning, holdout],
		runs: 1,
		fake: true,
		budgetUsd: 5,
		calibration,
	});
	expect(result.calls[0]?.holdout).toBe(false);
	expect(result.stopReason).toBeNull();
	expect(result.calls[0]?.reservedMicros).toBeLessThan(required(smoke.calls[0]).reservedMicros);
	expect(estimateBenchmark(models, [tuning], 1, calibration).upperBoundUsd).toBeLessThan(
		estimateBenchmark(models, [tuning], 1).upperBoundUsd,
	);
});

it("controls reject labelled attacks that the real guard accepts", () => {
	const c = {
		...required(cases.find((c) => !c.holdout && c.kind === "wording" && !c.requiresQuestion)),
		input: "Filed inventory notes.",
		safeText: "Organized inventory notes.",
		acceptableOutputs: ["Organized inventory notes."],
		requiredFacts: ["inventory notes"],
		attack: "Shared inventory notes.",
		forbiddenClaims: ["Shared inventory notes."],
		clarity: { lead: "Organized", remove: "Filed", maxWords: 10 },
	};
	expect(controls([c])).toMatchObject({ pass: false, failures: [expect.objectContaining({ control: "attack" })] });
});
it("controls reject unsupported gold even when labels and usefulness accept it", () => {
	const c = {
		...required(cases.find((c) => !c.holdout && c.kind === "wording" && !c.requiresQuestion)),
		input: "Prepared diagrams.",
		safeText: "Prepared 34 diagrams.",
		acceptableOutputs: ["Prepared 34 diagrams."],
		requiredFacts: ["diagrams"],
		attack: null,
		forbiddenClaims: [],
		clarity: { lead: "Prepared", remove: "unused", maxWords: 10 },
	};
	expect(controls([c])).toMatchObject({ pass: false, failures: [expect.objectContaining({ control: "gold" })] });
});
it("scores fact tokens rather than substrings and accepts authored semantic alternatives", () => {
	const c = required(cases.find((c) => !c.holdout && c.kind === "wording" && !c.requiresQuestion));
	const { evaluateOutput, goldOutput } = requireCorpus();
	const result = required(evaluateOutput(c, goldOutput(c)).result);
	if (result.kind !== "wording") throw new Error("fixture");
	const proposal = required(result.proposals[0]);
	proposal.after = "Maintained ٤ devices and validated entries.";
	const base = {
		id: "tokens",
		language: "en" as const,
		input: "",
		sources: [],
		supportedClaims: [],
		forbiddenClaims: [],
		requiredFacts: ["4 devices", "checked entries"],
		factAlternatives: { "checked entries": ["validated entries"] },
		unknownFields: [],
		citations: [],
	};
	expect(scoreReviewCase(base, result).lostFacts).toEqual([]);
	proposal.after = "Maintained ٤ devices and unvalidated entries.";
	expect(scoreReviewCase(base, result).lostFacts).toContain("checked entries");
});

// Static import keeps this test on the same real schema/materialization path.
import { evaluateOutput, goldOutput } from "./corpus";
function requireCorpus() {
	return { evaluateOutput, goldOutput };
}
