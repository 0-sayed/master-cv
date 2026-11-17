import { expect, it } from "vite-plus/test";
import { planJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import recorded from "./fixtures/recorded-coverage-faults.json";
import { required } from "./required";
import { routeFor, verifierModelFor, type RawRecord } from "./runner";
import { verifyBenchmark } from "./verifier";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const probe = required(
	planJudgeCanaries(models).find(
		(p) => p.c.category === "interview-prep" && p.c.language === "en" && p.defect === "escalation",
	),
);
const writer = required(models.find((m) => m.reasoning === "low"));
const vm = verifierModelFor(writer, models);
const base = {
	options: { models, cases: [], fake: true, runs: 1, budgetUsd: 100, openaiBudgetUsd: 100 },
	model: vm,
	c: probe.c,
	output: probe.output,
	route: routeFor(vm, "fake", true, probe.c),
	parentKey: "majority",
	runIndex: 0,
	promptHash: "test",
	fixtureHash: "test",
};

it.each(recorded)("retries the recorded $caseId $expectedFault without inferring missing verdicts", async (entry) => {
	const p = required(planJudgeCanaries(models).find((p) => p.c.id === entry.caseId && p.defect === entry.defect));
	let calls = 0;
	const result = await verifyBenchmark({
		...base,
		c: p.c,
		output: p.output,
		route: routeFor(vm, "fake", true, p.c),
		options: {
			...base.options,
			fakeTransport: async (_u, _i, next) => {
				const body = await (await next()).json();
				if (++calls === 1) body.choices[0].message.content = JSON.stringify(entry.verdict);
				return Response.json(body);
			},
		},
	});
	expect(result.judgments[0]?.attempts[0]?.fault).toBe(entry.expectedFault);
	expect(result.judgments[0]?.attempts).toHaveLength(2);
	expect(result.fault).toBeNull();
});

it("never rejudges an accepted first judgment", async () => {
	const p = required(
		planJudgeCanaries(models).find(
			(p) => p.c.category === "cover-letter" && p.c.language === "en" && p.defect === "gold",
		),
	);
	const result = await verifyBenchmark({ ...base, c: p.c, output: p.output, route: routeFor(vm, "fake", true, p.c) });
	expect(result.accepted).toBe(true);
	expect(result.judgments).toHaveLength(1);
	expect(result.rejectionVote).toBeNull();
});

it("retries every faulty judgment twice and stops as soon as two valid judgments reject", async () => {
	const sent: string[] = [];
	const raw: RawRecord[] = [];
	const result = await verifyBenchmark({
		...base,
		options: {
			...base.options,
			onRaw: async (r) => {
				raw.push(r);
			},
			fakeTransport: async (_u, _i, next, ctx) => {
				const key = required(ctx.requestKey);
				sent.push(key);
				const body = await (await next()).json();
				if (!key.endsWith(":retry:2")) body.choices[0].message.content = "{}";
				return Response.json(body);
			},
		},
	});
	expect(sent).toHaveLength(6);
	expect(sent.some((key) => key.includes(":judge:3"))).toBe(false);
	expect(result.judgments).toHaveLength(2);
	expect(result.judgments.every((j) => j.attempts.length === 3)).toBe(true);
	expect(result.fault).toBeNull();
	expect(result.accepted).toBe(false);
	expect(result.rejectionVote?.complete).toBe(true);
	const resumed = await verifyBenchmark({
		...base,
		cachedJudgments: raw,
		options: {
			...base.options,
			fakeTransport: () => {
				throw new Error("MUST_NOT_REBUY");
			},
		},
	});
	expect(resumed.verdict).toEqual(result.verdict);
	expect(resumed.reusedCosts.openRouterMicros).toBe(result.result.openRouterCostMicros);
});

it("uses two valid rejections when the other judgment exhausts its protocol retries", async () => {
	const sent: string[] = [];
	const result = await verifyBenchmark({
		...base,
		options: {
			...base.options,
			fakeTransport: async (_u, _i, next, ctx) => {
				const key = required(ctx.requestKey);
				sent.push(key);
				const body = await (await next()).json();
				if (key.includes(":judge:2")) body.choices[0].message.content = "{}";
				return Response.json(body);
			},
		},
	});
	expect(sent).toHaveLength(5);
	expect(result.fault).toBeNull();
	expect(result.rejectionVote?.complete).toBe(true);
	expect(result.rejectionVote?.targets.every((t) => t.rejectVotes === 2)).toBe(true);
	expect(result.judgments[1]?.fault).toBe("INVALID_VERIFIER_OUTPUT");
});

it("retains a final protocol fault when fewer than two valid agreeing judgments exist", async () => {
	const result = await verifyBenchmark({
		...base,
		options: {
			...base.options,
			fakeTransport: async (_u, _i, next, ctx) => {
				const body = await (await next()).json();
				if (required(ctx.requestKey).includes(":judge:")) body.choices[0].message.content = " ".repeat(100);
				return Response.json(body);
			},
		},
	});
	expect(result.fault).toBe("VERIFIER_DEGENERATE_OUTPUT");
	expect(result.rejectionVote?.complete).toBe(false);
	expect(result.accepted).toBe(false);
	expect(result.judgments).toHaveLength(3);
	expect(result.judgments.slice(1).every((j) => j.attempts.length === 3)).toBe(true);
});
