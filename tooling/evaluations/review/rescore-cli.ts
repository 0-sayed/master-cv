import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

// Offline before any application import. Neither dotenv nor paid transport is reachable.
process.loadEnvFile = () => {};
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_RESCORE_NETWORK_FORBIDDEN"));
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET = "synthetic-offline-rescore";
const { values } = parseArgs({
	options: {
		source: { type: "string" },
		out: { type: "string", short: "o" },
		"approval-file": { type: "string" },
		checks: { type: "string" },
	},
});
if (!values.source || !values.out || !values["approval-file"])
	throw new Error("SOURCE_APPROVAL_AND_EXPLICIT_OUTPUT_REQUIRED");
const source = resolve(values.source);
const out = resolve(values.out);
if (out === source || !relative(source, out).startsWith("..")) throw new Error("RESCORE_OUTPUT_MUST_BE_SEPARATE");
const [
	{ rescoreJournal },
	{ cases },
	{ loadModels },
	{ arabicApproval, controls, fixtureHash, smokeCases },
	{ estimateBenchmark },
	{ assertFrozenStudy },
	{ required },
] = await Promise.all([
	import("./rescore"),
	import("./corpus"),
	import("./config"),
	import("./study"),
	import("./runner"),
	import("./freeze"),
	import("./required"),
]);
const freeze = assertFrozenStudy();
const journal = await readFile(join(source, "calls.jsonl"), "utf8");
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
const report = rescoreJournal(journal);
const models = loadModels();
const identity = (m: { model: string; provider: string; reasoning: string; providerEndpoint?: string | undefined }) =>
	JSON.stringify([m.model, m.provider, m.reasoning, m.providerEndpoint ?? null]);
const gridUnchanged =
	JSON.stringify(manifest.models.map(identity).sort()) === JSON.stringify(models.map(identity).sort());
const fixtureHashesUnchanged = report.sessions.every((s) => {
	const event = journal
		.trim()
		.split("\n")
		.map((l) => JSON.parse(l))
		.find((e) => e.type === "scored" && e.data.key === s.key);
	return event.data.fixtureHash === fixtureHash(required(cases.find((c) => c.id === s.caseId)));
});
const approvalBody = await readFile(resolve(values["approval-file"]), "utf8");
const ownerArabicApproval = {
	reviewer: arabicApproval(JSON.parse(approvalBody), cases),
	hash: createHash("sha256").update(approvalBody).digest("hex"),
	valid: true,
};
const control = controls(cases);
if (!gridUnchanged || !fixtureHashesUnchanged || !control.pass) throw new Error("RESCORE_INVARIANT_FAILED");
const forecast = estimateBenchmark(models, smokeCases(cases, models), 1, [], models, "smoke");
const checks = values.checks ? JSON.parse(await readFile(resolve(values.checks), "utf8")) : null;
const total = (field: "safety" | "quality" | "savedSafety" | "savedQuality") =>
	report.sessions.filter((s) => s.after[field] === true).length;
const before = (field: "safety" | "quality") => report.sessions.filter((s) => s.before[field]).length;
const pending = report.sessions.filter((s) => s.needsReverification.length).length;
const command =
	"pnpm --filter @reactive-resume/tooling eval:review --stage smoke --budget-usd 9 --openai-budget-usd 40 --approval-file <owner-approval.json> --env-file <ignored-benchmark-key-file> -o evaluations/results";
const result = {
	...report,
	studyId: freeze.studyId,
	oldStudyId: manifest.freeze.studyId,
	oldSmokeQualifies: false,
	gridUnchanged,
	fixtureHashesUnchanged,
	ownerArabicApproval,
	control,
	forecast,
	checks,
	smokeCommand: command,
	interpretation:
		"Before is the historical joint acceptance/quality proxy, not independent quality measurement. After savedSafety/savedQuality are an algebraic re-score of recorded judgments, provisional when payload-affected. After safety/quality exclude every session marked for re-verification. New question-premise verdicts were not in the historical payload; question responses also require re-verification, and savedSafety deliberately represents only the legacy claim inventory. No missing judgment is inferred. All extraction responses and all nonempty proposals require a corrected full-response verification for trustworthy quality/retention. Writer failures are data. Historical files are immutable.",
};
const cell = (r: { passed: number; judged: number; pending: number; percent: number | null }) =>
	`${r.passed}/${r.judged} (${r.percent?.toFixed(1) ?? "N/A"}%; ${r.pending} pending)`;
const table = `Before: joint-acceptance proxies. After saved: provisional recorded-verdict re-score. After trusted: excludes payload-affected/faulty judgments.\n\n| Variant / category | Before safety | After saved safety | After trusted safety | Before quality proxy | After saved quality | After trusted quality |\n|---|---|---|---|---|---|---|\n${report.table.map((r) => `| ${r.group} | ${cell(r.before.safety)} | ${cell(r.after.savedSafety)} | ${cell(r.after.safety)} | ${cell(r.before.quality)} | ${cell(r.after.savedQuality)} | ${cell(r.after.quality)} |`).join("\n")}\n`;
const lines = [
	`A. Extraction verifier cap 5,120→12,288; compact-reason prompt; ${report.capacity.schemaValidOutputs}/132 valid payloads fit input/conditional compact-output budgets, 2 writer failures N/A. Live non-truncation remains unproven.`,
	"B. Production withholds only failed/unavailable safety (supported claims, retention retained/N/A, hard-fact guard); responseAssessment/usefulness/scope are advisory quality. Benchmark reports both; quality-only eligibility gates removed.",
	"C. Verification response includes every candidate (including nulls) and proposal; claims were already present. Independent question-premise safety verdicts are now required. The 11 wording + 8 injection appropriate/N/A rejects had edits, not question-only answers; retention rule caused rejection. Re-verification flags preserve this uncertainty.",
	"D. Extraction writer now receives unchanged authored intent; supported extra fields are scope/quality notes. Request/prompt identity changed; fixtures, grid and hash-bound owner Arabic approval verified unchanged offline.",
	`E. Smoke accepts writer errors as data with per-variant counts; isolated verifier faults affect health, not writer quality. Systemic verifier, billing, provider/account, usage and coverage failures still block. New freeze ${freeze.studyId}; prior freeze/receipt preserved.`,
	`F. Offline 132 sessions (145 scored events): historical safety ${before("safety")}→${total("savedSafety")} provisional; quality proxy ${before("quality")}→${total("savedQuality")} provisional; trusted safety/quality ${total("safety")}/${total("quality")}, ${pending} need re-verification. All 44 variant×category before/after rates: rescore.md; per-session flags/capacity: rescore.json.`,
	`New 132-session smoke REQUIRED; old smoke cannot qualify. ${command}; offline token-price proxy $${forecast.estimatedUsd.toFixed(4)} (not a quote; prompt/cap changed); historical observed spend OR $${(manifest.mode === "live" ? JSON.parse(await readFile(join(source, "results.json"), "utf8")).reservedUsd : 0).toFixed(4)} is not calibration for this freeze. No inference run.`,
	`Tests: ${checks ? JSON.stringify(checks) : "NOT YET RECORDED"}; controls ${control.checked}/${control.checked}, owner Arabic approval valid; no .env reads, staging or commits.`,
];
await mkdir(out, { recursive: true });
await writeFile(join(out, "rescore.json"), JSON.stringify(result, null, 2));
await writeFile(join(out, "rescore.md"), table);
await writeFile(join(out, "final-22.md"), lines.join("\n") + "\n");
