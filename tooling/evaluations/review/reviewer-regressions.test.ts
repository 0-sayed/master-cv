import type { ApprovedRoute } from "./production";
import { expect, it } from "vite-plus/test";
import { blindCalls, humanScores, decisionHumanScores, type BlindGroup } from "./blind";
import { loadModels } from "./config";
import { cases, goldOutput } from "./corpus";
import { runBenchmark } from "./runner";
import { verifierBound } from "./verifier";
const route: ApprovedRoute = {
	routeId: "test",
	routeRevision: "1",
	configRevision: "1",
	endpoint: "https://openrouter.ai/api/v1",
	model: "synthetic/model",
	downstreamProvider: "azure",
	apiKey: "synthetic",
	noticeVersion: "test",
	evidenceVersion: "test",
	maxCalls: 2,
	maxRepairs: 0,
	callTimeoutMs: 30000,
	deadlineMs: 60000,
	maxInputCodePoints: 32000,
	maxOutputTokens: 1024,
	requestCapMicros: 1000000,
	maxCallCostMicros: 1000000,
	dayCapMicros: 1000000,
};

it("counts fabrication using each output's defence outcome", () => {
	const identities = {
		first: { model: "m", reasoning: "low", defenceAccepted: false },
		second: { model: "m", reasoning: "low", defenceAccepted: true },
	};
	const votes = [
		{ outputId: "first", reviewer: "one", arabic: 5, fidelity: 5, naturalness: 5, notes: "" },
		{ outputId: "second", reviewer: "one", arabic: 1, fidelity: 1, naturalness: 1, notes: "" },
	];
	expect(humanScores(votes, identities)[0]?.fabricationsPassing).toBe(1);
});
it("an explicitly unsupported fact disqualifies even a generally usable output", () => {
	const scores = humanScores(
		[
			{
				outputId: "output",
				reviewer: "one",
				arabic: 3,
				fidelity: 3,
				naturalness: 4,
				notes: "One unsupported achievement",
				unsupportedFact: true,
			},
		],
		{ output: { model: "m", reasoning: "low", defenceAccepted: true } },
	);
	expect(scores[0]?.fabricationsPassing).toBe(1);
});

it("English fidelity cannot raise the Arabic holdout fidelity score", () => {
	const group: BlindGroup = {
		id: "ar",
		caseId: "tuning-only",
		language: "ar",
		category: "wording",
		runIndex: 0,
		input: "",
		intent: "",
		outputs: [{ id: "ar", label: "A", text: "" }],
		holdout: true,
		exploratory: false,
		repeat: false,
	};
	const en = { ...group, id: "en", language: "en", outputs: [{ id: "en", label: "A", text: "" }] };
	const identities = { ar: { model: "model", reasoning: "low" }, en: { model: "model", reasoning: "low" } };
	const ratings = [
		{ outputId: "ar", reviewer: "one", arabic: 2, fidelity: 2, naturalness: 2, notes: "" },
		{ outputId: "en", reviewer: "one", arabic: null, fidelity: 5, naturalness: 5, notes: "" },
	];
	expect(decisionHumanScores([group, en], ratings, identities)[0]?.fidelity).toBe(2);
});

it("labels an honest accepted wording independently of provider IDs and explanation", async () => {
	const c = cases.find((c) => !c.holdout && c.category === "wording");
	if (!c) throw new Error("case");
	const scripted = goldOutput(c);
	const proposal = (scripted.proposals as { id: string; reason: string }[])[0];
	if (!proposal) throw new Error("proposal");
	proposal.id = "provider-generated-id";
	proposal.reason = "A shorter action-led sentence.";
	const a = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: [c],
		runs: 1,
		budgetUsd: 5,
		fake: false,
		key: "synthetic",
		transport: (_url, init) => {
			const body = JSON.parse(String(init?.body));
			const selections = JSON.parse(body.messages.at(-1).content).selections;
			const claims = selections.find((s: { id: string }) => s.id === "verification-claims");
			expect(body.max_tokens ?? body.max_completion_tokens).toBe(claims ? 5120 : 2560);
			if (claims) {
				const task = selections.find((s: { id: string }) => s.id === "benchmark-task");
				expect(JSON.parse(task.text)).not.toHaveProperty("redundantPhrase");
			}

			const output = claims
				? {
						schemaVersion: 3,
						responseAssessment: { status: "appropriate", reason: "The response addresses the task." },
						usefulness: { status: "improved", reason: "Independent synthetic task judgment." },
						factRetention: { status: "retained", evidenceIds: ["selected"], reason: "Synthetic retention verdict." },
						verdicts: JSON.parse(claims.text).map((c: object) => ({
							...c,
							text: undefined,
							claimKinds: undefined,
							verdict: "supported",
							reason: "Confirmed",
						})),
					}
				: scripted;
			return Promise.resolve(
				Response.json({
					id: "response",
					provider: claims ? "together" : "OpenAI",
					choices: [
						{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" },
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 10,
						cost: 0.00001,
						cost_details: { upstream_inference_cost: 0.00001 },
					},
				}),
			);
		},
	});
	expect(a.calls[0]?.honestOutput).toBe(true);
});
it("reserves verifier input for the full allowed payload, not just gold claim length", () => {
	const model = loadModels()[0];
	const c = cases[0];
	if (!model || !c) throw new Error("case");
	expect(verifierBound(model, c, route).inputTokens).toBeGreaterThanOrEqual(4 * route.maxInputCodePoints);
});
it("retains each model's defence outcome when identical text is collapsed", async () => {
	const a = await runBenchmark({
		models: loadModels(undefined, ["openai/gpt-6-luna"]).slice(0, 2),
		cases: cases.slice(0, 1),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	a.calls = a.calls.map((c, i) => ({ ...c, guardAccepted: true, verifierAccepted: i === 1 }));
	const { groups, identities } = blindCalls(a);
	const output = groups.find((g) => !g.repeat)?.outputs[0];
	if (!output) throw new Error("output");
	const scores = humanScores(
		[
			{
				outputId: output.id,
				reviewer: "one",
				arabic: 1,
				fidelity: 1,
				naturalness: 1,
				notes: "Unsupported factual assertion",
			},
		],
		identities,
	);
	expect(scores.find((s) => s.reasoning === "low")?.fabricationsPassing).toBe(0);
	expect(scores.find((s) => s.reasoning === "medium")?.fabricationsPassing).toBe(1);
});
