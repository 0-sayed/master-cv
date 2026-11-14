import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { cases } from "./corpus";
import { rescoreJournal } from "./rescore";
import { syntheticJournalFixture } from "./synthetic-test-fixtures";

const journal = await syntheticJournalFixture();
const evidence = new URL("../results/2026-11-13T13-29-43.354Z-27e0cb13/", import.meta.url);
it("keeps synthetic edited outputs pending reverification and reports capacity without claiming live quality", () => {
	const r = rescoreJournal(journal);
	expect(r.sessions).toHaveLength(2);
	expect(r.scoredEvents).toBe(2);
	expect(r.writerErrors).toEqual({ schema: 0, truncated: 0 });
	expect(r.sessions.filter((s) => s.category === "extraction")).toHaveLength(1);
	for (const session of r.sessions) {
		expect(session.schemaValid).toBe(true);
		expect(session.needsReverification).toContain("incomplete-response-payload");
		expect(session.after.safety).toBeNull();
		expect(session.after.quality).toBeNull();
	}
	expect(r.capacity.schemaValidOutputs).toBe(2);
	expect(r.capacity.inputLimitFailures).toEqual([]);
	expect(r.capacity.compactOutputBudgetFailures).toEqual([]);
	expect(r.capacity.provesLiveNonTruncation).toBe(false);
	expect(r.table).toHaveLength(2);
});
describe.skipIf(!existsSync(evidence))("local evidence replay: completed smoke rescore", () => {
	it("re-scores the latest 132 durable sessions without claiming missing/payload-affected judgments", () => {
		const r = rescoreJournal(readFileSync(new URL("calls.jsonl", evidence), "utf8"));
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
