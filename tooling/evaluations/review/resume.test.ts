import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { createRepairPlan } from "./repair";
import { runBenchmark, type RawRecord } from "./runner";
import { syntheticRepairFixture } from "./synthetic-test-fixtures";

it("retries nine synthetic legacy OpenAI extraction rejections under an explicit identity repair and reuses settled wording", async () => {
	const source = await syntheticRepairFixture();
	const history = source.history;
	const latest = [...new Map(history.previousCalls.map((c) => [c.key, c])).values()];
	const repairPlan = createRepairPlan(source.manifest, source.history);
	const rejected = latest.filter((c) => c.outcome === "unsupported");
	expect(rejected).toHaveLength(9);
	const raw: RawRecord[] = [];
	const result = await runBenchmark({
		models: loadModels().filter((m) => m.provider === "openai"),
		cases: cases.filter((c) => c.id === "r2-h01-extraction"),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		repairPlan,
		previousCalls: history.previousCalls,
		rawRecords: history.rawRecords,
		onRaw: async (r) => {
			raw.push(r);
		},
	});
	expect(result.stopReason).toBeNull();
	expect(
		raw
			.filter((r) => !r.key.endsWith(":verify"))
			.map((r) => r.key)
			.sort(),
	).toEqual(rejected.map((c) => c.key).sort());
	for (const paid of latest.filter((c) => c.costMicros !== 0 && c.category !== "extraction")) {
		expect(result.calls.find((c) => c.key === paid.key)).toEqual(paid);
	}
	expect(result.calls).toHaveLength(latest.length);
	expect(result.calls.filter((c) => c.outcome === "unsupported")).toEqual([]);
	let secondSends = 0;
	const again = await runBenchmark({
		models: loadModels().filter((m) => m.provider === "openai"),
		cases: cases.filter((c) => c.id === "r2-h01-extraction"),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		repairPlan,
		previousCalls: result.calls,
		rawRecords: [...history.rawRecords, ...raw],
		onRaw: async () => {
			secondSends++;
		},
	});
	expect(secondSends).toBe(0);
	expect(again.calls).toEqual(result.calls);
	expect(again.reservedUsd).toBe(result.reservedUsd);
	expect(again.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
});

it("refuses a changed session identity without an explicit audited repair", async () => {
	const source = await syntheticRepairFixture();
	const rejected = source.history.previousCalls.find((c) => c.outcome === "unsupported");
	if (!rejected) throw new Error("fixture");
	await expect(
		runBenchmark({
			models: source.manifest.models.filter((m) => m.model === rejected.model && m.reasoning === rejected.reasoning),
			cases: cases.filter((c) => c.id === rejected.caseId),
			runs: 1,
			fake: true,
			budgetUsd: 100,
			previousCalls: [rejected],
			onRaw: async () => {
				throw new Error("MUST_NOT_SEND");
			},
		}),
	).rejects.toThrow("SESSION_IDENTITY_MISMATCH");
});

it("treats a verifier schema 400 as a global request fault, including absent provider identity", async () => {
	const raws: RawRecord[] = [];
	const models = loadModels().filter((m) => m.provider === "together");
	await runBenchmark({
		models,
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		onRaw: async (raw) => {
			raws.push(raw);
		},
	});
	const writer = raws.find((r) => !r.key.endsWith(":verify"));
	if (!writer) throw new Error("fixture");
	let sends = 0;
	const result = await runBenchmark({
		models,
		cases: cases.slice(0, 2),
		runs: 1,
		fake: false,
		key: "synthetic",
		budgetUsd: 100,
		sessionConcurrency: 1,
		transport: async () => {
			sends++;
			return sends === 1
				? new Response(writer.body, { status: 200 })
				: Response.json(
						{
							error: {
								code: 400,
								message: "invalid_json_schema",
								metadata: { provider_error_code: "invalid_json_schema" },
							},
						},
						{ status: 400 },
					);
		},
	});
	expect(result.stopReason).toBe("REQUEST_SCHEMA_ERROR");
	expect(result.calls[0]?.outcome).toBe("REQUEST_SCHEMA_ERROR");
	expect(result.calls[0]?.verifierFault).toBeNull();
	expect(sends).toBe(3);
});

it("retains an unresolved positive reservation without buying a replacement", async () => {
	let sends = 0;
	const result = await runBenchmark({
		models: loadModels(),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		pendingReservations: [{ key: "interrupted", reservedMicros: 500 }],
		onRaw: async () => {
			sends++;
		},
	});
	expect(result.stopReason).toBe("PENDING_BILLING");
	expect(sends).toBe(0);
});
it("stops globally on a writer request-schema 400 and stays stopped on unchanged resume", async () => {
	let sends = 0;
	const options = {
		models: loadModels().slice(0, 2),
		cases: cases.slice(0, 2),
		runs: 1,
		fake: false,
		key: "synthetic",
		budgetUsd: 10,
		sessionConcurrency: 1,
		transport: async () => {
			sends++;
			return Response.json(
				{
					error: {
						code: 400,
						message: "invalid_json_schema",
						metadata: { provider_error_code: "invalid_json_schema" },
					},
				},
				{ status: 400 },
			);
		},
	};
	const first = await runBenchmark(options);
	expect(first.stopReason).toBe("REQUEST_SCHEMA_ERROR");
	expect(first.calls[0]?.outcome).toBe("REQUEST_SCHEMA_ERROR");
	expect(first.modelStops).toEqual([]);
	expect(sends).toBe(2);
	const resumed = await runBenchmark({ ...options, previousCalls: first.calls });
	expect(resumed.stopReason).toBe("REQUEST_SCHEMA_ERROR");
	expect(sends).toBe(2);
});
it("persists raw generation before scoring and skips completed keys on restart", async () => {
	const events: string[] = [];
	const raw: RawRecord[] = [];
	const options = { models: loadModels().slice(0, 1), cases: cases.slice(0, 1), runs: 1, fake: true, budgetUsd: 5 };
	const first = await runBenchmark({
		...options,
		onRaw: async (r) => {
			events.push("raw");
			raw.push(r);
		},
		onCall: async () => {
			events.push("score");
		},
	});
	expect(events).toEqual(["raw", "raw", "score"]);
	expect(first.calls[0]?.generationId).toBeTruthy();
	expect(first.calls[0]?.fixtureHash).toHaveLength(64);
	let sends = 0;
	const resumed = await runBenchmark({
		...options,
		previousCalls: first.calls,
		rawRecords: raw,
		onRaw: async () => {
			sends++;
		},
	});
	expect(resumed.calls).toHaveLength(1);
	expect(sends).toBe(0);
	expect(resumed.reservedUsd).toBe(first.reservedUsd);
	const replay = await runBenchmark({
		...options,
		rawRecords: raw,
		onRaw: async () => {
			sends++;
		},
	});
	expect(replay.calls).toHaveLength(1);
	expect(sends).toBe(0);
	expect(replay.calls[0]?.key).toBe(first.calls[0]?.key);
});
it("aborts immediately on a returned-provider mismatch", async () => {
	const run = await runBenchmark({
		sessionConcurrency: 1,
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 5,
		fake: false,
		key: "test",
		budgetUsd: 5,
		transport: () =>
			Promise.resolve(
				Response.json({
					id: "wrong",
					provider: "azure",
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: '{"proposals":[],"questions":[],"notes":[]}' },
							finish_reason: "stop",
						},
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 10,
						cost: 0.000001,
						cost_details: { upstream_inference_cost: 0.000001 },
					},
				}),
			),
	});
	expect(run.calls).toHaveLength(1);
	expect(run.stopReason).toBe("PROVIDER_MISMATCH");
});
it("retains every unhealthy-model session and holds ambiguous pending reservations", async () => {
	const run = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 4),
		runs: 3,
		fake: false,
		key: "test",
		budgetUsd: 5,
		transport: () =>
			Promise.resolve(
				Response.json({
					id: "bad",
					provider: "OpenAI",
					choices: [{ index: 0, message: { role: "assistant", content: "{}" }, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 10,
						cost: 0.000001,
						cost_details: { upstream_inference_cost: 0.000001 },
					},
				}),
			),
	});
	expect(run.calls).toHaveLength(12);
	expect(run.modelStops).toEqual([]);
	const pending = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 5,
		pendingReservations: [{ key: "pending", reservedMicros: 500 }],
	});
	expect(pending.stopReason).toBe("PENDING_BILLING");
	expect(pending.calls).toHaveLength(0);
	expect(pending.reservedUsd).toBe(0.0005);
});
it("includes smoke spending in the full-stage cap before sending", async () => {
	const run = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 0.01,
		priorSpendMicros: 10000,
	});
	expect(run.calls).toHaveLength(0);
	expect(run.stopReason).toBe("BUDGET_LIMIT");
	expect(run.reservedUsd).toBe(0.01);
});
it("keeps provider mismatch and unknown billing aborts in force after restart", async () => {
	const options = { models: loadModels().slice(0, 1), cases: cases.slice(0, 1), runs: 2, fake: true, budgetUsd: 5 };
	const first = await runBenchmark({ ...options, runs: 1 });
	const call = first.calls[0];
	if (!call) throw new Error("missing fixture call");
	let sends = 0;
	for (const [patch, reason] of [
		[{ actualProvider: "azure" }, "PROVIDER_MISMATCH"],
		[
			{ costMicros: null, openaiCostMicros: null, reservedOpenaiMicros: 50001, unknownExposureMicros: 50001 },
			"BILLING_UNKNOWN",
		],
	] as const) {
		const resumed = await runBenchmark({
			...options,
			previousCalls: [{ ...call, ...patch }],
			onRaw: async () => {
				sends++;
			},
		});
		expect(resumed.stopReason).toBe(reason);
		expect(resumed.calls).toHaveLength(1);
	}
	expect(sends).toBe(0);
});
