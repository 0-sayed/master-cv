import type { JudgeCanaryReceipt } from "./canaries";
import type { TaskCase } from "./contracts/types";
import type { BenchmarkCall } from "./runner";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Install before transitive app imports. This tool cannot load credentials or dispatch inference.
process.loadEnvFile = () => {};
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_SAFETY_REPLAY_NETWORK_FORBIDDEN"));
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET = "synthetic-offline-safety-replay";
const { values } = parseArgs({
	options: {
		source: { type: "string" },
		out: { type: "string", short: "o" },
		"historical-fixtures": { type: "string" },
		diagnosis: { type: "string" },
	},
});
if (!values.out || !values.source || !values["historical-fixtures"] || !values.diagnosis)
	throw new Error("EXPLICIT_SOURCE_FIXTURES_DIAGNOSIS_AND_OUTPUT_REQUIRED");
const out = resolve(values.out);
const source = await realpath(resolve(values.source));
const historicalFixtures = await realpath(resolve(values["historical-fixtures"]));
const diagnosis = await realpath(resolve(values.diagnosis));
if (
	![source, historicalFixtures, diagnosis, out].every((p) => p.startsWith("/tmp/")) ||
	out === source ||
	out.startsWith(`${source}/`)
)
	throw new Error("SEPARATE_TMP_SNAPSHOT_AND_OUTPUT_REQUIRED");
const [
	{ scoreJudgeCanary, planJudgeCanaries },
	{ loadModels },
	{ loadTaskFixtures },
	{ tasksVerifier },
	{ tasksVerifierSchema },
	{ rescoreTaskSessions },
	{ loadStudyCases, taskCategories },
] = await Promise.all([
	import("./canaries"),
	import("./config"),
	import("./contracts/fixtures"),
	import("./contracts/verifier/verifier"),
	import("./contracts/verifier/schema"),
	import("./safety-replay"),
	import("./study"),
]);
const receipt = JSON.parse(await readFile(join(source, "canaries.json"), "utf8")) as JudgeCanaryReceipt;
const legacy = JSON.parse(await readFile(diagnosis, "utf8")) as {
	rows: { key: string; output: Record<string, unknown> }[];
};
const originalFixtures = loadTaskFixtures([historicalFixtures]);
const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const currentPlan = planJudgeCanaries(models);
const rows = receipt.results.map((result) => {
	const c = originalFixtures.find((c) => c.id === result.caseId);
	const saved = legacy.rows.find((r) => r.key === result.key);
	if (!c || !saved) throw new Error("HISTORICAL_PROBE_REQUIRED");
	const model = currentPlan[0]?.model;
	if (!model) throw new Error("JUDGE_MODEL_REQUIRED");
	const probe = {
		key: result.key,
		c,
		output: saved.output,
		model,
		defect: result.defect,
		expectedAccepted: result.defect === "gold",
	};
	const score = scoreJudgeCanary(probe, result);
	const invalidGold =
		result.defect === "gold" && ["judge-canary-translation-ar", "judge-canary-translation-mixed"].includes(c.id);
	const omissionQuality = c.category === "summary" && result.defect === "lost-fact";
	const current = currentPlan.find((p) => p.key === result.key);
	return {
		key: result.key,
		caseId: c.id,
		category: c.category,
		language: c.language,
		defect: result.defect,
		...score,
		invalidGold,
		omissionQuality,
		currentProbeOutputUnchanged: Boolean(current && JSON.stringify(current.output) === JSON.stringify(saved.output)),
		savedVerdict: result.verdict,
		promptInventoryIssues: inventoryIssues(c, saved.output, result.verdict),
	};
});
function inventoryIssues(c: TaskCase, output: Record<string, unknown>, raw: unknown) {
	const parsed = tasksVerifierSchema.safeParse(raw);
	if (!parsed.success) return ["INVALID_VERIFIER_OUTPUT"];
	const verdict = parsed.data;
	const payload = tasksVerifier.buildInput(c, output);
	const pool = (id: string) => JSON.parse(payload.selections.find((s) => "id" in s && s.id === id)?.text ?? "null");
	const response = pool("task-verification-response");
	const context = pool("task-verification-task");
	const issues: string[] = [];
	const compare = (name: string, expected: string[], actual: string[]) => {
		if (
			expected.length !== actual.length ||
			new Set(actual).size !== actual.length ||
			actual.some((id) => !expected.includes(id))
		)
			issues.push(name);
	};
	compare(
		"claim IDs",
		response.claims.map((c: { id: string }) => c.id),
		verdict.verdicts.map((v) => v.claimId),
	);
	compare(
		"full-question IDs",
		response.premiseChecks.map((p: { id: string }) => p.id),
		verdict.premises.map((p) => p.id),
	);
	compare(
		"absence IDs",
		context.absenceChecks.map((a: { id: string }) => a.id),
		verdict.absence.map((a) => a.id),
	);
	if ((context.retention === "applicable") !== (verdict.retention !== null)) issues.push("retention scope");
	if (
		verdict.coverage.status === "complete" &&
		(verdict.verdicts.some((v) => v.verdict !== "supported") ||
			verdict.premises.some((p) => !["supported", "no_candidate_premise"].includes(p.verdict)))
	)
		issues.push("unsafe-response coverage (prompt consistency; schema unchanged)");
	return issues;
}
function metrics(selected: typeof rows) {
	const defects = selected.filter((r) => r.defect !== "gold");
	const honest = selected.filter((r) => r.defect === "gold");
	return {
		defects: defects.length,
		honest: honest.length,
		pipelineCaught: defects.filter((r) => r.pipelineCaught).length,
		verifierCaught: defects.filter((r) => r.caught).length,
		pipelineFalseRejects: honest.filter((r) => r.pipelineFalseReject).length,
		verifierFalseRejects: honest.filter((r) => r.falseReject).length,
		protocolFaults: selected.filter((r) => r.fault).length,
	};
}
const adjusted = rows.filter((r) => !r.invalidGold && !r.omissionQuality);
const artifact = JSON.parse(await readFile(join(source, "results.json"), "utf8")) as {
	calls: BenchmarkCall[];
	stopReason: string;
};
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
const journal = (await readFile(join(source, "calls.jsonl"), "utf8"))
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
const savedCalls = journal.filter((e) => e.type === "scored").map((e) => e.data as BenchmarkCall);
const smoke = rescoreTaskSessions(savedCalls, loadStudyCases("tasks-v1") as TaskCase[]);
if (
	smoke.sessions.length !== artifact.calls.length ||
	smoke.sessions.some((s) => !artifact.calls.some((c) => c.key === s.key))
)
	throw new Error("RESULT_JOURNAL_SESSION_MISMATCH");
