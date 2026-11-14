import { expect, it } from "vite-plus/test";
import { withOpenRouterFee } from "./budget";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { createFaultTransport } from "./faults";
import { validateSettlement } from "./reconcile";
import { required } from "./required";
import { runBenchmark, type BenchmarkCall, type RawRecord } from "./runner";
import { vertexFixture } from "./vertex-test-fixture";

for (const provider of ["openai", "together", "google-vertex"]) {
	for (const role of ["writer", "verifier"] as const) {
		it.each([3, 40])(`${provider}/${role} journal failure at session %i retains bills and resumes`, async (session) => {
			const fake = createFaultTransport({ fault: "none", role, session });
			const rawRecords: RawRecord[] = [];
			const previousCalls: BenchmarkCall[] = [];
			const pendingReservations: {
				key: string;
				reservedMicros: number;
				reservedOpenRouterMicros?: number;
				reservedOpenaiMicros?: number;
			}[] = [];
			const keys = new Set<string>();
			let failedKey = "";
			let fail = true;
			const options = {
				models: [
					provider === "google-vertex" ? vertexFixture : required(loadModels().find((m) => m.provider === provider)),
				],
				cases: cases.filter((c) => !c.exploratory).slice(0, 42),
				runs: 1,
				fake: true,
				budgetUsd: 100,
				openaiBudgetUsd: 100,
				sessionConcurrency: 1,
				fakeTransport: fake.transport,
				onReserve: async (r: (typeof pendingReservations)[number]) => {
					pendingReservations.push(r);
				},
				onCall: async (c: BenchmarkCall) => {
					previousCalls.push(c);
				},
				onRaw: async (r: RawRecord) => {
					keys.add(r.key.replace(/:verify$/u, ""));
					if (fail && keys.size === session && r.key.endsWith(":verify") === (role === "verifier")) {
						failedKey = r.key.replace(/:verify$/u, "");
						fail = false;
						throw new Error("OFFLINE_JOURNAL_WRITE_FAILURE");
					}
					rawRecords.push(r);
				},
			};
			await expect(runBenchmark(options)).rejects.toThrow("OFFLINE_JOURNAL_WRITE_FAILURE");
			expect(keys.size).toBe(session);
			const charges = fake.receipts.filter((r) => r.key === failedKey);
			const payer = (role: "writer" | "verifier") => ({
				openRouterBaseMicros: charges.filter((r) => r.role === role).reduce((n, r) => n + r.openRouterMicros, 0),
				openaiMicros: charges.filter((r) => r.role === role).reduce((n, r) => n + r.openaiMicros, 0),
			});
			const receipt = validateSettlement(
				{
					key: failedKey,
					reservedMicros: 0,
					journalSha256: "a".repeat(64),
					evidenceSha256: "b".repeat(64),
					source: "owner-dashboard",
					writer: payer("writer"),
					verifier: payer("verifier"),
				},
				"a".repeat(64),
				[failedKey],
			);
			const resumed = await runBenchmark({
				...options,
				previousCalls,
				rawRecords,
				pendingReservations,
				billingSettlements: [receipt],
			});
			expect(resumed.stopReason).toBeNull();
			expect(resumed.modelStops).toEqual([]);
			expect(resumed.incomplete).toEqual([]);
			expect(resumed.calls).toHaveLength(42);
			const oracle = new Map<string, number>();
			for (const r of fake.receipts) oracle.set(r.key, (oracle.get(r.key) ?? 0) + r.openRouterMicros);
			expect(Math.round(resumed.reservedUsd * 1e6)).toBe(
				[...oracle.values()].reduce((n, c) => n + withOpenRouterFee(c), 0),
			);
			expect(Math.round(required(resumed.reservedOpenaiUsd) * 1e6)).toBe(
				fake.receipts.reduce((n, r) => n + r.openaiMicros, 0),
			);
			const sends = fake.receipts.length;
			const again = await runBenchmark({ ...options, previousCalls: resumed.calls, rawRecords });
			expect(fake.receipts).toHaveLength(sends);
			expect(again.reservedUsd).toBe(resumed.reservedUsd);
			expect(again.reservedOpenaiUsd).toBe(resumed.reservedOpenaiUsd);
		});
	}
}
