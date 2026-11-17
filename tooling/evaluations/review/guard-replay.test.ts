import type { TaskCase } from "./contracts/types";
import type { BenchmarkCall } from "./runner";
import { createHash } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { prepareCase } from "./execution";
import { replayTaskGuards } from "./guard-replay";
import { sessionPromptHash } from "./repair";
import { loadStudyCases, fixtureHash } from "./study";

const c = loadStudyCases("tasks-v1", ["summary"])[0] as TaskCase;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function receipt(): BenchmarkCall {
	const prepared = prepareCase(c);
	return {
		key: "saved",
		caseId: c.id,
		category: c.category,
		model: "saved/writer",
		reasoning: "low",
		fixtureHash: fixtureHash(c),
		inputDigest: hash(prepared.payload),
		sourceDigest: hash(prepared.snapshot.evidence),
		outputDigest: hash(c.gold),
		promptDigest: sessionPromptHash(c),
		output: JSON.stringify(c.gold),
		guardAccepted: false,
		guardError: "AI_UNSUPPORTED_CLAIM",
		safetyAccepted: false,
		verifierVerdict: tasksVerifier.fakeVerdict(c, c.gold as Record<string, unknown>),
		verifierFault: null,
		verifierAccepted: true,
		costMicros: 1234,
	} as BenchmarkCall;
}
it("reuses a paid valid judgment without changing the writer or spend", () => {
	const call = receipt();
	const original = structuredClone(call);
	const report = replayTaskGuards([c], [call]);
	expect(report.sessions[0]).toMatchObject({ accepted: true, guardRecovered: true, needsReverification: [] });
	expect(report.pending).toEqual([]);
	expect(report.freshVerifierCostUsd).toBe(0);
	expect(call).toEqual(original);
});
it.each(["missing", "protocol"])("never invents a %s verifier verdict", (kind) => {
	const call = receipt();
	if (kind === "missing") call.verifierVerdict = null;
	else call.verifierFault = "AI_VERIFICATION_INCOMPLETE";
	const report = replayTaskGuards([c], [call]);
	expect(report.sessions[0]?.accepted).toBe(false);
	expect(report.pending).toHaveLength(1);
	expect(report.freshVerifierCostUsd).toBeNull();
});
it("keeps invalid writer answers in the denominator and preserves completion order independence", () => {
	const a = { ...receipt(), key: "a", output: "invalid", outputDigest: hash("invalid") };
	const b = { ...receipt(), key: "b" };
	const left = replayTaskGuards([c], [a, b]);
	expect(left).toEqual(replayTaskGuards([c], [b, a]));
	expect(left.cells[0]).toMatchObject({ total: 2, accepted: 1 });
});
it("refuses changed writer answers, evidence and prompts", () => {
	for (const patch of [{ outputDigest: "changed" }, { sourceDigest: "changed" }, { promptDigest: "changed" }])
		expect(() => replayTaskGuards([c], [{ ...receipt(), ...patch }])).toThrow(/REPLAY_.*MISMATCH/u);
});
