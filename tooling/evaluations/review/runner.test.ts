import { expect, it, vi } from "vite-plus/test";
import { Budget } from "./budget";
import { parseOptions, loadModels, applyReasoning } from "./config";
import { cases } from "./corpus";
import { scoreBenchmark } from "./metrics";
import { identityMapping } from "./report";
import { required } from "./required";
import { runBenchmark, estimateBenchmark, type RawRecord } from "./runner";
import { assessSmoke, smokeCases } from "./study";

it.each([false, true])(
	"holds a crashed retry sequence reservation (final response recorded: %s)",
	async (finalRecorded) => {
		const raw: RawRecord[] = [];
		const run = await runBenchmark({
			models: loadModels().slice(0, 1),
			cases: cases.slice(0, 1),
			runs: 1,
			fake: true,
			budgetUsd: 10,
			onRaw: async (r) => {
				raw.push(r);
			},
		});
		const writer = required(raw.find((r) => !r.key.endsWith(":verify")));
		const firstError = {
			...writer,
			body: JSON.stringify({
				error: { code: 429 },
				usage: { cost: 0.000002, cost_details: { upstream_inference_cost: 0.000002 } },
			}),
		};
		vi.useFakeTimers();
		const pending = runBenchmark({
			models: loadModels().slice(0, 1),
			cases: cases.slice(0, 1),
			runs: 1,
			fake: true,
			budgetUsd: 10,
			rawRecords: finalRecorded ? [firstError, writer] : [firstError],
		});
		await vi.runAllTimersAsync();
		const resumed = await pending;
		vi.useRealTimers();
		expect(resumed.stopReason).toBe("PENDING_BILLING");
		expect(resumed.calls).toHaveLength(0);
		expect(resumed.reservedUsd).toBe(required(required(run.calls[0]).reservedOpenRouterMicros) / 1e6);
	},
);
const throttled429 = {
	error: { code: 429, message: "Rate limit exceeded", metadata: { error_type: "rate_limit_exceeded" } },
	usage: { prompt_tokens: 0, completion_tokens: 0, cost: 0, cost_details: { upstream_inference_cost: 0 } },
};
it("records zero-cost writer throttling without stopping other variants", async () => {
	vi.useFakeTimers();
	const pending = runBenchmark({
		models: loadModels().slice(0, 2),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: false,
		key: "synthetic",
		budgetUsd: 10,
		transport: async () => Response.json(throttled429),
	});
	await vi.runAllTimersAsync();
	const run = await pending;
	vi.useRealTimers();
	expect(run.reservedUsd).toBe(0);
	expect(
		scoreBenchmark(run.calls)
			.filter((g) => g.dimension === "model")
			.every((g) => g.writerRuns === 0 && g.transientProviderFailures === 1),
	).toBe(true);
	expect(run.calls).toHaveLength(2);
	expect(run.calls.every((c) => c.outcome === "transient" && c.costMicros === 0)).toBe(true);
	expect(run.stopReason).toBeNull();
});
it("records every unhealthy writer session without dropping its variant", async () => {
	const model = required(loadModels()[0]);
	const run = await runBenchmark({
		models: [model],
		cases: cases.slice(0, 1),
		runs: 12,
		fake: false,
		key: "synthetic",
		budgetUsd: 10,
		transport: async () =>
			Response.json({
				provider: "OpenAI",
				choices: [{ message: { content: "{" }, finish_reason: "length" }],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 10,
					cost: 0.00001,
					cost_details: { upstream_inference_cost: 0.00001 },
				},
			}),
	});
	expect(run.calls).toHaveLength(12);
	expect(run.modelStops).toEqual([]);
	expect(run.stopReason).toBeNull();
});

it("fake verifier supports authored extraction regardless of schema object-key order", async () => {
	const c = required(cases.find((c) => !c.holdout && c.kind === "extraction"));
	const artifact = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: [c],
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	expect(artifact.calls[0]?.verifierAccepted).toBe(true);
});

it("reports every category-language cell with its distinct-case denominator", async () => {
	const artifact = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 4,
		budgetUsd: 5,
		fake: true,
	});
	expect(scoreBenchmark(artifact.calls).filter((g) => g.dimension === "category-language")).toHaveLength(1);
	const call = required(artifact.calls[0]);
	const distinct = Array.from({ length: 4 }, (_, i) => ({ ...call, caseId: `independent-${i}` }));
	expect(scoreBenchmark(distinct).find((g) => g.dimension === "category-language")?.cases).toBe(4);
});

