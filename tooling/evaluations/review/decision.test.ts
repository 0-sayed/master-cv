import { expect, it } from "vite-plus/test";
import { selectModel } from "./decision";
import { required } from "./required";
it("chooses cheapest safety-qualified model with Arabic fidelity advisory", () => {
	const rows = [
		{
			holdout: true,
			lostFacts: 0,
			requiredFacts: 100,
			missingQuestions: 0,
			questionRequired: 100,
			falseRejects: 0,
			honestOutputs: 100,
			model: "cheap",
			reasoning: "none",
			inventedAccepted: 0,
			guardRejections: 1,
			schemaFailures: 0,
			truncations: 0,
			runs: 100,
			costPerSessionUsd: 0.001,
			emptyAnswers: 0,
			usefulnessMisses: 0,
		},
		{
			holdout: true,
			lostFacts: 0,
			requiredFacts: 100,
			missingQuestions: 0,
			questionRequired: 100,
			falseRejects: 0,
			honestOutputs: 100,
			model: "openai/gpt-6.1-terra",
			reasoning: "low",
			inventedAccepted: 0,
			guardRejections: 0,
			schemaFailures: 0,
			truncations: 0,
			runs: 100,
			costPerSessionUsd: 0.01,
			emptyAnswers: 0,
			usefulnessMisses: 0,
		},
	];
	const human = [
		{ model: "cheap", reasoning: "none", arabic: 4.3, fidelity: 4.3, fabricationsPassing: 0, reviewers: 2 },
		{
			model: "openai/gpt-6.1-terra",
			reasoning: "low",
			arabic: 4.5,
			fidelity: 4.5,
			fabricationsPassing: 0,
			reviewers: 2,
		},
	];
	expect(selectModel(rows, human)).toMatchObject({ model: "cheap", reasoning: "none" });
	expect(selectModel(rows, human)).toMatchObject({ withinNoise: true });
	expect(selectModel([{ ...required(rows[0]), inventedAccepted: 1 }, required(rows[1])], human).model).toBe(
		"openai/gpt-6.1-terra",
	);
	expect(selectModel(rows, [{ ...required(human[0]), arabic: 4, fidelity: 4 }, required(human[1])]).model).toBe(
		"cheap",
	);
	expect(selectModel(rows, []).ready).toBe(false);
	expect(
		selectModel(
			rows,
			human.map((h) => ({ ...h, reviewers: 1 })),
		).ready,
	).toBe(false);
	expect(
		selectModel(
			[{ ...required(rows[0]), schemaFailures: 1, truncations: 1, schemaOrTruncations: 1 }, required(rows[1])],
			human,
		).model,
	).toBe("cheap");
});

it("blocks unqualified references and reports best quality separately from cheapest within noise", () => {
	const base = {
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
		usefulCases: 7,
	};
	const rows = [
		{ ...base, model: "cheap", reasoning: "low", costPerSessionUsd: 0.001 },
		{ ...base, model: "quality", reasoning: "high", costPerSessionUsd: 0.01 },
	];
	const human = [
		{ model: "cheap", reasoning: "low", arabic: 4.3, fidelity: 4.3, reviewers: 2, fabricationsPassing: 0 },
		{ model: "quality", reasoning: "high", arabic: 4.5, fidelity: 4.5, reviewers: 2, fabricationsPassing: 0 },
	];
	expect(selectModel(rows, human)).toMatchObject({
		model: "cheap",
		ready: true,
		quality: 4.3,
		bestQuality: { model: "quality", reasoning: "high", quality: 4.5, costPer1000Usd: 10 },
	});
	expect(
		selectModel(
			rows.map((r) => ({ ...r, inventedAccepted: 1 })),
			human,
		),
	).toMatchObject({ ready: false });
	expect(
		selectModel(
			rows.map((r) => ({ ...r, usefulCases: 6 })),
			human,
		),
	).toMatchObject({ ready: true });
});
