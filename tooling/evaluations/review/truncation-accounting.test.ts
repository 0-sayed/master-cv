import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries, scoreJudgeCanary, planJudgeCanaries, runJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { completionTokenLimit } from "./production";
import { required } from "./required";
import { runBenchmark, routeFor, verifierModelFor } from "./runner";
import { verifierBudgetRoute } from "./verifier-budget";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const writer = required(models.find((m) => m.reasoning === "low"));
const c = required(loadJudgeCanaries().find((c) => c.category === "cover-letter" && c.language === "en"));
const options = { models: [writer], cases: [c], runs: 1, fake: true, budgetUsd: 100, openaiBudgetUsd: 100 };

it("retries a whitespace runaway fresh at the same budget and resumes both paid attempts", async () => {
	const caps: number[] = [];
	const raw: import("./runner").RawRecord[] = [];
	const result = await runBenchmark({
		...options,
		onRaw: async (row) => {
			raw.push(row);
		},
		fakeTransport: async (_u, init, next, ctx) => {
			if (ctx.role !== "verifier") return next();
			const request = JSON.parse(String(init?.body));
			expect(request.stop).toContain(" ".repeat(64));
			caps.push(request.max_tokens);
			const body = await (await next()).json();
			if (caps.length === 1) {
				body.choices[0].message.content = '{"verdicts":' + " ".repeat(16025);
				body.choices[0].finish_reason = "length";
			}
			return Response.json(body);
		},
	});
	expect(caps).toEqual([16384, 16384]);
	expect(result.calls[0]?.verifierAccepted).toBe(true);
	expect(raw.some((row) => row.key.endsWith(":retry:1"))).toBe(true);
	expect(result.calls[0]?.verifierJudgments?.[0]?.attempts?.[0]?.fault).toBe("VERIFIER_DEGENERATE_OUTPUT");
	const resumed = await runBenchmark({
		...options,
		previousCalls: result.calls,
		rawRecords: raw,
		fakeTransport: () => {
			throw new Error("MUST_NOT_REBUY");
		},
	});
	expect(resumed.calls).toEqual(result.calls);
	expect(resumed.reservedUsd).toBe(result.reservedUsd);
});

it("reserves a complete reasoning budget and expands it exactly once after truncation", async () => {
	const caps: number[] = [];
	const result = await runBenchmark({
		...options,
		fakeTransport: async (_u, init, next, ctx) => {
			const response = await next();
			if (ctx.role !== "verifier") return response;
			caps.push(JSON.parse(String(init?.body)).max_tokens);
			const body = await response.json();
			if (caps.length === 1) body.choices[0].finish_reason = "length";
			body.usage.cost = 0.000123;
			return Response.json(body);
		},
	});
	expect(caps).toEqual([16384, 20480]);
	expect(result.calls[0]?.verifierAccepted).toBe(true);
	expect(result.calls[0]?.verifierUsage?.costMicros).toBe(246);
	expect(result.reservedUsd).toBe(0.000246);
});

it("never accepts a persistently truncated judgment or retries beyond the larger budget", async () => {
	let judges = 0;
	const result = await runBenchmark({
		...options,
		fakeTransport: async (_u, _i, next, ctx) => {
			const response = await next();
			if (ctx.role !== "verifier") return response;
			judges++;
			const body = await response.json();
			body.choices[0].finish_reason = "length";
			return Response.json(body);
		},
	});
	expect(judges).toBe(3);
	expect(result.calls[0]).toMatchObject({ verifierAccepted: false, verifierFault: "VERIFIER_TRUNCATED" });
});

it("keeps both budgets within the installed route limits", () => {
	const route = routeFor(verifierModelFor(writer, models), "fake", true, c);
	expect(completionTokenLimit(verifierBudgetRoute(route))).toBe(16384);
	expect(completionTokenLimit(verifierBudgetRoute(route, true))).toBe(20480);
});

it("never counts a truncated verdict as a catch or an honest rejection, even when the guard catches it", async () => {
	const receipt = required(
		await runJudgeCanaries({ phase: "smoke", studyHash: "test", options: { ...options, models } }),
	);
	for (const defect of ["gold", "invented-metric"]) {
		const probe = required(planJudgeCanaries(models).find((p) => p.c.category === "summary" && p.defect === defect));
		const row = { ...required(receipt.results.find((r) => r.key === probe.key)), outcome: "truncated" };
		expect(scoreJudgeCanary(probe, row)).toMatchObject({
			caught: false,
			falseReject: false,
			pipelineCaught: false,
			pipelineFalseReject: false,
			fault: "VERIFIER_TRUNCATED",
		});
	}
});

// Paid receipt gen-1794854365-HVKBHyaktoq5e07mEQsj: cost includes cache pricing.
it("settles the recorded provider cost without adding a reservation or purchase fee", async () => {
	const paidUsage = {
		prompt_tokens: 1723,
		completion_tokens: 12288,
		total_tokens: 14011,
		cost: 0.014999076,
		is_byok: false,
		completion_tokens_details: { reasoning_tokens: 586 },
	};
	const result = await runBenchmark({
		...options,
		fakeTransport: async (_u, _i, next, ctx) => {
			const response = await next();
			if (ctx.role !== "verifier") return response;
			const body = await response.json();
			body.usage = paidUsage;
			return Response.json(body);
		},
	});
	expect(result.calls[0]?.verifierUsage?.costMicros).toBe(15000);
	expect(result.reservedUsd).toBe(0.015);
});

it("never votes on persistent whitespace from re-judgments", async () => {
	const { planJudgeCanaries } = await import("./canaries");
	const probe = required(
		planJudgeCanaries(models).find(
			(p) => p.c.category === "cover-letter" && p.c.language === "en" && p.defect === "job-only-keyword",
		),
	);
	const { verifyBenchmark } = await import("./verifier");
	const vm = verifierModelFor(writer, models);
	const requests: string[] = [];
	const result = await verifyBenchmark({
		options: {
			...options,
			fakeTransport: async (_u, _i, next, ctx) => {
				requests.push(required(ctx.requestKey));
				const body = await (await next()).json();
				if (required(ctx.requestKey).includes(":judge:")) {
					body.choices[0].message.content = " ".repeat(20127);
					body.choices[0].finish_reason = "length";
				}
				return Response.json(body);
			},
		},
		model: vm,
		c: probe.c,
		route: routeFor(vm, "fake", true, probe.c),
		output: probe.output,
		parentKey: "persistent",
		runIndex: 0,
		promptHash: "test",
		fixtureHash: "test",
	});
	expect(result.accepted).toBe(false);
	expect(result.fault).toBe("VERIFIER_DEGENERATE_OUTPUT");
	expect(result.rejectionVote?.complete).toBe(false);
	expect(requests).toHaveLength(7);
	expect(requests.filter((key) => key.endsWith(":retry:1"))).toHaveLength(2);
});
