import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import recorded from "./lexical-lost-fact-regressions.json";
import { rescoreLexical } from "./lexical-lost-fact-replay";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { syntheticLexicalFixture } from "./synthetic-test-fixtures";

const source = await syntheticLexicalFixture();

it("re-scores saved lexical diagnostics without changing writer/judge decisions or accounting", () => {
	const original = JSON.stringify(source);
	const after = rescoreLexical(source);
	expect(JSON.stringify(source)).toBe(original);
	expect(after.calls).toHaveLength(13);
	for (const [i, call] of after.calls.entries()) {
		const before = required(source.calls[i]);
		const { lexicalLostFacts: _lexical, score, ...rest } = call;
		const { lexicalLostFacts: _oldLexical, score: oldScore, ...oldRest } = before;
		expect(rest).toEqual(oldRest);
		expect(score && { ...score, lostFacts: oldScore?.lostFacts }).toEqual(oldScore);
	}
	expect(after.scores).toEqual(scoreBenchmark(after.calls));
});

it.each(recorded)("keeps the recorded loss decision for $caseId / $fact", ({ key, fact, lost }) => {
	const after = rescoreLexical({ ...source, calls: source.calls.filter((c) => c.key === key) });
	const call = required(after.calls.find((c) => c.key === key));
	expect(call.lexicalLostFacts?.includes(fact)).toBe(lost);
	expect(call.score?.lostFacts.includes(fact)).toBe(lost);
});

it("does not let retained verifier status erase a genuine omitted specialization", () => {
	const before = {
		...required(source.calls.find((c) => c.caseId === "r2-h03-extraction" && c.lexicalLostFacts?.length)),
		factRetention: "retained" as const,
	};
	const after = rescoreLexical({ ...source, calls: [before] });
	expect(after.calls[0]?.factRetention).toBe("retained");
	expect(after.calls[0]?.score?.lostFacts).toContain("دبلوم أرشفة");
});

it("refuses mismatched fixtures and materialized outputs", () => {
	const before = required(source.calls[0]);
	expect(() => rescoreLexical({ ...source, calls: [{ ...before, fixtureHash: "changed" }] })).toThrow(
		"LEXICAL_FIXTURE_MISMATCH",
	);
	expect(() => rescoreLexical({ ...source, calls: [{ ...before, outputDigest: "changed" }] })).toThrow(
		"LEXICAL_OUTPUT_MISMATCH",
	);
	const changed = structuredClone(before);
	if (changed.result?.kind !== "wording") throw new Error("WORDING_FIXTURE_REQUIRED");
	required(changed.result.proposals[0]).after = "<p>tampered</p>";
	expect(() => rescoreLexical({ ...source, calls: [changed] })).toThrow("LEXICAL_MATERIALIZED_OUTPUT_MISMATCH");
});

it("writes the offline owner artifacts only under -o, without a key or stdout report", async () => {
	const out = await mkdtemp(join(tmpdir(), "lexical-lost-fact-cli-"));
	try {
		const fixture = join(out, "synthetic-lexical-input.json");
		await writeFile(fixture, JSON.stringify(source));
		const result = spawnSync(
			process.execPath,
			["--import", "tsx", "evaluations/review/lexical-lost-fact-replay-cli.ts", "--source", fixture, "-o", out],
			{ encoding: "utf8" },
		);
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		const audit = JSON.parse(await readFile(join(out, "lexical-lost-fact-audit.json"), "utf8"));
		expect(audit.control).toMatchObject({ checked: 126, pass: true });
		expect(audit.hits).toHaveLength(13);
		expect(audit.hits.filter((h: { fixed: boolean }) => h.fixed)).toHaveLength(7);
		expect(audit.winners.every((w: { winner: unknown }) => w.winner === null)).toBe(true);
		expect(audit.table).toHaveLength(6);
		expect((await readFile(join(out, "lexical-lost-fact-final.txt"), "utf8")).trim().split("\n")).toHaveLength(6);
		const scored = JSON.parse(await readFile(join(out, "lexical-lost-fact-results.json"), "utf8"));
		expect(scored.lexicalRescore.offline).toBe(true);
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});
