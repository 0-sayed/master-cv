import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

process.loadEnvFile = () => {};
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_GUARD_REPLAY_NETWORK_FORBIDDEN"));
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET = "synthetic-offline-guard-replay";
const { values } = parseArgs({ options: { source: { type: "string" }, out: { type: "string", short: "o" } } });
if (!values.source || !values.out) throw new Error("Use --source <saved-run> -o <new-report-directory>");
const source = resolve(values.source);
const out = resolve(values.out);
if (source === out || out.startsWith(source + "/")) throw new Error("REPLAY_SOURCE_IMMUTABLE");
const { replayTaskGuards } = await import("./guard-replay");
const { loadStudyCases, studyReviewItems, arabicApprovalProvenance } = await import("./study");
const { tasksGuardVersion } = await import("./contracts/guard");
const { readJournal } = await import("./journal");
const { evaluationOutputFolder } = await import("./output-directory");
const { isDeepStrictEqual } = await import("node:util");
const cases = loadStudyCases("tasks-v1") as import("./contracts/types").TaskCase[];
const bytes = await readFile(join(source, "results.json"));
const previous = JSON.parse(bytes.toString());
const journal = await readJournal(join(source, "calls.jsonl"));
const latest = new Map(journal.previousCalls.map((c) => [c.key, c]));
const scored = new Map<string, import("./runner").BenchmarkCall[]>();
for (const call of journal.previousCalls) scored.set(call.key, [...(scored.get(call.key) ?? []), call]);
if (
	latest.size !== previous.calls.length ||
	previous.calls.some(
		(c: import("./runner").BenchmarkCall) => !scored.get(c.key)?.some((record) => isDeepStrictEqual(record, c)),
	)
)
	throw new Error("REPLAY_JOURNAL_RESULTS_MISMATCH");
const laterJournalDifferences = previous.calls
	.filter((c: import("./runner").BenchmarkCall) => !isDeepStrictEqual(latest.get(c.key), c))
	.map((c: import("./runner").BenchmarkCall) => c.key);
const replay = replayTaskGuards(cases, previous.calls);
const approvalPath =
	"/mnt/storage/master-cv-design-archive/ui-audit/personal-career-benchmark/arabic-review-v6/approved-review.json";
const approval = arabicApprovalProvenance(
	JSON.parse(await readFile(approvalPath, "utf8")),
	studyReviewItems("tasks-v1", cases),
);
const report = {
	source,
	sourceResultsSha256: createHash("sha256").update(bytes).digest("hex"),
	laterJournalDifferences,
	sourceStudy: previous.study,
	tasksGuardVersion,
	targetStudyId: JSON.parse(await readFile(new URL("./tasks-study.json", import.meta.url), "utf8")).studyId,
	replayImplementationSha256: createHash("sha256")
		.update(await readFile(new URL("./guard-replay.ts", import.meta.url)))
		.digest("hex"),
	arabicApproval: approval,
	method:
		"Retrospective guard correction with unchanged writer, verifier prompt, schema, evidence and paid judgments. No new model qualification.",
	...replay,
};
await mkdir(evaluationOutputFolder({ out }), { recursive: true });
await writeFile(join(out, "guard-replay.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ sessions: replay.sessions.length, pending: replay.pending.length, spendUsd: 0 }));