it("reserves before sending, refunds known cost, and holds unknown cost", () => {
	const budget = new Budget(100);
	budget.reserve(60);
	budget.settle(60, 10);
	expect(budget.consumed).toBe(10);
	budget.reserve(60);
	budget.settle(60, null);
	expect(budget.consumed).toBe(70);
	expect(() => budget.reserve(31)).toThrow("BUDGET_LIMIT");
	expect(() => new Budget(Number.NaN)).toThrow();
});
it("defaults to three runs and rejects unsafe flags or Google without explicit opt-in", () => {
	expect(parseOptions([])).toMatchObject({ runs: 3, budgetUsd: 5, fake: false, dryRun: false });
	expect(parseOptions(["-o", "/tmp/t006-fixes/fake-smoke", "--budget-usd", "10"])).toMatchObject({
		out: "/tmp/t006-fixes/fake-smoke",
		budgetUsd: 10,
	});
	expect(() => parseOptions(["--runs", "0"])).toThrow();
	expect(() => parseOptions(["--budget", "NaN"])).toThrow();
	expect(() => parseOptions(["--unknown"])).toThrow();
	expect(() => loadModels(undefined, ["google/gemini-4-hydrogen"], false)).toThrow("UNKNOWN_MODEL");
	expect(loadModels(undefined, undefined, false)).toHaveLength(11);
});
it("fake mode executes the adapter/schema/guards five times and groups by model/category/language", async () => {
	const models = loadModels(undefined, undefined, false)
		.filter((m) => !m.categories && !m.sets)
		.slice(0, 2);
	const artifact = await runBenchmark({ models, cases: cases.slice(0, 1), runs: 5, budgetUsd: 5, fake: true });
	expect(artifact.calls).toHaveLength(10);
	expect(artifact.calls.every((c) => c.schemaValid && c.inputTokens !== null && c.costMicros !== null)).toBe(true);
	expect(artifact.calls.some((c) => c.guardAccepted)).toBe(true);
	expect(scoreBenchmark(artifact.calls).filter((g) => g.dimension === "model")).toHaveLength(2);
	expect(artifact.calls.every((c) => c.promptDigest.length === 64 && c.inputDigest.length === 64)).toBe(true);
});
it("dry run estimates the same call count without invoking an inference transport", () => {
	const estimate = estimateBenchmark(loadModels(undefined, undefined, false), cases, 3);
	expect(estimate.calls).toBe(11 * cases.length * 3);
	expect(estimate.upperBoundUsd).toBeGreaterThan(0);
});
it("aborts before the first unaffordable request", async () => {
	const artifact = await runBenchmark({
		models: loadModels(undefined, undefined, false),
		cases: cases.slice(0, 1),
		runs: 5,
		budgetUsd: 0.000001,
		fake: true,
	});
	expect(artifact.calls).toHaveLength(0);
	expect(artifact.stopReason).toBe("BUDGET_LIMIT");
});
it("reports independent model disagreement, accepted inventions, p50/p95 and session costs", async () => {
	const artifact = await runBenchmark({
		models: loadModels(undefined, undefined, false).slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 3,
		budgetUsd: 5,
		fake: true,
	});
	const calls = artifact.calls.map((c, i) => ({
		...c,
		latencyMs: required([10, 20, 100][i]),
		costMicros: 100,
		guardAccepted: true,
		verifierAccepted: true,
		score: {
			caseId: c.caseId,
			unsupportedClaims: i === 0 ? ["30%"] : [],
			invalidEvidenceIds: [],
			lostFacts: [],
			unresolvedUnknowns: [],
		},
		outputDigest: i === 0 ? "a" : "b",
	}));
	expect(scoreBenchmark(calls).find((g) => g.dimension === "model")).toMatchObject({
		inventedAccepted: 1,
		disagreementCases: 1,
		p50Ms: 20,
		p95Ms: 100,
		costPerSessionUsd: 0.0001,
		pass: false,
	});
});
it("stops paid calls after unknown billing and preserves the reservation", async () => {
	const artifact = await runBenchmark({
		sessionConcurrency: 1,
		models: loadModels(undefined, undefined, false).slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 5,
		budgetUsd: 5,
		fake: false,
		key: "test-only",
		transport: () =>
			Promise.resolve(
				Response.json({
					id: "unknown",
					provider: "OpenAI",
					model: "test",
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: '{"proposals":[],"questions":[],"notes":[]}' },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
				}),
			),
	});
	expect(artifact.calls).toHaveLength(4);
	expect(artifact.stopReason).toBe("BILLING_UNKNOWN");
	expect(artifact.reservedUsd).toBeGreaterThan(0);
});