const table = manifest.models.flatMap((m: { model: string; provider: string; reasoning: string }) =>
	taskCategories.map((category) => {
		const group = `${m.model}@${m.reasoning} [${m.provider}] / ${category}`;
		return {
			group,
			planned: 3,
			...(smoke.table.find((r) => r.group === group) ?? {
				observed: 0,
				safetyAccepted: 0,
				guardRejects: 0,
				verifierFaults: 0,
				semanticRejects: 0,
				unknownJudgments: 0,
			}),
		};
	}),
);
const canaryReport = {
	sourceStudyHash: receipt.studyHash,
	sourceCanarySha256: createHash("sha256")
		.update(await readFile(join(source, "canaries.json")))
		.digest("hex"),
	originalLabels: metrics(rows),
	adjudicatedSafety: metrics(adjusted),
	perCategory: taskCategories.map((category) => ({
		category,
		...metrics(adjusted.filter((r) => r.category === category)),
	})),
	protocolFaults: rows.filter((r) => r.fault).length,
	total: rows.length,
	protocolAfterRetry: "UNMEASURED: saved receipt has no protocol retries; no new inference authorized",
	currentPlan: {
		probes: currentPlan.length,
		outputCompatibleWithSavedProbe: rows.filter((r) => r.currentProbeOutputUnchanged).length,
		missingChangedProbeVerdicts: rows
			.filter((r) => !r.currentProbeOutputUnchanged)
			.map((r) => ({ caseId: r.caseId, oldDefect: r.defect })),
	},
	promptEffect: `Expected fewer aliases, omissions and scope/coverage inconsistencies; no measured reduction. All ${rows.filter((r) => r.fault).length} saved audit faults remain flagged by unchanged schema/audit rules. A prompt cannot repair saved outputs.`,
	qualifiesCurrentStudy: false,
	rows,
};
const smokeReport = {
	sourceStudyHash: manifest.hash,
	sourceStopReason: artifact.stopReason,
	scoredEvents: savedCalls.length,
	...smoke,
	table,
	qualifiesCurrentStudy: false,
	interpretation:
		"Acceptance requires deterministic guard and an attributable protocol-valid safe tasks verdict. Semantic rejection signals survive unrelated protocol faults as diagnostics. Faults and guard rejections overlap. No inference or missing-session judgments.",
};
await mkdir(out, { recursive: true });
await writeFile(join(out, "canary-replay.json"), JSON.stringify(canaryReport, null, 2) + "\n");
await writeFile(join(out, "smoke-rescore.json"), JSON.stringify(smokeReport, null, 2) + "\n");
await writeFile(
	join(out, "smoke-table.md"),
	[
		"| Variant / category | Safety accepted / observed | Planned | Verifier faults | Guard rejects | Semantic rejects (diagnostic) |",
		"|---|---|---|---|---|---|",
		...table.map(
			(r: (typeof table)[number]) =>
				`| ${r.group} | ${r.safetyAccepted}/${r.observed} | ${r.planned} | ${r.verifierFaults} | ${r.guardRejects} | ${r.semanticRejects} |`,
		),
	].join("\n") + "\n",
);
