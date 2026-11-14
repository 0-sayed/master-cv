import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { cases } from "./corpus";
import { rescoreJournal } from "./rescore";

const journal = readFileSync(
	new URL("../results/2026-11-13T13-29-43.354Z-27e0cb13/calls.jsonl", import.meta.url),
	"utf8",
);
it("re-scores the latest 132 durable sessions without claiming missing/payload-affected judgments", () => {
	const r = rescoreJournal(journal);
	expect(r.sessions).toHaveLength(132);
	expect(r.scoredEvents).toBe(145);
	expect(r.sessions.filter((s) => s.verifierFault === "VERIFIER_TRUNCATED")).toHaveLength(4);
	expect(r.writerErrors).toEqual({ schema: 1, truncated: 1 });
	expect(
		r.sessions
			.filter((s) => s.category === "extraction" && s.schemaValid)
			.every((s) => s.needsReverification.includes("incomplete-response-payload")),
	).toBe(true);
	expect(r.sessions.some((s) => s.before.safety === false && s.after.savedSafety === true)).toBe(true);
	expect(
		r.sessions
			.filter((s) => s.needsReverification.includes("retention-not-applicable-with-edits"))
			.every((s) => s.after.safety === null),
	).toBe(true);
	expect(r.capacity.schemaValidOutputs).toBe(130);
	expect(r.capacity.inputLimitFailures).toEqual([]);
	expect(r.capacity.compactOutputBudgetFailures).toEqual([]);
	expect(r.capacity.provesLiveNonTruncation).toBe(false);
	expect(r.table).toHaveLength(44);
});
it("refuses a missing durable writer output instead of manufacturing one", () => {
	const lines = journal.trim().split("\n");
	const i = lines.findIndex((l) => {
		const e = JSON.parse(l);
		return e.type === "raw" && !e.data.key.endsWith(":verify");
	});
	lines.splice(i, 1);
	expect(() => rescoreJournal(lines.join("\n"))).toThrow("SAVED_WRITER_REQUIRED");
});
it("uses the same advisory quality verdict as the live benchmark, with usefulness separate", () => {
	const r = rescoreJournal(journal);
	const chosen = r.sessions.find(
		(s) =>
			s.after.savedQuality === true &&
			cases.some((c) => c.id === s.caseId && c.improvementExpected && c.task !== "clarify impact without inventing"),
	);
	if (!chosen) throw new Error("QUALITY_TEST_CASE_REQUIRED");
	const changed = journal
		.trim()
		.split("\n")
		.map((line) => {
			const event = JSON.parse(line);
			if (event.type === "scored" && event.data.key === chosen.key)
				event.data.verifierVerdict.usefulness = { status: "unchanged", reason: "Advisory usefulness diagnostic." };
			return JSON.stringify(event);
		})
		.join("\n");
	expect(rescoreJournal(changed).sessions.find((s) => s.key === chosen.key)?.after.savedQuality).toBe(true);
});
