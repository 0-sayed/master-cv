import { expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { assessSmoke, smokeCases, validateSmoke } from "./study";

const model = required(loadModels().find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "low"));
const options = { models: [model], runs: 1, fake: true, budgetUsd: 9, openaiBudgetUsd: 40 };
it("keeps an entirely malformed writer variant as data without inventing measured calibration", async () => {
	const selected = smokeCases(cases, [model]);
	const result = await runBenchmark({ ...options, cases: selected, phase: "smoke" });
	for (const call of result.calls)
		Object.assign(call, { outcome: "invalid", schemaValid: false, verifierUsage: undefined });
	expect(validateSmoke(result, [model], selected)).toEqual([]);
	expect(assessSmoke(result, [model], selected)[0]).toMatchObject({
		status: "accepted",
		calibration: null,
		writerErrors: { schema: selected.length },
	});
});
it("counts unknown writer citations as writer failures without dispatching an impossible judge input", async () => {
	vi.useFakeTimers();
	let judges = 0;
	const selected = smokeCases(cases, [model]);
	const pending = runBenchmark({
		...options,
		cases: selected,
		phase: "smoke",
		fakeTransport: async (_url, _init, next, context) => {
			const data = await (await next()).json();
			if (context.role === "verifier") judges++;
			else {
				const output = JSON.parse(data.choices[0].message.content);
				output.questions.push({
					id: "bad",
					passageId: null,
					prompt: "What was your role?",
					evidenceIds: ["unknown-source"],
				});
				data.choices[0].message.content = JSON.stringify(output);
			}
			return Response.json(data);
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	vi.useRealTimers();
	expect(judges).toBe(0);
	expect(result.calls.every((c) => !c.verifierFault && c.safetyAccepted === false)).toBe(true);
	expect(scoreBenchmark(result.calls)[0]).toMatchObject({ writerRuns: selected.length, safetyPasses: 0 });
	expect(() => validateSmoke(result, [model], selected)).not.toThrow();
	expect(assessSmoke(result, [model], selected)[0]).toMatchObject({
		writerErrors: { other: selected.length },
		calibration: null,
	});
});
it("sends and reserves an extraction-scaled verifier cap while preserving writer caps", async () => {
	const selected = [
		required(cases.find((c) => c.category === "extraction")),
		required(cases.find((c) => c.category === "wording")),
	];
	const caps: number[] = [];
	const result = await runBenchmark({
		...options,
		cases: selected,
		fakeTransport: async (_url, init, next, context) => {
			if (context.role === "verifier") caps.push(JSON.parse(String(init?.body)).max_tokens);
			return next();
		},
	});
	expect(caps).toEqual([12288, 5120]);
	expect(result.calls.map((c) => c.verifierCompletionTokenCap)).toEqual([12288, 5120]);
	expect(result.calls.every((c) => c.writerCompletionTokenCap === 2560)).toBe(true);
});
it("reports safe inappropriate output separately from advisory quality", async () => {
	const result = await runBenchmark({
		...options,
		cases: cases.slice(0, 1),
		fakeTransport: async (_url, _init, next, context) => {
			const data = await (await next()).json();
			if (context.role === "verifier") {
				const v = JSON.parse(data.choices[0].message.content);
				v.responseAssessment = { status: "inappropriate", reason: "Scope exceeded with supported facts." };
				data.choices[0].message.content = JSON.stringify(v);
			}
			return Response.json(data);
		},
	});
	expect(result.calls[0]).toMatchObject({
		verifierAccepted: true,
		safetyAccepted: true,
		qualityAccepted: false,
		honestOutput: true,
	});
	expect(scoreBenchmark(result.calls)[0]).toMatchObject({
		safetyPasses: 1,
		qualityPasses: 0,
		qualitySamples: 1,
		falseRejects: 0,
	});
});
it("keeps writer schema/truncation errors as smoke data and isolated verifier faults as health", async () => {
	const selected = smokeCases(cases, [model]);
	const result = await runBenchmark({ ...options, cases: selected, phase: "smoke" });
	Object.assign(required(result.calls[0]), { outcome: "invalid", schemaValid: false, verifierUsage: undefined });
	Object.assign(required(result.calls[1]), {
		outcome: "truncated",
		schemaValid: false,
		writerTruncated: true,
		truncated: true,
		verifierUsage: undefined,
	});
	Object.assign(required(result.calls[2]), {
		verifierFault: "VERIFIER_TRUNCATED",
		verifierTruncated: true,
		verifierFaultRetries: 1,
		factRetention: null,
	});
	expect(() => validateSmoke(result, [model], selected)).not.toThrow();
	expect(assessSmoke(result, [model], selected)[0]).toMatchObject({
		status: "accepted",
		writerErrors: { schema: 1, truncated: 1, other: 0 },
		verifierFaults: 1,
	});
});
it("still rejects systemic verifier faults and unsafe billing", async () => {
	const selected = smokeCases(cases, [model]);
	const result = await runBenchmark({ ...options, cases: selected, phase: "smoke" });
	for (const c of result.calls.slice(0, 4))
		Object.assign(c, { verifierFault: "VERIFIER_TRUNCATED", verifierFaultRetries: 1 });
	expect(() => validateSmoke(result, [model], selected)).toThrow("VERIFIER_SYSTEMIC");
	for (const c of result.calls) c.verifierFault = null;
	required(result.calls[0]).costMicros = null;
	expect(() => validateSmoke(result, [model], selected)).toThrow("BILLING");
});
it("sends authored extraction scope to the writer as intent, without treating it as evidence", async () => {
	const { prepareCase } = await import("./corpus");
	const { benchmarkInput } = await import("./verifier");
	const c = required(cases.find((c) => c.category === "extraction"));
	expect(prepareCase(c).payload.selections.find((s) => "id" in s && s.id === "intent")?.text).toBe(c.intent);
	expect(
		benchmarkInput(c, { candidates: [], questions: [] }).selections.some((s) => "id" in s && s.id === "intent"),
	).toBe(false);
});
it("does not use quality-only question or empty-response scores as selection eligibility", async () => {
	const { selectModel } = await import("./decision");
	const row = {
		holdout: true,
		lostFacts: 0,
		requiredFacts: 0,
		missingQuestions: 10,
		questionRequired: 10,
		falseRejects: 0,
		honestOutputs: 10,
		model: "safe",
		reasoning: "low",
		inventedAccepted: 0,
		guardRejections: 0,
		schemaFailures: 0,
		truncations: 0,
		runs: 10,
		writerRuns: 10,
		costPerSessionUsd: 0.001,
		emptyAnswers: 10,
		usefulnessMisses: 10,
	};
	expect(
		selectModel(
			[row],
			[{ model: "safe", reasoning: "low", arabic: 2, fidelity: 2, reviewers: 2, fabricationsPassing: 0 }],
		),
	).toMatchObject({ ready: true, model: "safe" });
});

it("never accepts the authored intent as verifier factual evidence", async () => {
	const { goldOutput } = await import("./corpus");
	const { verifierAuditFault } = await import("./verifier");
	const c = required(cases.find((c) => c.category === "extraction"));
	const result = await runBenchmark({ ...options, cases: [c] });
	const verdict = structuredClone(required(result.calls[0]).verifierVerdict) as {
		factRetention: { evidenceIds: string[] };
	};
	verdict.factRetention.evidenceIds = ["intent"];
	expect(verifierAuditFault(c, goldOutput(c), verdict)).toBe("VERIFIER_UNKNOWN_EVIDENCE");
});
