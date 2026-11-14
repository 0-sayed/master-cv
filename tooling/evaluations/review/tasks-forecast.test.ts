import { expect, it } from "vite-plus/test";
import { assertStudyForecast } from "./budget";
import { loadModels } from "./config";
import { loadTaskFixtures } from "./contracts/fixtures";
import * as forecast from "./forecast";
import { estimateBenchmark, runBenchmark } from "./runner";
import { loadStudyCases, smokeCases } from "./study";
import { syntheticUsageFixture } from "./synthetic-test-fixtures";

const cases = loadTaskFixtures([new URL("./contracts/cover-letter/tuning.json", import.meta.url).pathname]);
it("routes forecast notices to the artifact reporter before rejecting an over-budget full run", () => {
	const notices: string[] = [];
	expect(() => assertStudyForecast(6, 100000, 5, (text) => notices.push(text))).toThrow("CALIBRATED_FORECAST_LIMIT");
	expect(notices).toHaveLength(1);
	expect(notices[0]).toContain("full $6.000000 + smoke $0.100000");
});
it("forecast is a ceiling from fixture/gold tokens × caps with measured core verifier costs and a separate verifier catalog", async () => {
	expect(forecast.forecastTasksFromCore).toBeTypeOf("function");
	const core = await syntheticUsageFixture();
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const projected = forecast.forecastTasksFromCore(core, models, cases, 3);
	expect(projected.kind).toBe("ceiling");
	expect(projected.calls).toBe(189);
	expect(projected.measuredCoreVerifierSamples).toBeGreaterThan(0);
	expect(
		projected.perCase.some((p) => p.verifier.model.startsWith("deepseek/") && p.verifier.reasoning === "low"),
	).toBe(true);
	for (const item of projected.perCase) {
		expect(item.writer.goldTokens).toBeGreaterThan(0);
		expect(item.writer.completionCap).toBeGreaterThanOrEqual(item.writer.visibleCap);
		expect(item.verifier.outputCeilingTokens).toBeGreaterThanOrEqual(item.verifier.observedCoreOutputTokens);
		expect(item.ceilingMicros).toBeGreaterThanOrEqual(item.tokenProjectionMicros);
	}
	const bounds = estimateBenchmark(models, cases, 3);
	expect(projected.openaiCeilingUsd).toBeGreaterThanOrEqual(bounds.openaiUpperBoundUsd);
	expect(projected.openRouterCeilingUsd).toBeGreaterThanOrEqual(bounds.openRouterUpperBoundUsd);
	expect(() => forecast.forecastTasksFromCore({ ...core, mode: "fake" }, models, cases)).toThrow(
		"MEASURED_CORE_REQUIRED",
	);
	expect(() => forecast.forecastTasksFromCore({ ...core, calls: [] }, models, cases)).toThrow(
		"FORECAST_CORE_VERIFIER_MISSING",
	);
});

it("high-effort Terra reservations fit explicit payer budgets at smoke concurrency", async () => {
	const models = loadModels().filter((m) => m.model === "openai/gpt-6.1-terra" && m.reasoning === "high");
	const bounds = estimateBenchmark(models, cases, 1);
	const run = await runBenchmark({
		models,
		cases,
		runs: 1,
		fake: true,
		sessionConcurrency: 8,
		openaiConcurrency: 4,
		maxUnverified: 4,
		budgetUsd: bounds.openRouterUpperBoundUsd,
		openaiBudgetUsd: bounds.openaiUpperBoundUsd,
	});
	expect(run.stopReason).toBeNull();
	expect(run.calls).toHaveLength(9);
	expect(run.reservedOpenaiUsd).toBeLessThanOrEqual(bounds.openaiUpperBoundUsd);
});

it("makes progress through all smoke sessions within $13/$40 including concurrent five-attempt reservations", async () => {
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const cases = smokeCases(loadStudyCases("tasks-v1"), models);
	let routerHeld = 0;
	let openaiHeld = 0;
	let peakRouter = 0;
	let peakOpenai = 0;
	const run = await runBenchmark({
		models,
		cases,
		phase: "smoke",
		runs: 1,
		fake: true,
		sessionConcurrency: 8,
		openaiConcurrency: 4,
		togetherConcurrency: 4,
		budgetUsd: 13,
		openaiBudgetUsd: 40,
		// Reserve a conservative proxy for the preceding canaries before buying writers.
		priorSpendMicros: 1_000_000,
		priorOpenaiSpendMicros: 1_000_000,
		onReserve: (r) => {
			routerHeld += r.reservedOpenRouterMicros ?? 0;
			openaiHeld += r.reservedOpenaiMicros ?? 0;
			peakRouter = Math.max(peakRouter, routerHeld);
			peakOpenai = Math.max(peakOpenai, openaiHeld);
			return Promise.resolve();
		},
		onCall: (c) => {
			routerHeld -= c.reservedOpenRouterMicros ?? 0;
			openaiHeld -= c.reservedOpenaiMicros ?? 0;
			return Promise.resolve();
		},
	});
	expect(run.stopReason).toBeNull();
	expect(run.calls).toHaveLength(126);
	expect(peakRouter + 1_000_000).toBeLessThanOrEqual(13_000_000);
	expect(peakOpenai + 1_000_000).toBeLessThanOrEqual(40_000_000);
	expect(peakRouter).toBeGreaterThan(0);
	expect(peakOpenai).toBeGreaterThan(0);
});

it("defaults the tasks forecast to two runs and separates proxy costs by payer", async () => {
	const core = await syntheticUsageFixture();
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const p = forecast.forecastTasksFromCore(core, models, cases);
	expect(p.runs).toBe(2);
	expect(p.calls).toBe(126);
	expect(p.openRouterProxyUsd).toBeGreaterThan(0);
	expect(p.openaiProxyUsd).toBeGreaterThan(0);
	expect(p.tokenProjectionUsd).toBeCloseTo(p.openRouterProxyUsd + p.openaiProxyUsd, 6);
	expect(p.openRouterCeilingUsd).toBeGreaterThanOrEqual(p.openRouterProxyUsd);
	expect(p.openaiCeilingUsd).toBeGreaterThanOrEqual(p.openaiProxyUsd);
});
