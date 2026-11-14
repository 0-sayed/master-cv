import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { loadModels, variantCases } from "./config";
import { cases, evaluateOutput, goldOutput } from "./corpus";
import { selectTaskModels } from "./decision";
import { scoreBenchmark } from "./metrics";
import equivalents from "./question-equivalences.json";
import { required } from "./required";
import { runBenchmark } from "./runner";

it("separates structural failure, empty output and a reasoned no-edit response", () => {
	const c = required(cases.find((c) => c.category === "wording"));
	expect(evaluateOutput(c, { wrong: true })).toMatchObject({
		structuralFailure: true,
		emptyAnswer: false,
		retentionApplicable: false,
	});
	expect(evaluateOutput(c, { proposals: [], questions: [], notes: [] })).toMatchObject({
		structuralFailure: false,
		emptyAnswer: true,
	});
	const noEdit = evaluateOutput(c, { proposals: [], questions: [], notes: ["The selected tense is already correct."] });
	expect(noEdit).toMatchObject({
		emptyAnswer: false,
		noChangeProposed: true,
		noChangeHonest: null,
		retentionApplicable: false,
	});
	expect(noEdit.score?.lostFacts).toEqual([]);
});
it("does not score retention for null extraction candidates", () => {
	const c = required(cases.find((c) => c.kind === "extraction"));
	const output = goldOutput(c);
	output.candidates = z
		.array(z.record(z.string(), z.unknown()))
		.parse(output.candidates)
		.map((candidate) => ({ ...candidate, value: null }));
	expect(evaluateOutput(c, output)).toMatchObject({ retentionApplicable: false, score: { lostFacts: [] } });
});

it.each([
	["r2-h01-missing-info", "كم تقرير خرسانة راجعت؟"],
	["r2-h01-missing-info", "كم عدد تقارير الخرسانة التي راجعتها؟"],
	["r2-h05-missing-info", "What was the store count?"],
	["r2-t08-missing-info", "How many service requests did you handle per week?"],
	["r2-h01-missing-info", "ما عدد تقارير الخرسانة التي كنت تراجعها؟ لم يرد هذا الرقم في النص، لذا لن أخمّنه."],
	["r2-h05-missing-info", "The source does not state the store count. What was the store count, if known?"],
	["r2-h06-missing-info", "The equipment type is not specified. What type of equipment were the logs for?"],
	["r2-h06-missing-info", "What equipment type should be listed (or should it be omitted)?"],
	["r2-h08-missing-info", "What was the workshop capacity (a supplied figure or stated as not recorded)?"],
	["r2-h12-missing-info", "What is the work periodicity?"],
	["r2-h12-missing-info", "ما دورية العمل (دوام كامل أو جزئي أو غير ذلك)؟"],
	["r2-t05-missing-info", "ما دورية الجرد (يومية أو أسبوعية أو غير ذلك)؟"],
	["r2-t05-missing-info", "ما دورية الجرد لدى مؤسسة سلم التجريبية؟"],
])("accepts reviewed question equivalents for %s", (id, prompt) => {
	const c = required(cases.find((c) => c.id === id));
	const out = goldOutput(c);
	out.questions = [{ id: "q", passageId: "selected", prompt, evidenceIds: ["selected"] }];
	expect(evaluateOutput(c, out).missingQuestion).toBe(false);
});

it.each([
	"Hello?",
	"What is your volume?",
	"Do you like stores?",
	"What was the store address?",
	"How many reports?",
	"How many requests did you NOT handle?",
	"The request volume is not stated. What was your supervisor's name?",
])("rejects generic, wrong-topic or polarity-flipped question %s", (prompt) => {
	const c = required(cases.find((c) => c.id === "r2-t08-missing-info"));
	const out = goldOutput(c);
	out.questions = [{ id: "q", passageId: "selected", prompt, evidenceIds: ["selected"] }];
	expect(evaluateOutput(c, out).missingQuestion).toBe(true);
});

