import { expect, it } from "vite-plus/test";
import snapshot from "./catalog-snapshot.json";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { checkEffortGrid } from "./effort-grid";
import { forecastFromSmoke } from "./forecast";
import plan from "./forecast.json";
import { renderReport } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { syntheticUsageFixture } from "./synthetic-test-fixtures";
import { vertexFixture } from "./vertex-test-fixture";

it("uses equal visible allowances with effort-scaled request caps and records them in the report", async () => {
	const base = required(loadModels().find((m) => m.model === "openai/gpt-6-luna"));
	const models = (["none", "low", "medium", "high", "xhigh"] as const).map((reasoning) => ({ ...base, reasoning }));
	const result = await runBenchmark({
		models,
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 9,
		openaiBudgetUsd: 40,
	});
	expect(result.stopReason).toBeNull();
	expect(result.calls.map((c) => c.writerCompletionTokenCap)).toEqual([2048, 2560, 4096, 10240, 40960]);
	expect(result.calls.every((c) => c.verifierCompletionTokenCap === 5120)).toBe(true);
	const html = await renderReport(result);
	expect(html).toContain("xhigh: 40,960");
	expect(html).toContain("verifier low: 5,120");
});

it("labels unmeasured efforts and scales only writer completion tokens, preserving the verifier", async () => {
	const models = loadModels();
	const luna = required(models.find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "high"));
	const smoke = await syntheticUsageFixture();
	const projection = forecastFromSmoke(
		smoke,
		models,
		cases.filter((c) => !c.exploratory),
	);
	const high = required(projection.perVariant.find((v) => v.model === luna.model && v.reasoning === "high"));
	const xhigh = required(projection.perVariant.find((v) => v.reasoning === "xhigh"));
	expect(xhigh.sourceEffort).toBe("high");
	expect(xhigh.writerOutputScale).toBe(4);
	expect(xhigh.writerCompletionTokenCap).toBe(40960);
	expect(xhigh.verifierCompletionTokenCap).toBe(5120);
	expect(xhigh.openRouterPairCostsMicros).toEqual(high.openRouterPairCostsMicros);
	expect(xhigh.openaiPairCostsMicros[0]).toBeGreaterThan(required(high.openaiPairCostsMicros[0]));
});

it("checks effort support, mandatory reasoning and caps against pinned public metadata", async () => {
	const base = vertexFixture;
	const checked = await checkEffortGrid(
		[
			{ ...base, reasoning: "medium" },
			{ ...base, reasoning: "none" },
		],
		snapshot,
	);
	expect(checked.models.map((m) => m.reasoning)).toEqual(["medium"]);
	expect(checked.dropped).toMatchObject([{ model: base.model, reasoning: "none", reason: "UNSUPPORTED_EFFORT" }]);
	const unsupported = structuredClone(snapshot);
	const endpoint = required(unsupported.endpoints.find((e) => e.body.data.id === base.model));
	const pinned = required(endpoint.body.data.endpoints.find((e) => e.tag === base.providerEndpoint));
	pinned.max_completion_tokens = 3000;
	const capped = await checkEffortGrid([{ ...base, reasoning: "medium" }], unsupported);
	expect(capped.models).toHaveLength(0);
	expect(capped.dropped[0]?.reason).toBe("OUTPUT_LIMIT_UNSUPPORTED");
});

it("keeps all retained variants and repetitions with measured payer forecasts after the owner drops Hydrogen", () => {
	expect(loadModels()).toHaveLength(11);
	expect(plan.runs).toBe(3);
	expect(plan.repetitionsReduced).toBe(false);
	expect(plan.dropped).toEqual([
		{
			model: "google/gemini-4-hydrogen",
			provider: "google-vertex",
			reason: "OWNER_COST_LATENCY_LEGAL_2026_11_13",
		},
	]);
	expect(plan.smokeSessions).toBe(132);
	expect(plan.fullSessions).toBe(2772);
	expect(plan.calibrationEligible).toBe(false);
	expect(plan.perVariant.map(({ model, provider, reasoning }) => [model, provider, reasoning])).toEqual(
		loadModels().map(({ model, provider, reasoning }) => [model, provider, reasoning]),
	);
	expect(plan.perVariant.every((v) => v.samples > 0 && v.fullSessions === 252 && v.smokeSessions === 12)).toBe(true);
	expect(plan.openRouter.minimumBudgetUsd).toBeLessThan(9);
	expect(plan.openai.minimumBudgetUsd).toBeLessThan(40);
});
