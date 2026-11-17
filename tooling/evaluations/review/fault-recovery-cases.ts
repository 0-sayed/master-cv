import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { createFaultTransport, faultNames } from "./faults";
import { validateSettlement } from "./reconcile";
import { required } from "./required";
import { runBenchmark, type RawRecord } from "./runner";
import { vertexFixture } from "./vertex-test-fixture";

export function registerFaultRecoveryCases(role: "writer" | "verifier", session: 3 | 40) {
	afterEach(() => vi.useRealTimers());
	for (const route of ["openai", "together", "google-vertex"] as const)
		it.each(faultNames)(
			`${route}/${role}/session-${session}/%s stops and resumes with exact payer receipts`,
			async (fault) => {
				vi.useFakeTimers();
				const model =
					route === "google-vertex" ? vertexFixture : required(loadModels().find((m) => m.provider === route));
				const fake = createFaultTransport({ fault, role, session });
				const rawRecords: RawRecord[] = [];
				const options = {
					models: [model],
					cases: cases.filter((c) => !c.exploratory).slice(0, 42),
					runs: 1,
					fake: true,
					budgetUsd: 100,
					openaiBudgetUsd: 100,
					sessionConcurrency: 1,
					fakeTransport: fake.transport,
					onRaw: (r: RawRecord) => {
						rawRecords.push(r);
						return Promise.resolve();
					},
				};
				const pending = runBenchmark(options);
				await vi.runAllTimersAsync();
				const first = await pending;
				const actualProvider = role === "writer" ? route : route === "together" ? "openai" : "together";
				const expectedStop = ["401", "402", "403"].includes(fault)
					? "ACCOUNT_ERROR"
					: fault === "400-schema"
						? "REQUEST_SCHEMA_ERROR"
						: fault === "wrong-provider"
							? role === "writer"
								? "PROVIDER_MISMATCH"
								: "VERIFIER_PROVIDER_MISMATCH"
							: fault === "is-byok-false" && actualProvider === "openai"
								? "PAYER_MISMATCH"
								: null;
				expect(first.stopReason).toBe(expectedStop);
				expect(first.modelStops).toEqual([]);
				expect(fake.injections.length).toBeGreaterThan(0);
				fake.recover();
				const billingSettlements = first.calls
					.filter((c) => c.costMicros === null)
					.map((c) => {
						const receipts = fake.receipts.filter((r) => r.key === c.key);
						const payer = (role: "writer" | "verifier") => ({
							openRouterBaseMicros: receipts.filter((r) => r.role === role).reduce((n, r) => n + r.openRouterMicros, 0),
							openaiMicros: receipts.filter((r) => r.role === role).reduce((n, r) => n + r.openaiMicros, 0),
						});
						return validateSettlement(
							{
								key: c.key,
								reservedMicros: 0,
								journalSha256: "a".repeat(64),
								evidenceSha256: "b".repeat(64),
								source: "owner-dashboard",
								writer: payer("writer"),
								verifier: payer("verifier"),
							},
							"a".repeat(64),
							[c.key],
						);
					});
				const resuming = runBenchmark({
					...options,
					previousCalls: first.calls,
					rawRecords,
					billingSettlements,
					recoverSystemic: true,
				});
				await vi.runAllTimersAsync();
				const resumed = await resuming;
				expect(resumed.stopReason).toBeNull();
				expect(resumed.incomplete).toEqual([]);
				expect(resumed.calls).toHaveLength(42);
				const before = fake.receipts.length;
				const again = await runBenchmark({
					...options,
					previousCalls: resumed.calls,
					rawRecords,
					recoverSystemic: true,
				});
				expect(fake.receipts).toHaveLength(before);
				expect(again.reservedUsd).toBe(resumed.reservedUsd);
				expect(again.reservedOpenaiUsd).toBe(resumed.reservedOpenaiUsd);
				const openai = fake.receipts.reduce((n, r) => n + r.openaiMicros, 0);
				expect(Math.round(required(resumed.reservedOpenaiUsd) * 1e6)).toBe(openai);
				const router = resumed.calls.reduce(
					(n, c) => n + (c.priorAttemptOpenRouterMicros ?? 0) + (c.openRouterCostMicros ?? 0),
					0,
				);
				expect(Math.round(resumed.reservedUsd * 1e6)).toBe(router);
				const oracle = new Map<string, number>();
				for (const receipt of fake.receipts)
					oracle.set(receipt.key, (oracle.get(receipt.key) ?? 0) + receipt.openRouterMicros);
				const rawRouter = [...oracle.values()].reduce((n, cost) => n + cost, 0);
				expect(router).toBe(rawRouter);
			},
		);
}
