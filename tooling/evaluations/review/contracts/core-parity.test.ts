import { createHash } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { loadModels } from "../config";
import { cases } from "../corpus";
import { runBenchmark } from "../runner";
import { smokeCases } from "../study";

it("old categories byte-identical", async () => {
	const raw: unknown[] = [];
	const artifact = await runBenchmark({
		models: loadModels(),
		cases: smokeCases(cases),
		phase: "smoke",
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		sessionConcurrency: 1,
		onRaw: async ({ latencyMs: _latencyMs, ...record }) => {
			raw.push(record);
		},
	});
	expect(artifact.stopReason).toBeNull();
	expect(artifact.calls).toHaveLength(132);
	const calls = artifact.calls.map(({ id: _id, latencyMs: _latencyMs, ...call }) => call);
	const hash = createHash("sha256").update(JSON.stringify({ raw, calls })).digest("hex");
	expect(hash).toBe("81ad82002eec450c3c781ce226fe99b2735ec6af8623c55e6de0aee95a15b48c");
});
