import type { JudgeCanaryReceipt } from "./canaries";
import type { TasksVerification } from "./contracts/verifier/schema";
import { beforeAll, expect, it } from "vite-plus/test";
import {
	assertJudgeCanaries,
	loadJudgeCanaries,
	planJudgeCanaries,
	runJudgeCanaries,
	scoreJudgeCanary,
} from "./canaries";
import { loadModels } from "./config";
import { summaryContract, summaryOutputSchema } from "./contracts/summary/contract";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { required } from "./required";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const options = { models, cases: [], runs: 1, fake: true, budgetUsd: 13, openaiBudgetUsd: 40 };
const plan = planJudgeCanaries(models);
let good: JudgeCanaryReceipt;
beforeAll(async () => {
	good = required(await runJudgeCanaries({ phase: "smoke", studyHash: "study", options }));
});

it("credits a deterministic backstop independently of a verifier miss", () => {
	const probe = required(plan.find((p) => p.c.category === "summary" && p.defect === "invented-metric"));
	const row = structuredClone(required(good.results.find((r) => r.key === probe.key)));
	row.verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output);
	expect(scoreJudgeCanary(probe, row)).toMatchObject({
		caught: false,
		pipelineCaught: true,
		guardRejected: true,
		falseReject: false,
		pipelineFalseReject: false,
	});
});

it("counts a deterministic honest rejection in the pipeline even when the verifier accepts", () => {
	const probe = required(plan.find((p) => p.c.category === "summary" && p.defect === "invented-metric"));
	const honest = { ...probe, expectedAccepted: true };
	const row = structuredClone(required(good.results.find((r) => r.key === probe.key)));
	row.verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output);
	expect(scoreJudgeCanary(honest, row)).toMatchObject({ falseReject: false, pipelineFalseReject: true });
});

it("uses invented skill as summary safety priority and keeps omission as advisory quality", () => {
	for (const c of loadJudgeCanaries().filter((c) => c.category === "summary")) {
		expect(plan.filter((p) => p.c.id === c.id).map((p) => p.defect)).toEqual([
			"gold",
			"invented-metric",
			"dropped-negation",
			"invented-skill",
		]);
		const omitted = summaryOutputSchema.parse(structuredClone(c.gold));
		omitted.summary.claims = omitted.summary.claims.slice(0, 1);
		omitted.summary.text = required(omitted.summary.claims[0]).text;
		expect(summaryContract.score(c, omitted, null)).toMatchObject({
			safetyDeterministic: { pass: true },
			quality: { value: 0.5, pass: false },
		});
	}
});

it("gates the final protocol-fault rate at ten percent independently of semantic calibration", () => {
	const binding = { studyHash: "study", models, mode: "fake" as const };
	for (const count of [7, 8]) {
		const receipt = structuredClone(good);
		for (const row of receipt.results.filter((r) => r.defect === "gold").slice(0, count)) {
			(row.verdict as TasksVerification).absence.push({ id: "unrequested", verdict: "confirmed_absent" });
			Object.assign(row, { verifierFaultRetries: 1 });
		}
		if (count === 7) expect(() => assertJudgeCanaries(receipt, binding)).not.toThrow();
		else expect(() => assertJudgeCanaries(receipt, binding)).toThrow("JUDGE_CANARY_GATE");
	}
});

it("retries a protocol fault once on the identical probe and records both paid attempts", async () => {
	const attempts = new Map<string, number>();
	const receipt = required(
		await runJudgeCanaries({
			phase: "smoke",
			studyHash: "study",
			options: {
				...options,
				fakeTransport: async (_u, _i, next, context) => {
					const count = (attempts.get(context.key) ?? 0) + 1;
					attempts.set(context.key, count);
					const body = await (await next()).json();
					if (count === 1) {
						const verdict = JSON.parse(body.choices[0].message.content);
						verdict.absence.push({ id: "unrequested", verdict: "confirmed_absent" });
						body.choices[0].message.content = JSON.stringify(verdict);
					}
					return Response.json(body);
				},
			},
		}),
	);
	expect([...attempts.values()]).toEqual(Array(72).fill(2));
	expect(receipt.results.every((r) => "verifierFaultRetries" in r && r.verifierFaultRetries === 1)).toBe(true);
	expect(receipt.results.every((r) => "attempts" in r && Array.isArray(r.attempts) && r.attempts.length === 2)).toBe(
		true,
	);
	expect(receipt).toMatchObject({ recall: 1, verifierRecall: 1, protocolFaults: 0, protocolFaultRate: 0 });
	expect(() => assertJudgeCanaries(receipt, { studyHash: "study", models, mode: "fake" })).not.toThrow();
});

