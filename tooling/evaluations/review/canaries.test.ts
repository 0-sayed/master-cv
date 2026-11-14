import type { FakeTransport } from "./runner";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import * as canaries from "./canaries";
import { loadModels } from "./config";
import { getTaskContract } from "./contracts";
import { jobEvidenceSchema } from "./contracts/job-evidence/contract";
import { summaryOutputSchema } from "./contracts/summary/contract";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { evaluateOutput, assertTaskGoldFits } from "./execution";
import { required } from "./required";
import { benchmarkInput } from "./verifier";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const options = { models, cases: [], runs: 1, fake: true, budgetUsd: 13, openaiBudgetUsd: 40 };
afterEach(() => vi.useRealTimers());
it("rejects dropped-negation job evidence deterministically in Arabic and mixed canaries", () => {
	for (const c of canaries.loadJudgeCanaries().filter((c) => c.category === "job-evidence" && c.language !== "en")) {
		const mutant = required(c.mutants.find((m) => m.id === "dropped-negation"));
		expect(evaluateOutput(c, c.gold).guardAccepted, c.id).toBe(true);
		expect(evaluateOutput(c, mutant.output).guardAccepted, c.id).toBe(false);
	}
});
it("keeps every canary gold within the contract half-cap bound", () => {
	for (const c of canaries.loadJudgeCanaries())
		for (const effort of ["none", "low", "medium", "high"] as const)
			expect(
				() => assertTaskGoldFits(c, { maxOutputTokens: getTaskContract(c.category).visibleCap(effort) }),
				c.id,
			).not.toThrow();
});
it("covers every defect per category and language with schema-valid outputs and CV-only citations", () => {
	const fixtures = canaries.loadJudgeCanaries();
	expect(fixtures).toHaveLength(18);
	for (const c of fixtures) {
		const contract = getTaskContract(c.category);
		expect(contract.outputSchema.safeParse(c.gold).success, c.id).toBe(true);
		expect(c.mutants.map((m) => m.id).sort()).toEqual(
			["invented-metric", "escalation", "dropped-negation", "wrong-hijri-year", "job-only-keyword"].sort(),
		);
		const sap = /(?:^|[^\p{L}])(?:SAP|ساب)(?:$|[^\p{L}])/u;
		expect(c.jobAd?.segments.some((s) => sap.test(s.text))).toBe(true);
		expect(c.cv.some((f) => sap.test(f.text))).toBe(false);
		for (const m of c.mutants) {
			const output = contract.outputSchema.parse(m.output) as Record<string, unknown>;
			expect(() => benchmarkInput(c, output), `${c.id}/${m.id}`).not.toThrow();
			expect(tasksVerifier.auditFault(c, output, tasksVerifier.fakeVerdict(c, output))).toBeNull();
		}
	}
});
it("sends canaries to verifier only in smoke and never calls a writer", async () => {
	const roles: string[] = [];
	const fakeTransport: FakeTransport = async (_u, _i, next, context) => {
		roles.push(context.role);
		return next();
	};
	const full = await canaries.runJudgeCanaries({
		phase: "full",
		studyHash: "study",
		options: { ...options, fakeTransport },
	});
	expect(full).toBeNull();
	expect(roles).toEqual([]);
	const receipt = await canaries.runJudgeCanaries({
		phase: "smoke",
		studyHash: "study",
		options: { ...options, fakeTransport },
	});
	expect(roles).toHaveLength(72);
	expect(new Set(roles)).toEqual(new Set(["verifier"]));
	expect(() => canaries.assertJudgeCanaries(receipt, { studyHash: "study", models, mode: "fake" })).not.toThrow();
	expect(receipt).toMatchObject({ recall: 1, honestFalseRejects: 0, mode: "fake" });
});
it("blocks full on missed defects, honest gold rejects, faults, missing coverage, stale studies and fake receipts", async () => {
	const good = await canaries.runJudgeCanaries({ phase: "smoke", studyHash: "study", options });
	const binding = { studyHash: "study", models, mode: "fake" as const };
	expect(() => canaries.assertJudgeCanaries(null, binding)).toThrow("JUDGE_CANARY_GATE");
	expect(() => canaries.assertJudgeCanaries(good, { ...binding, mode: "live" })).toThrow("JUDGE_CANARY_GATE");
	expect(() => canaries.assertJudgeCanaries(good, { ...binding, studyHash: "other" })).toThrow("JUDGE_CANARY_GATE");
	for (const change of [
		(r: NonNullable<typeof good>) => {
			r.results.pop();
		},
		(r: NonNullable<typeof good>) => {
			const p = required(
				canaries
					.planJudgeCanaries(models)
					.find((p) => p.c.category === "interview-prep" && p.defect === "dropped-negation"),
			);
			required(r.results.find((row) => row.key === p.key)).verdict = tasksVerifier.fakeVerdict(
				{ ...p.c, gold: p.output },
				p.output,
			);
		},
		(r: NonNullable<typeof good>) => {
			required(r.results[0]).verdict = required(r.results[1]).verdict;
		},
		(r: NonNullable<typeof good>) => {
			required(r.results[0]).outcome = "truncated";
		},
		(r: NonNullable<typeof good>) => {
			required(r.results[0]).provider = "wrong";
		},
	]) {
		const bad = required(structuredClone(good));
		change(bad);
		expect(() => canaries.assertJudgeCanaries(bad, binding)).toThrow("JUDGE_CANARY_GATE");
	}
	const permissive = await canaries.runJudgeCanaries({
		phase: "smoke",
		studyHash: "study",
		options: {
			...options,
			fakeTransport: async (_u, _i, next) => {
				const body = await (await next()).json();
				const v = JSON.parse(body.choices[0].message.content);
				for (const claim of v.verdicts) claim.verdict = "supported";
				for (const p of v.premises) p.verdict = "no_candidate_premise";
				if (v.retention) v.retention.status = "retained";
				v.coverage.status = "complete";
				for (const a of v.absence) a.verdict = "confirmed_absent";
				body.choices[0].message.content = JSON.stringify(v);
				return Response.json(body);
			},
		},
	});
	expect(permissive?.verifierRecall).toBe(0);
	expect(permissive?.recall).toBeGreaterThan(0);
	expect(() => canaries.assertJudgeCanaries(permissive, binding)).toThrow("JUDGE_CANARY_GATE");
});
it("reserves the selected payer durably, reuses completed probes on resume and refuses unsettled probes", async () => {
	let sends = 0;
	const progress: canaries.JudgeCanaryReceipt[] = [];
	const fakeTransport: FakeTransport = async (_u, _i, next) => {
		sends++;
		return next();
	};
	const input = {
		phase: "smoke" as const,
		studyHash: "study",
		options: { ...options, fakeTransport },
		onProgress: async (r: canaries.JudgeCanaryReceipt) => {
			progress.push(structuredClone(r));
		},
	};
	const receipt = await canaries.runJudgeCanaries(input);
	expect(progress[0]?.results[0]?.outcome).toBe("pending");
	expect(required(progress[0]).openRouterMicros + required(progress[0]).openaiMicros).toBeGreaterThan(0);
	expect(required(receipt).openRouterMicros).toBeGreaterThan(0);
	expect(required(receipt).openaiMicros).toBe(0);
	await canaries.runJudgeCanaries({ ...input, previous: required(receipt) });
	expect(sends).toBe(72);
	await expect(canaries.runJudgeCanaries({ ...input, previous: required(progress[0]) })).rejects.toThrow(
		"CANARY_UNSETTLED",
	);
	await expect(
		canaries.runJudgeCanaries({ ...input, options: { ...input.options, budgetUsd: 0.000001 } }),
	).rejects.toThrow("BUDGET_LIMIT");
});

