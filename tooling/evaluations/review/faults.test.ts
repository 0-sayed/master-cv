import { expect, it } from "vite-plus/test";
import { afterEach, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { createFaultTransport, faultNames } from "./faults";
import { required } from "./required";
import { runBenchmark } from "./runner";
it("uses unique fake generation IDs and independent payer receipts", async () => {
	const fake = createFaultTransport({ fault: "none", role: "writer", session: 3 });
	const model = required(loadModels()[0]);
	for (let i = 0; i < 2; i++)
		await fake.transport(
			"https://openrouter.ai/api/v1/chat/completions",
			{},
			async () =>
				Response.json({
					id: "legacy",
					provider: "OpenAI",
					usage: { cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.00001 } },
				}),
			{ key: String(i), role: "writer", model },
		);
	expect(new Set(fake.receipts.map((r) => r.id)).size).toBe(2);
	expect(fake.receipts.reduce((n, r) => n + r.openaiMicros, 0)).toBe(20);
	expect(fake.receipts.every((r) => r.openRouterMicros === 0)).toBe(true);
	expect(faultNames.length).toBeGreaterThanOrEqual(40);
});

afterEach(() => vi.useRealTimers());
it.each(["writer", "verifier"] as const)("retries only a proven pre-dispatch %s fault", async (role) => {
	const fake = createFaultTransport({ fault: "reject-before-headers", role, session: 1 });
	const result = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 9,
		openaiBudgetUsd: 40,
		fakeTransport: fake.transport,
	});
	expect(result.stopReason).toBeNull();
	expect(result.calls[0]?.outcome).toBe("valid");
	expect(fake.receipts.filter((r) => r.role === role)).toHaveLength(1);
	expect(result.calls[0]?.costMicros).not.toBeNull();
});
it.each(["writer", "verifier"] as const)("holds a post-dispatch %s connection loss without re-buying", async (role) => {
	const fake = createFaultTransport({ fault: "reject-after-dispatch", role, session: 1 });
	const options = {
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 9,
		openaiBudgetUsd: 40,
		fakeTransport: fake.transport,
	};
	const result = await runBenchmark(options);
	expect(result.stopReason).toBeNull();
	expect(result.calls[0]?.outcome).toBe("transient");
	expect(result.calls[0]?.costMicros).toBeNull();
	expect(fake.receipts.filter((r) => r.role === role)).toHaveLength(1);
	const sends = fake.receipts.length;
	await runBenchmark({ ...options, previousCalls: result.calls });
	expect(fake.receipts).toHaveLength(sends);
});