it("selects every approved synthetic reasoning variant independently", () => {
	expect(loadModels()).toHaveLength(11);
	expect(parseOptions(["--budget-usd", "8"]).budgetUsd).toBe(8);
	expect(loadModels(undefined, ["openai/gpt-6-luna"])).toHaveLength(5);
	expect(() => loadModels(undefined, ["google/gemini-4-hydrogen"])).toThrow("UNKNOWN_MODEL");
});
it("scores prompt-specific rejection for every session without disabling other variants", async () => {
	const models = loadModels(undefined, ["openai/gpt-6-luna"]).slice(0, 2);
	const corpus = cases.slice(0, 3);
	const supported = await runBenchmark({
		models: models.slice(0, 1),
		cases: corpus,
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	let sent = 0;
	const run = await runBenchmark({
		models,
		cases: corpus,
		runs: 1,
		budgetUsd: 5,
		fake: false,
		key: "test-only",
		previousCalls: supported.calls,
		transport: (_url, init) => {
			sent++;
			const body = JSON.parse(String(init?.body));
			expect(body.reasoning).toEqual({ effort: "medium", exclude: true });
			expect(body).not.toHaveProperty("temperature");
			expect(body).not.toHaveProperty("seed");
			return Promise.resolve(
				Response.json({ error: { message: "Unsupported reasoning effort", code: 400 } }, { status: 400 }),
			);
		},
	});
	expect(sent).toBe(3);
	expect(run.stopReason).toBeNull();
	expect(run.calls).toHaveLength(6);
	expect(run.modelStops).toEqual([]);
	expect(run.calls.find((c) => c.reasoning === "medium")).toMatchObject({
		outcome: "refusal",
		costMicros: 0,
		actualProvider: null,
	});
	const resumed = await runBenchmark({
		models,
		cases: corpus,
		runs: 1,
		budgetUsd: 5,
		fake: false,
		key: "test-only",
		previousCalls: run.calls,
		transport: () => {
			throw new Error("DO_NOT_CALL");
		},
	});
	expect(resumed.calls).toHaveLength(6);
	expect(resumed.stopReason).toBeNull();
});

it("deduplicates reasoning overrides without conflating variants", () => {
	const models = applyReasoning(loadModels(), ["low", "medium"]);
	expect(models).toHaveLength(6);
	expect(new Set(models.map((m) => JSON.stringify([m.model, m.provider, m.reasoning]))).size).toBe(6);
});

it("forecasts reasoning-inclusive output usage until smoke replaces estimates", () => {
	const estimate = estimateBenchmark(
		loadModels(undefined, ["openai/gpt-6-luna"]).filter((m) => m.model === "openai/gpt-6-luna"),
		cases.filter((c) => c.holdout && c.category === "wording"),
		3,
	);
	expect(estimate.perModel[1]?.estimatedUsd).toBeGreaterThan(estimate.perModel[0]?.estimatedUsd ?? Infinity);
});

it("stops mid-run at the explicit fee-inclusive budget before reserving a second pair", async () => {
	const models = loadModels().slice(0, 1);
	const corpus = cases.slice(0, 1);
	const first = await runBenchmark({ models, cases: corpus, runs: 1, fake: true, budgetUsd: 5 });
	const reserve = estimateBenchmark(models, corpus, 1).openRouterUpperBoundUsd * 5;
	const budgetUsd = reserve + required(first.calls[0]?.openRouterCostMicros ?? null) / 2e6;
	const run = await runBenchmark({ models, cases: corpus, runs: 2, fake: true, budgetUsd });
	expect(run.calls).toHaveLength(1);
	expect(run.stopReason).toBe("BUDGET_LIMIT");
	expect(run.reservedUsd).toBeLessThanOrEqual(budgetUsd);
});

it("records incomplete case/run coverage and interleaves variants before a hard budget stop", async () => {
	const models = loadModels().slice(0, 3);
	const corpus = cases.slice(0, 2);
	const reservations: number[] = [];
	let committed = 1000;
	const run = await runBenchmark({
		models,
		cases: corpus,
		runs: 20,
		fake: true,
		budgetUsd: 0.32,
		priorSpendMicros: 1000,
		onReserve: async (r) => {
			expect(committed + (r.reservedOpenRouterMicros ?? r.reservedMicros)).toBeLessThanOrEqual(320000);
			if (r.reservedMicros > 0) reservations.push(r.reservedMicros);
		},
		onCall: async (c) => {
			committed += required(c.openRouterCostMicros ?? null);
		},
	});
	expect(run.stopReason).toBe("BUDGET_LIMIT");
	expect(run.calls.length).toBeGreaterThan(3);
	expect(reservations).toHaveLength(run.calls.length);
	expect(run.reservedUsd).toBeLessThanOrEqual(0.32);
	expect(run.calls.slice(0, 6).map((c) => c.reasoning)).toEqual(["low", "medium", "high", "low", "medium", "high"]);
	const counts = models.map((m) => run.calls.filter((c) => c.reasoning === m.reasoning).length);
	expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
	expect(run.incomplete?.length).toBe(120 - run.calls.length);
	expect(run.incomplete).toContainEqual(
		expect.objectContaining({ caseId: corpus[1]?.id, runIndex: 19, reasoning: "high" }),
	);
});

it.each(["fake-response", "fake-verifier"])(
	"fake smoke isolates exhausted %s outages and keeps reservations until settlement",
	async (id) => {
		vi.useFakeTimers();
		const original = Response.json.bind(Response);
		let errors = 0;
		let reservations = 0;
		let settlements = 0;
		const raw: RawRecord[] = [];
		const spy = vi.spyOn(Response, "json").mockImplementation((data, init) => {
			if (data?.id === id && errors < 5) {
				errors++;
				return original(throttled429, init);
			}
			return original(data, init);
		});
		try {
			const models = loadModels().slice(0, 2);
			const corpus = smokeCases(cases, models);
			const pending = runBenchmark({
				sessionConcurrency: 1,
				models,
				cases: corpus,
				phase: "smoke",
				runs: 1,
				budgetUsd: 10,
				fake: true,
				onReserve: async (r) => {
					if (r.reservedMicros) reservations++;
				},
				onRaw: async (r) => {
					raw.push(r);
					if (JSON.parse(r.body).error) expect(reservations).toBe(settlements + 1);
				},
				onCall: async () => {
					settlements++;
				},
			});
			await vi.runAllTimersAsync();
			const run = await pending;
			expect(errors).toBe(5);
			expect(run.stopReason).toBeNull();
			expect(run.calls.length).toBeLessThanOrEqual(24);
			expect(run.incomplete).toEqual([]);
			expect(run.calls.filter((c) => c.outcome === "transient")).toHaveLength(0);
			expect(run.calls.filter((c) => c.verifierFault)).toHaveLength(0);
			expect(run.reservedUsd).toBeCloseTo(run.calls.reduce((n, c) => n + (c.openRouterCostMicros ?? 0), 0) / 1e6, 9);
			if (run.stopReason) expect(() => assessSmoke(run, models, corpus)).toThrow("SMOKE_INCOMPLETE");
			else expect(assessSmoke(run, models, corpus).every((v) => v.status === "accepted")).toBe(true);
			const group = identityMapping(run).scores.find(
				(g) => g.dimension === "model" && g.model === models[0]?.model && g.reasoning === models[0]?.reasoning,
			);
			expect(group).toMatchObject({
				transientProviderFailures: 0,
				schemaFailures: 0,
				verifierFaults: 0,
				emptyAnswers: 0,
				verifierRejections: 0,
			});
			expect(raw.filter((r) => JSON.parse(r.body).error)).toHaveLength(5);
		} finally {
			spy.mockRestore();
			vi.useRealTimers();
		}
	},
);
