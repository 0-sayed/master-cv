import { expect, it, vi } from "vite-plus/test";
import { forecastFromSmoke } from "./forecast";
import { syntheticUsageFixture } from "./synthetic-test-fixtures";

it("reforecasts synthetic Azure usage as separate BYOK and OpenRouter projections", async () => {
	const smoke = await syntheticUsageFixture();
	const forecast = forecastFromSmoke(
		smoke,
		loadModels(),
		cases.filter((c) => !c.exploratory),
	);
	expect(forecast.openRouter.expectedTotalUsd).toBeGreaterThan(0);
	expect(forecast.openai.expectedTotalUsd).toBeGreaterThan(0);
	expect(forecast.expectedTotalUsd).toBeCloseTo(
		forecast.openRouter.expectedTotalUsd + forecast.openai.expectedTotalUsd,
	);
	expect(forecast.minimumBudgetUsd).toBe(forecast.openRouter.minimumBudgetUsd);
	expect(forecast.minimumOpenaiBudgetUsd).toBe(forecast.openai.minimumBudgetUsd);
});
import { reviewVerifierPolicy as productionPolicy } from "@reactive-resume/api/features/ai/verifier-policy";
import { realAiConfig } from "../../local/real-ai-config";
import { loadModels, parseOptions } from "./config";
import { cases } from "./corpus";
import { reviewVerifierPolicy } from "./production";
import { required } from "./required";
import { runBenchmark, estimateBenchmark } from "./runner";

it("records billed BYOK transient attempts and carries both ledgers across restart", async () => {
	const options = {
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 1,
		openaiBudgetUsd: 1,
	};
	const baseline = await runBenchmark(options);
	const json = Response.json.bind(Response);
	let injected = false;
	vi.useFakeTimers();
	const spy = vi.spyOn(Response, "json").mockImplementation((body, init) => {
		if (body?.id === "fake-response" && !injected) {
			injected = true;
			return json(
				{
					error: {
						code: 429,
						message: "temporarily rate-limited upstream",
						metadata: { error_type: "rate_limit_exceeded" },
					},
					usage: { cost: 0.000002, cost_details: { upstream_inference_cost: 0.000003 } },
				},
				init,
			);
		}
		return json(body, init);
	});
	try {
		const pending = runBenchmark(options);
		await vi.runAllTimersAsync();
		const result = await pending;
		const call = required(result.calls[0]);
		const original = required(baseline.calls[0]);
		expect(result.stopReason).toBeNull();
		expect(call.openaiCostMicros).toBe(required(original.openaiCostMicros) + 3);
		expect(call.openRouterCostMicros).toBe(required(original.openRouterCostMicros) + 2);
		const resumed = await runBenchmark({ ...options, previousCalls: result.calls });
		expect(resumed.reservedUsd).toBe(result.reservedUsd);
		expect(resumed.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
	} finally {
		spy.mockRestore();
		vi.useRealTimers();
	}
});

it("holds each payer's unsettled reservation and includes carried OpenAI smoke spend", async () => {
	const options = {
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 1,
		openaiBudgetUsd: 1,
	};
	const pending = await runBenchmark({
		...options,
		pendingReservations: [
			{ key: "crashed", reservedMicros: 30, reservedOpenRouterMicros: 10, reservedOpenaiMicros: 20 },
		],
	});
	expect(pending.stopReason).toBe("PENDING_BILLING");
	expect(pending.reservedUsd).toBe(0.00001);
	expect(pending.reservedOpenaiUsd).toBe(0.00002);
	const carried = await runBenchmark({ ...options, priorOpenaiSpendMicros: 1000000 });
	expect(carried.calls).toHaveLength(0);
	expect(carried.stopReason).toBe("OPENAI_BUDGET_LIMIT");
	expect(carried.reservedOpenaiUsd).toBe(1);
});

it("pins benchmark OpenAI writers and verifier while production remains Azure", () => {
	const models = loadModels();
	expect(models.filter((m) => m.model.startsWith("openai/")).map((m) => m.provider)).toEqual(
		Array.from({ length: 9 }, () => "openai"),
	);
	expect(reviewVerifierPolicy("deepseek/deepseek-v4.1-flash-1017").downstreamProvider).toBe("openai");
	expect(productionPolicy("deepseek/deepseek-v4.1-flash-1017").downstreamProvider).toBe("azure");
	expect(realAiConfig({ OPENROUTER_API_KEY: "synthetic" }).route.downstreamProvider).toBe("azure");
	expect(parseOptions([]).openaiBudgetUsd).toBe(10);
	expect(parseOptions(["--openai-budget-usd", "2"]).openaiBudgetUsd).toBe(2);
	expect(() => parseOptions(["--openai-budget-usd", "NaN"])).toThrow();
});
it("accounts for BYOK independently and releases both reservations", async () => {
	const result = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 1,
		openaiBudgetUsd: 1,
	});
	expect(result.stopReason).toBeNull();
	const call = required(result.calls[0]);
	expect(call.actualProvider).toBe("OpenAI");
	expect(call.openaiCostMicros).toBeGreaterThan(0);
	expect(call.openRouterCostMicros).toBeGreaterThan(0); // Together verifier
	expect(call.costMicros).toBe(required(call.openaiCostMicros ?? null) + required(call.openRouterCostMicros ?? null));
	expect(result.reservedUsd).toBe(required(call.openRouterCostMicros ?? null) / 1e6);
	expect(result.reservedOpenaiUsd).toBe(required(call.openaiCostMicros ?? null) / 1e6);
});
it("checks each payer's worst-case budget before making any request", async () => {
	for (const caps of [
		{ budgetUsd: 1, openaiBudgetUsd: 0.000001 },
		{ budgetUsd: 0.000001, openaiBudgetUsd: 1 },
	]) {
		let requests = 0;
		const result = await runBenchmark({
			models: loadModels().slice(0, 1),
			cases: cases.slice(0, 1),
			runs: 1,
			fake: false,
			key: "synthetic",
			...caps,
			transport: () => {
				requests++;
				throw new Error("UNEXPECTED_NETWORK");
			},
		});
		expect(requests).toBe(0);
		expect(result.stopReason).toBe(caps.openaiBudgetUsd < 1 ? "OPENAI_BUDGET_LIMIT" : "BUDGET_LIMIT");
	}
	const forecast = estimateBenchmark(loadModels(), cases.slice(0, 1), 1);
	expect(forecast.openRouterEstimatedUsd).toBeGreaterThan(0);
	expect(forecast.openaiEstimatedUsd).toBeGreaterThan(0);
	expect(forecast.estimatedUsd).toBeCloseTo(forecast.openRouterEstimatedUsd + forecast.openaiEstimatedUsd);
});

