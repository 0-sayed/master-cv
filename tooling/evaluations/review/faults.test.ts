import { expect, it } from "vite-plus/test";
import { afterEach, vi } from "vite-plus/test";
import { withOpenRouterFee } from "./budget";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { createFaultTransport, faultNames } from "./faults";
import { validateSettlement } from "./reconcile";
import { required } from "./required";
import { runBenchmark, type RawRecord } from "./runner";
import { vertexFixture } from "./vertex-test-fixture";
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

const routes = ["openai", "together", "google-vertex"] as const;
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
for (const route of routes)
	for (const role of ["writer", "verifier"] as const)
		for (const session of [3, 40]) {
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
						onRaw: async (r: RawRecord) => {
							rawRecords.push(r);
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
								openRouterBaseMicros: receipts
									.filter((r) => r.role === role)
									.reduce((n, r) => n + r.openRouterMicros, 0),
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
					const rawRouter = [...oracle.values()].reduce((n, cost) => n + withOpenRouterFee(cost), 0);
					expect(router).toBe(rawRouter);
				},
			);
		}
