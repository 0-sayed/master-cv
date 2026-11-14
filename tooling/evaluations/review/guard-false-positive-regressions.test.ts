import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases, evaluateOutput, goldOutput } from "./corpus";
import recorded from "./guard-false-positive-regressions.json";
import { reguardCalls } from "./reguard";
import { required } from "./required";
import { runBenchmark, type RawRecord } from "./runner";

it.each(recorded)(
	"replays recorded guard-rejection session $sessionKey",
	({ caseId, output, expectedGuardAccepted }) => {
		expect(evaluateOutput(required(cases.find((c) => c.id === caseId)), output).guardAccepted).toBe(
			expectedGuardAccepted,
		);
	},
);

it("reuses an audited judge for changed guards, but schedules a missing judge", async () => {
	const model = required(loadModels().find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "low"));
	const first = await runBenchmark({ models: [model], cases: cases.slice(0, 1), runs: 1, fake: true, budgetUsd: 9 });
	const call = required(first.calls[0]);
	call.guardAccepted = false;
	call.guardError = "AI_UNSUPPORTED_CLAIM";
	const replay = reguardCalls([call]);
	expect(replay.sessions[0]).toMatchObject({ changed: true, needsReverification: [] });
	expect(replay.calls[0]).toMatchObject({ guardAccepted: true, safetyAccepted: true });
	expect(() => reguardCalls([{ ...call, inputDigest: "changed-request" }])).toThrow("REGUARD_WRITER_INPUT_MISMATCH");
	call.verifierVerdict = null;
	delete call.verifierUsage;
	expect(reguardCalls([call]).sessions[0]?.needsReverification).toContain("missing-verifier");
});

it("re-verifies selected sessions using only saved writer responses", async () => {
	const model = required(loadModels().find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "low"));
	const options = { models: [model], cases: cases.slice(0, 2), runs: 1, fake: true, budgetUsd: 9, openaiBudgetUsd: 40 };
	const rawRecords: RawRecord[] = [];
	const first = await runBenchmark({
		...options,
		onRaw: async (r) => {
			rawRecords.push(r);
		},
	});
	const key = required(first.calls[0]).key;
	const roles: string[] = [];
	const replay = await runBenchmark({
		...options,
		previousCalls: first.calls,
		rawRecords,
		reverifyKeys: [key],
		fakeTransport: (_url, _init, next, context) => {
			roles.push(context.role);
			return next();
		},
	});
	expect(roles).toEqual(["verifier"]);
	expect(replay.calls.map((c) => c.output)).toEqual(first.calls.map((c) => c.output));
	expect(required(replay.calls.find((c) => c.key === key)).sessionAttempts).toBe(2);
	expect(replay.stopReason).toBeNull();
	const cached = await runBenchmark({
		...options,
		fake: false,
		previousCalls: replay.calls,
		rawRecords,
		reverifyKeys: [],
	});
	expect(cached.calls).toEqual(replay.calls);
	expect(cached.reservedUsd).toBe(replay.reservedUsd);
	expect(cached.reservedOpenaiUsd).toBe(replay.reservedOpenaiUsd);
	await expect(runBenchmark({ ...options, previousCalls: first.calls, reverifyKeys: [key] })).rejects.toThrow(
		"CACHED_WRITER_REQUIRED",
	);
});

it("accepts a literal from/to date span during extraction", () => {
	const c = required(cases.find((c) => c.id === "r2-t07-extraction"));
	const output = goldOutput(c);
	output.candidates = [
		{
			id: "c1",
			section: "experience",
			entityId: "exp-1",
			field: "dates",
			value: { start: "2018-09", end: "2020-06", present: false },
			rawDateText: "from 2018-09 to 2020-06",
			evidenceIds: ["selected"],
			confirmation: "needs_review",
		},
	];
	expect(evaluateOutput(c, output)).toMatchObject({ guardAccepted: true });
});

it("keeps the recorded end-as-start extraction rejected", () => {
	const c = required(cases.find((c) => c.id === "r2-t07-extraction"));
	const output = goldOutput(c);
	output.candidates = [
		{
			id: "exp-dates-1",
			section: "experience",
			entityId: "exp-1",
			field: "dates",
			value: { start: "2020-06", end: null, present: false },
			rawDateText: "from 2020-06",
			evidenceIds: ["selected"],
			confirmation: "needs_review",
		},
	];
	expect(evaluateOutput(c, output)).toMatchObject({ guardAccepted: false, guardError: "AI_UNSUPPORTED_DATE" });
});
