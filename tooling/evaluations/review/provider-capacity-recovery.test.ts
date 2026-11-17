import { expect, it, vi } from "vite-plus/test";
import { loadJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { required } from "./required";
import { runBenchmark, type RawRecord } from "./runner";
it("retries a temporary in-flight credit hold, records the original response, and resumes without another purchase", async () => {
	vi.useFakeTimers();
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const model = required(models.find((m) => m.reasoning === "low"));
	const c = required(loadJudgeCanaries().find((c) => c.category === "summary" && c.language === "en"));
	const raw: RawRecord[] = [];
	const holds: number[] = [];
	let attempts = 0;
	const options = { models: [model], cases: [c], runs: 1, fake: true, budgetUsd: 10, openaiBudgetUsd: 10 };
	try {
		const pending = runBenchmark({
			...options,
			onReserve: async (r) => {
				if (r.reservedMicros > 0) holds.push(r.reservedMicros);
			},
			onRaw: async (r) => {
				raw.push(r);
			},
			fakeTransport: async (_u, _i, next, ctx) => {
				if (ctx.role === "verifier" && attempts++ === 0)
					return Response.json(
						{
							error: {
								code: 402,
								metadata: { limit_source: "openrouter_in_flight_budget", reason: "in_flight_budget_exhausted" },
							},
						},
						{ status: 402 },
					);
				return next();
			},
		});
		await vi.runAllTimersAsync();
		const first = await pending;
		expect(first.stopReason).toBeNull();
		expect(first.calls[0]?.verifierAccepted).toBe(true);
		expect(raw.filter((r) => r.status === 402)).toHaveLength(1);
		expect(holds).toHaveLength(2);
		expect(holds[1]).toBeGreaterThan(holds[0] ?? 0);
		const resumed = await runBenchmark({
			...options,
			previousCalls: first.calls,
			rawRecords: raw,
			fakeTransport: () => {
				throw new Error("MUST_NOT_REBUY");
			},
		});
		expect(resumed.calls).toEqual(first.calls);
		expect(resumed.reservedUsd).toBe(first.reservedUsd);
	} finally {
		vi.useRealTimers();
	}
});
