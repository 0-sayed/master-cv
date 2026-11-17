import { createHash } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { loadModels } from "../config";
import { cases } from "../corpus";
import { runBenchmark } from "../runner";
import { smokeCases } from "../study";

it("core categories retain their approved deterministic receipt", async () => {
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
	// Judgment receipts now include timings too. Keep all receipt fields except elapsed time.
	const hash = createHash("sha256")
		.update(JSON.stringify({ raw, calls }, (key, value) => (key === "latencyMs" ? undefined : value)))
		.digest("hex");
	// Shared guard v11 and the authorized per-attempt billing ledger define this receipt.
	expect(hash).toBe("d19d350b874a422888a48585a4ba94d6b07a73331385e73fdc1a8a108e145f29");
});
