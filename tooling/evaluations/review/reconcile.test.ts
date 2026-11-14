import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { validateSettlement, settlementCharges } from "./reconcile";
import { required } from "./required";
import { runBenchmark } from "./runner";
const options = {
	models: loadModels().slice(0, 1),
	cases: cases.slice(0, 1),
	runs: 1,
	fake: true,
	budgetUsd: 9,
	openaiBudgetUsd: 40,
};
it("reports an ambiguous session as incomplete without buying it again", async () => {
	const call = required((await runBenchmark(options)).calls[0]);
	const result = await runBenchmark({
		...options,
		previousCalls: [{ ...call, costMicros: null }],
		onRaw: async () => {
			throw new Error("AMBIGUOUS_GENERATION_BOUGHT_AGAIN");
		},
	});
	expect(result.stopReason).toBeNull();
	expect(result.incomplete).toHaveLength(1);
});
it("requires exact journal binding and actual payer evidence", () => {
	const receipt = {
		key: "session",
		reservedMicros: 0,
		journalSha256: "a".repeat(64),
		evidenceSha256: "b".repeat(64),
		source: "owner-dashboard",
		writer: { openRouterBaseMicros: 0, openaiMicros: 3 },
		verifier: { openRouterBaseMicros: 2, openaiMicros: 0 },
	};
	expect(() => validateSettlement(receipt, "c".repeat(64), ["session"])).toThrow("RECONCILIATION_JOURNAL_MISMATCH");
	expect(() => validateSettlement(receipt, "a".repeat(64), ["other"])).toThrow("RECONCILIATION_UNKNOWN_SESSION");
	expect(settlementCharges(validateSettlement(receipt, "a".repeat(64), ["session"]))).toEqual({
		openRouterMicros: 3,
		openaiMicros: 3,
	});
});
it("settles an ambiguous attempt before retry and never loses or repeats its charge", async () => {
	const baseline = await runBenchmark(options);
	const call = required(baseline.calls[0]);
	const held = {
		...call,
		costMicros: null,
		openRouterCostMicros: null,
		openaiCostMicros: null,
		outcome: "unknown",
		output: "",
		generationId: null,
	};
	const settlement = validateSettlement(
		{
			key: call.key,
			reservedMicros: 0,
			journalSha256: "a".repeat(64),
			evidenceSha256: "b".repeat(64),
			source: "owner-dashboard",
			writer: { openRouterBaseMicros: 0, openaiMicros: 7 },
			verifier: { openRouterBaseMicros: 0, openaiMicros: 0 },
		},
		"a".repeat(64),
		[call.key],
	);
	const result = await runBenchmark({ ...options, previousCalls: [held], billingSettlements: [settlement] });
	expect(result.incomplete).toEqual([]);
	expect(result.stopReason).toBeNull();
	expect(result.reservedOpenaiUsd).toBe(required(baseline.reservedOpenaiUsd) + 0.000007);
	const again = await runBenchmark({ ...options, previousCalls: result.calls, billingSettlements: [settlement] });
	expect(again.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
	expect(again.reservedUsd).toBe(result.reservedUsd);
});
it("settles a killed dispatch without a raw body before safely dispatching again", async () => {
	const baseline = await runBenchmark(options);
	const call = required(baseline.calls[0]);
	const settlement = validateSettlement(
		{
			key: call.key,
			reservedMicros: 0,
			journalSha256: "a".repeat(64),
			evidenceSha256: "b".repeat(64),
			source: "owner-dashboard",
			writer: { openRouterBaseMicros: 0, openaiMicros: 7 },
			verifier: { openRouterBaseMicros: 0, openaiMicros: 0 },
		},
		"a".repeat(64),
		[call.key],
	);
	const result = await runBenchmark({
		...options,
		billingSettlements: [settlement],
		pendingReservations: [
			{ key: call.key, reservedMicros: call.reservedMicros, reservedOpenaiMicros: required(call.reservedOpenaiMicros) },
		],
	});
	expect(result.stopReason).toBeNull();
	expect(result.reservedOpenaiUsd).toBe(required(baseline.reservedOpenaiUsd) + 0.000007);
});
it("allows an explicit larger resume budget while rejecting reductions", async () => {
	const { validateResume } = await import("./study");
	const previous = {
		hash: "same",
		mode: "fake",
		phase: "full",
		budgetUsd: 9,
		openaiBudgetUsd: 40,
		priorSpendMicros: 0,
		calibration: [],
	};
	expect(() => validateResume(previous, { ...previous, budgetUsd: 10 })).not.toThrow();
	expect(() => validateResume(previous, { ...previous, budgetUsd: 8 })).toThrow("RESUME_MANIFEST_MISMATCH");
});