const base = {
	holdout: true,
	lostFacts: 0,
	requiredFacts: 10,
	missingQuestions: 0,
	questionRequired: 10,
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
};
const fallback = { model: "quality", reasoning: "low" };
const languages = ["ar", "en", "mixed"] as const;
const rows = languages.flatMap((language) => [
	{
		...base,
		category: "missing-info",
		language,
		requiredFacts: 0,
		model: "cheap",
		reasoning: "low",
		costPerSessionUsd: 0.001,
	},
	{
		...base,
		category: "missing-info",
		language,
		requiredFacts: 0,
		model: "quality",
		reasoning: "low",
		costPerSessionUsd: 0.01,
	},
]);
const ratings = rows.map((r) => ({
	...r,
	arabic: r.language === "en" ? null : 4.5,
	fidelity: 4.5,
	reviewers: 2,
	fabricationsPassing: 0,
}));
it("qualifies correct missing-info without a retention denominator, separately in all languages", () => {
	expect(selectTaskModels(rows, ratings, fallback)).toMatchObject({ ready: true, tasks: [{ model: "cheap" }] });
});
it("cannot average away a language safety failure; quality gaps stay advisory", () => {
	expect(
		selectTaskModels(
			rows.map((r) => (r.model === "cheap" && r.language === "en" ? { ...r, inventedAccepted: 1 } : r)),
			ratings,
			fallback,
		),
	).toMatchObject({ tasks: [{ model: "quality" }] });
	expect(
		selectTaskModels(
			rows,
			ratings.map((r) => (r.model === "cheap" && r.language === "en" ? { ...r, fidelity: 4.1 } : r)),
			fallback,
		),
	).toMatchObject({ tasks: [{ model: "cheap" }] });
});
it("blocks incomplete language evidence", () => {
	expect(
		selectTaskModels(
			rows.filter((r) => r.language !== "mixed"),
			ratings,
			fallback,
		).ready,
	).toBe(false);
});
it("smokes all four categories in AR EN mixed for every variant", () => {
	for (const model of loadModels()) {
		const smoke = variantCases(model, cases, "smoke");
		expect(smoke).toHaveLength(12);
		expect(new Set(smoke.map((c) => `${c.category}/${c.language}`)).size).toBe(12);
	}
});

it("passes every authored equivalence control and rejects its nearby wrong question", () => {
	for (const control of equivalents.controls) {
		const c = required(cases.find((c) => c.requiresQuestion && c.questionTargets.includes(control.target)));
		for (const [prompt, missing] of [
			[control.positive, false],
			[control.negative, true],
		] as const) {
			const out = goldOutput(c);
			out.questions = [{ id: "q", passageId: "selected", prompt, evidenceIds: ["selected"] }];
			expect(evaluateOutput(c, out).missingQuestion, `${control.target}: ${prompt}`).toBe(missing);
		}
	}
});

it("scores an independently justified no-change without fact loss or usefulness penalty", async () => {
	const c = required(cases.find((c) => c.id === "r2-h01-wording"));
	const model = required(loadModels()[0]);
	const result = await runBenchmark({
		models: [model],
		cases: [c],
		runs: 1,
		fake: false,
		key: "synthetic",
		budgetUsd: 5,
		transport: async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			const verifying = JSON.parse(body.messages.at(-1).content).selections.some(
				(s: { id: string }) => s.id === "verification-response",
			);
			return Response.json({
				id: "scripted",
				provider: verifying ? "together" : "OpenAI",
				choices: [
					{
						message: {
							role: "assistant",
							content: JSON.stringify(
								verifying
									? {
											schemaVersion: 3,
											responseAssessment: { status: "no_change_needed", reason: "The source already uses past tense." },
											factRetention: { status: "not_applicable", evidenceIds: [], reason: "No edit." },
											verdicts: [],
											usefulness: { status: "not_applicable", reason: "No tense change is warranted." },
										}
									: { proposals: [], questions: [], notes: ["The source already uses past tense."] },
							),
						},
						finish_reason: "stop",
					},
				],
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
	expect(result.calls[0]).toMatchObject({
		noChangeHonest: true,
		emptyAnswer: false,
		requiredFactCount: 0,
		usefulnessEligible: false,
		usefulnessMiss: false,
		verifierAccepted: true,
	});
	expect(scoreBenchmark(result.calls)[0]).toMatchObject({
		lostFacts: 0,
		usefulnessSamples: 0,
		noChangeHonest: 1,
		emptyAnswers: 0,
	});
});