it("omits ZDR only at the benchmark BYOK boundary and retains independent unknown billing", async () => {
	const { executeApprovedStep, withAiRuntime } = await import("./production");
	const { executeApprovedStep: productionStep } = await import("@reactive-resume/api/features/ai/adapter");
	const { z } = await import("zod");
	for (const provider of ["openai", "azure", "together", "google-vertex/global"]) {
		for (const upstream of [0.00002, undefined]) {
			let sent: { provider: Record<string, unknown> } = { provider: {} };
			const input = {
				route: {
					...realAiConfig({ OPENROUTER_API_KEY: "synthetic" }).route,
					routeId: "a02-benchmark",
					downstreamProvider: provider,
				},
				operationId: "test",
				attemptId: "1",
				stepId: "1",
				payload: { selections: [{ section: "summary" as const, text: "Synthetic" }] },
				outputSchema: z.object({ text: z.string() }),
				signal: new AbortController().signal,
			};
			const runtime = {
				routes: [],
				handlers: {},
				workerAvailable: false,
				fetch: async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
					sent = JSON.parse(String(init?.body));
					return Response.json({
						id: "offline",
						provider,
						choices: [{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" }],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 20,
							cost: 0,
							cost_details: { upstream_inference_cost: upstream },
						},
					});
				},
			};
			const result = await withAiRuntime(runtime, () => executeApprovedStep(input));
			expect(sent.provider).toMatchObject({
				only: [provider],
				allow_fallbacks: false,
				require_parameters: true,
				data_collection: "deny",
			});
			if (provider === "openai") {
				expect(sent.provider).not.toHaveProperty("zdr");
				expect(result.openaiCostMicros).toBe(upstream === undefined ? null : 20);
				expect(result.costMicros).toBe(upstream === undefined ? null : 20);
			} else expect(sent.provider.zdr).toBe(true);
			// Calling the actual production adapter always retains ZDR, even with the same input.
			await withAiRuntime(runtime, () => productionStep(input));
			expect(sent.provider.zdr).toBe(true);
		}
	}
});
