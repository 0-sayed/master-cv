import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { loadModels } from "./config";
import { prepareCase } from "./execution";
import { measuredForecast, estimatedWriterInputTokens } from "./measured-forecast";
import { required } from "./required";
import { loadStudyCases } from "./study";

it("prices wire input without charging for local snapshot or Zod implementation metadata", () => {
	const prepared = prepareCase(required(loadStudyCases("tasks-v1")[0]));
	const wire = {
		system: prepared.handler.systemPrompt,
		payload: prepared.payload,
		schema: z.toJSONSchema(prepared.handler.output, { unrepresentable: "any" }),
	};
	const expected = Math.ceil(Buffer.byteLength(JSON.stringify(wire)) / 3);
	expect(estimatedWriterInputTokens(prepared)).toBe(expected);
	const withLocalMetadata = { ...prepared, snapshot: { evidence: [{ text: "local only".repeat(10_000) }] } };
	expect(estimatedWriterInputTokens(withLocalMetadata)).toBe(expected);
});

it("prices 72 probes with rejection-only votes and separates writer charges", () => {
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const result = measuredForecast(models, loadStudyCases("tasks-v1"), 1, "smoke");
	expect(result.sessions).toBe(54);
	expect(result.canaryProbes).toBe(72);
	expect(result.canaryJudgments).toBe(131);
	expect(result.canaryOpenRouterUsd).toBeCloseTo(0.5416462259594341, 8);
	expect(result.extraJudgeCalls).toBeGreaterThan(0);
	expect(result.sequentialWallTimeHours).toBeGreaterThan(0);
	expect(result.openRouterUsd).toBeGreaterThan(result.canaryOpenRouterUsd);
	expect(result.openaiUsd).toBeGreaterThan(0);
});

it("buys only untouched holdouts for the full stage", () => {
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const result = measuredForecast(models, loadStudyCases("tasks-v1"), 3, "full");
	expect(result.sessions).toBe(1944);
	expect(result.canaryProbes).toBe(0);
});

it("forecasts the two provider pipelines with warmup headroom without changing measured costs", () => {
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const cases = loadStudyCases("tasks-v1");
	const first = measuredForecast(models, cases, 1, "smoke");
	expect(first.parallelism).toMatchObject({ sessions: 16, openai: 8, together: 8, canaries: 8 });
	expect(first.parallelWallTimeHours).toBeLessThan(first.sequentialWallTimeHours);
	expect(first.parallelWallTimeHours).toBeGreaterThan(first.sequentialWallTimeHours / 16);
});
