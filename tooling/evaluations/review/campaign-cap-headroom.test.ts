import { expect, it } from "vite-plus/test";
import { withOpenRouterFee } from "./budget";
import { planJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { measuredForecast } from "./measured-forecast";
import { runBenchmark, routeFor } from "./runner";
import { loadStudyCases } from "./study";
import { verifierBound } from "./verifier";
it("fits all sixteen session holds and eight canary holds under the owner caps without trading away provider parallelism", async () => {
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const cases = loadStudyCases("tasks-v1");
	const result = await runBenchmark({
		models,
		cases,
		runs: 1,
		phase: "smoke",
		fake: true,
		budgetUsd: 10,
		openaiBudgetUsd: 10,
	});
	expect(result.stopReason).toBeNull();
	expect(result.calls).toHaveLength(54);
	const router = Math.max(...result.calls.map((c) => c.reservedOpenRouterMicros ?? 0)) / 1e6;
	const openai = Math.max(...result.calls.map((c) => c.reservedOpenaiMicros ?? 0)) / 1e6;
	const smoke = measuredForecast(models, cases, 1, "smoke");
	const full = measuredForecast(models, cases, 3, "full");
	expect(16 * router + 1.25 * smoke.openRouterUsd).toBeLessThan(10);
	expect(16 * openai + 1.25 * smoke.openaiUsd).toBeLessThan(10);
	expect(16 * router + smoke.openRouterUsd + 1.25 * full.openRouterUsd).toBeLessThan(40);
	expect(16 * openai + smoke.openaiUsd + 1.25 * full.openaiUsd).toBeLessThan(15);
	const canary =
		Math.max(
			...planJudgeCanaries(models).map((p) =>
				withOpenRouterFee(verifierBound(p.model, p.c, routeFor(p.model, "unused", true, p.c)).micros * 3),
			),
		) / 1e6;
	expect(8 * canary + 1.25 * smoke.openRouterUsd).toBeLessThan(10);
});
