import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { createFaultTransport } from "./faults";
import { gracefulDrain } from "./interrupt";
import { runBenchmark, type RawRecord } from "./runner";
import { validateSmoke, smokeCases } from "./study";
afterEach(() => vi.useRealTimers());
it.each([7, 19, 2026])("finishes all 132 chaos smoke sessions for seed %i", async (seed) => {
	vi.useFakeTimers();
	const models = loadModels();
	const selected = smokeCases(cases, models);
	const fake = createFaultTransport({ fault: "none", role: "writer", session: 3, chaos: true, seed });
	const rawRecords: RawRecord[] = [];
	const options = {
		models,
		cases: selected,
		runs: 1,
		phase: "smoke" as const,
		fake: true,
		budgetUsd: 9,
		openaiBudgetUsd: 40,
		fakeTransport: fake.transport,
		onRaw: async (r: RawRecord) => {
			rawRecords.push(r);
		},
	};
	const pending = runBenchmark(options);
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(fake.injections.length).toBeGreaterThan(0);
	expect(result.stopReason).toBeNull();
	expect(result.modelStops).toEqual([]);
	expect(result.incomplete).toEqual([]);
	expect(result.calls).toHaveLength(132);
	expect(validateSmoke(result, models, selected)).toHaveLength(11);
	const sends = fake.receipts.length;
	const again = await runBenchmark({ ...options, previousCalls: result.calls, rawRecords });
	expect(fake.receipts).toHaveLength(sends);
	expect(again.reservedUsd).toBe(result.reservedUsd);
	expect(again.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
});
it("drains exactly eight active sessions after SIGINT then resumes to full coverage", async () => {
	vi.useFakeTimers();
	const controller = gracefulDrain();
	const rawRecords: RawRecord[] = [];
	let active = 0;
	let peak = 0;
	const options = {
		models: loadModels(),
		cases: smokeCases(cases),
		phase: "smoke" as const,
		runs: 1,
		fake: true,
		budgetUsd: 9,
		openaiBudgetUsd: 40,
		openaiConcurrency: 8,
		togetherConcurrency: 8,
		maxUnverified: 8,
		onRaw: async (r: RawRecord) => {
			rawRecords.push(r);
		},
	};
	const pending = runBenchmark({
		...options,
		signal: controller.signal,
		fakeTransport: async (_url, _init, next) => {
			peak = Math.max(peak, ++active);
			if (active === 8) process.emit("SIGINT");
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			try {
				return await next();
			} finally {
				active--;
			}
		},
	});
	await vi.runAllTimersAsync();
	const first = await pending;
	controller.dispose();
	expect(peak).toBe(8);
	expect(active).toBe(0);
	expect(first.stopReason).toBe("INTERRUPTED");
	expect(first.calls).toHaveLength(8);
	const resumed = await runBenchmark({ ...options, previousCalls: first.calls, rawRecords });
	expect(resumed.stopReason).toBeNull();
	expect(resumed.calls).toHaveLength(132);
	expect(resumed.incomplete).toEqual([]);
	const baseline = await runBenchmark(options);
	expect(resumed.reservedUsd).toBe(baseline.reservedUsd);
	expect(resumed.reservedOpenaiUsd).toBe(baseline.reservedOpenaiUsd);
});