it("preserves training receipt in Arabic-to-English canary golds and their unrelated mutant baselines", () => {
	for (const c of loadJudgeCanaries().filter((c) => c.category === "translation" && c.language !== "en")) {
		const gold = c.gold as { segments: { sourceId: string; text: string; claims: { text: string }[] }[] };
		const context = required(gold.segments.find((s) => s.sourceId === "canary-context"));
		expect(context.text).toBe(
			"Assisted with report preparation. Did not manage a team. Received training in Hijri year 1442.",
		);
		expect(context.claims.map((claim) => claim.text).join(" ")).toBe(context.text);
	}
});

it("allows exhausted isolated truncations in the protocol rate without calling them semantic rejects", () => {
	const receipt = structuredClone(good);
	const row = required(receipt.results.find((r) => r.defect === "gold"));
	row.outcome = "truncated";
	Object.assign(row, { verifierFaultRetries: 1 });
	const probe = required(plan.find((p) => p.key === row.key));
	expect(scoreJudgeCanary(probe, row)).toMatchObject({
		fault: "VERIFIER_TRUNCATED",
		falseReject: false,
		pipelineFalseReject: false,
	});
	expect(() => assertJudgeCanaries(receipt, { studyHash: "study", models, mode: "fake" })).not.toThrow();
});

it("resumes a settled legacy truncated verdict with one retry and retains its historical charge", async () => {
	const receipt = structuredClone(good);
	const row = required(receipt.results.find((r) => r.defect === "gold"));
	row.outcome = "truncated";
	let calls = 0;
	const resumed = required(
		await runJudgeCanaries({
			phase: "smoke",
			studyHash: "study",
			previous: receipt,
			options: {
				...options,
				fakeTransport: async (_u, _i, next) => {
					calls++;
					return next();
				},
			},
		}),
	);
	expect(calls).toBe(1);
	const retried = required(resumed.results.find((r) => r.key === row.key));
	expect(retried).toMatchObject({ outcome: "valid", verifierFaultRetries: 1 });
	expect(retried.openRouterMicros).toBeGreaterThan(row.openRouterMicros);
	expect(resumed.openRouterMicros).toBe(resumed.results.reduce((n, r) => n + r.openRouterMicros, 0));
});

it("retains exhausted faults after exactly one retry and never retries a semantic rejection", async () => {
	const counts = new Map<string, number>();
	const receipt = required(
		await runJudgeCanaries({
			phase: "smoke",
			studyHash: "study",
			options: {
				...options,
				fakeTransport: async (_u, _i, next, context) => {
					counts.set(context.key, (counts.get(context.key) ?? 0) + 1);
					const body = await (await next()).json();
					const verdict = JSON.parse(body.choices[0].message.content);
					verdict.absence.push({ id: "unrequested", verdict: "confirmed_absent" });
					body.choices[0].message.content = JSON.stringify(verdict);
					return Response.json(body);
				},
			},
		}),
	);
	expect([...counts.values()]).toEqual(Array(72).fill(2));
	expect(receipt).toMatchObject({ protocolFaults: 72, protocolFaultRate: 1 });
	expect(() => assertJudgeCanaries(receipt, { studyHash: "study", models, mode: "fake" })).toThrow("JUDGE_CANARY_GATE");
	await runJudgeCanaries({
		phase: "smoke",
		studyHash: "study",
		previous: receipt,
		options: {
			...options,
			fakeTransport: () => {
				throw new Error("EXHAUSTED_FAULT_MUST_NOT_DISPATCH");
			},
		},
	});
	expect(good.results.every((r) => r.verifierFaultRetries === 0 && r.attempts?.length === 1)).toBe(true);
});

it("qualifies a verifier miss caught by the guard without imposing an advisory verifier recall threshold", () => {
	const receipt = structuredClone(good);
	const probe = required(plan.find((p) => p.c.category === "summary" && p.defect === "invented-metric"));
	const row = required(receipt.results.find((r) => r.key === probe.key));
	row.verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output);
	expect(() => assertJudgeCanaries(receipt, { studyHash: "study", models, mode: "fake" })).not.toThrow();
});