it("runs pinned judges in parallel with serialized immutable checkpoints and drains interruption before resume", async () => {
	const controller = new AbortController();
	const ready = Promise.withResolvers<void>();
	const active = new Map<string, number>();
	const peaks = new Map<string, number>();
	const sent = new Set<string>();
	let writing = false;
	let last: canaries.JudgeCanaryReceipt | undefined;
	const input = {
		phase: "smoke" as const,
		studyHash: "study",
		options: {
			...options,
			signal: controller.signal,
			fakeTransport: (async (_u, _i, next, context) => {
				expect(sent.has(context.key)).toBe(false);
				sent.add(context.key);
				const provider = context.model.provider;
				const count = (active.get(provider) ?? 0) + 1;
				active.set(provider, count);
				peaks.set(provider, Math.max(peaks.get(provider) ?? 0, count));
				if (sent.size >= 2) ready.resolve();
				await ready.promise;
				await new Promise((resolve) => setTimeout(resolve, 5));
				if (sent.size >= 10) controller.abort();
				active.set(provider, (active.get(provider) ?? 1) - 1);
				return next();
			}) satisfies FakeTransport,
		},
		onProgress: async (receipt: canaries.JudgeCanaryReceipt) => {
			expect(writing).toBe(false);
			writing = true;
			const before = JSON.stringify(receipt);
			await new Promise((resolve) => setTimeout(resolve, 1));
			expect(JSON.stringify(receipt)).toBe(before);
			last = structuredClone(receipt);
			writing = false;
		},
	};
	await expect(canaries.runJudgeCanaries(input)).rejects.toThrow("INTERRUPTED");
	expect(peaks.get("together")).toBe(2);
	expect(peaks.has("openai")).toBe(false);
	expect(required(last).results.every((r) => r.outcome !== "pending")).toBe(true);
	const completed = sent.size;
	const receipt = await canaries.runJudgeCanaries({
		...input,
		options: { ...input.options, signal: new AbortController().signal },
		previous: required(last),
	});
	expect(completed).toBeGreaterThan(0);
	expect(sent.size).toBe(72);
	expect(receipt?.results).toHaveLength(72);
});

it("locks the checkpoint before reading it and atomically resumes the saved completed probes", async () => {
	const folder = await mkdtemp("/tmp/t006-canary-checkpoint-");
	const path = join(folder, "canaries.json");
	const controller = new AbortController();
	let entered!: () => void;
	let release!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	const sent = new Set<string>();
	const fakeTransport: FakeTransport = async (_u, _i, next, context) => {
		expect(sent.has(context.key)).toBe(false);
		sent.add(context.key);
		entered();
		await blocked;
		controller.abort();
		return next();
	};
	const input = {
		phase: "smoke" as const,
		studyHash: "study",
		options: { ...options, sessionConcurrency: 1, signal: controller.signal, fakeTransport },
	};
	try {
		const first = canaries.runJudgeCanaryFile(path, input);
		const interrupted = expect(first).rejects.toThrow("INTERRUPTED");
		await started;
		await expect(canaries.runJudgeCanaryFile(path, input)).rejects.toThrow("CANARY_LOCKED");
		release();
		await interrupted;
		const saved = JSON.parse(await readFile(path, "utf8"));
		expect(saved.results).toHaveLength(1);
		expect(saved.results[0].outcome).toBe("valid");
		const receipt = await canaries.runJudgeCanaryFile(path, {
			...input,
			options: { ...input.options, signal: new AbortController().signal },
		});
		expect(receipt?.results).toHaveLength(72);
		expect(sent.size).toBe(72);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual(receipt);
	} finally {
		release();
		await rm(folder, { recursive: true, force: true });
	}
});

it("slim plan keeps gold plus three priority defects across every category/language on the DeepSeek pin", () => {
	const plan = canaries.planJudgeCanaries(models);
	expect(plan).toHaveLength(72);
	for (const c of canaries.loadJudgeCanaries()) {
		const probes = plan.filter((p) => p.c.id === c.id);
		const specific = {
			summary: "invented-skill",
			"job-evidence": "unsupported-supported",
			tailoring: "job-only-keyword",
			translation: "wrong-hijri-year",
			"cover-letter": "job-only-keyword",
			"interview-prep": "escalation",
		}[c.category];
		expect(probes.map((p) => p.defect)).toEqual(["gold", "invented-metric", "dropped-negation", specific]);
		expect(probes[0]?.output).toEqual(c.gold);
		for (const p of probes) {
			expect(p.model).toMatchObject({
				model: "deepseek/deepseek-v4.1-flash-1017",
				provider: "together",
				reasoning: "low",
			});
			expect(getTaskContract(c.category).outputSchema.safeParse(p.output).success).toBe(true);
		}
		if (c.category === "summary") {
			expect(summaryOutputSchema.parse(probes[3]?.output).summary.claims).toHaveLength(3);
			expect(evaluateOutput(c, probes[3]?.output).guardAccepted).toBe(false);
		}
		if (c.category === "job-evidence")
			expect(jobEvidenceSchema.parse(probes[3]?.output).requirements[1]?.verdict).toBe("supported");
	}
});
