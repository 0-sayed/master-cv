import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { parseArgs } from "node:util";

// Set these BEFORE importing production modules. No credentials, env file or network
// is needed to validate immutable model text. Tests exercise the pure replay module.
process.loadEnvFile = () => {
	throw Object.assign(new Error("OFFLINE_ENV_FILE_DISABLED"), { code: "ENOENT" });
};
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_REPLAY_NETWORK_FORBIDDEN"));
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET = "synthetic-offline-replay";

const { values } = parseArgs({
	options: { source: { type: "string" }, out: { type: "string", short: "o" }, checks: { type: "string" } },
	strict: true,
});
if (!values.source || !values.out) throw new Error("SOURCE_AND_EXPLICIT_OUTPUT_REQUIRED");
const source = resolve(values.source);
const out = resolve(values.out);
if (out === source || !relative(source, out).startsWith("..")) throw new Error("REPLAY_OUTPUT_MUST_BE_SEPARATE");
const [
	{ replayCalls },
	{ cases },
	{ loadModels },
	{ smokeCases, studyHash, controls },
	{ estimateBenchmark },
	{ frozenStudy },
] = await Promise.all([
	import("./fairness-replay"),
	import("./corpus"),
	import("./config"),
	import("./study"),
	import("./runner"),
	import("./freeze"),
]);
const { readRepairSource } = await import("./repair");
const { manifest, journalBody: journal } = await readRepairSource(source);
const events = journal
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
const saved = events.filter((e) => e.type === "scored").map((e) => e.data) as import("./runner").BenchmarkCall[];
const latest = [...new Map(saved.map((c) => [c.key, c])).values()];
const writerRaw = events
	.filter((e) => e.type === "raw" && !e.data.key.endsWith(":verify"))
	.map((e) => e.data) as import("./runner").RawRecord[];
if (writerRaw.length !== latest.length || new Set(writerRaw.map((r) => r.key)).size !== latest.length)
	throw new Error("REPLAY_WRITER_INVENTORY_MISMATCH");
for (const raw of writerRaw) {
	const body = JSON.parse(raw.body);
	const literal = body.choices?.[0]?.message?.content ?? "";
	if (latest.find((c) => c.key === raw.key)?.output !== literal) throw new Error("REPLAY_LITERAL_OUTPUT_MISMATCH");
}
const replay = replayCalls(latest);
const table = (language = false) => {
	const groups = new Map<string, typeof replay>();
	for (const row of replay) {
		const key = [row.model, row.category, ...(language ? [row.language] : [])].join("/");
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}
	return [...groups.entries()].map(([key, rows]) => {
		const percentage = (n: number) => (100 * n) / rows.length;
		return {
			group: key,
			sessions: rows.length,
			noModelOutput: rows.filter((r) => !r.modelOutputAvailable).length,
			before: {
				schemaValidPercent: percentage(rows.filter((r) => r.before.schemaValid).length),
				emptyPercent: percentage(rows.filter((r) => r.before.emptyAnswer).length),
				noChangeHonestPercent: null,
				fabricationCount: rows.reduce((n, r) => n + r.before.fabrications, 0),
			},
			after: {
				schemaValidPercent: percentage(rows.filter((r) => r.schemaValid).length),
				emptyPercent: percentage(rows.filter((r) => r.emptyAnswer).length),
				noChangeHonestPercent: null,
				noChangePending: rows.filter((r) => r.noChangeProposed).length,
				fabricationCount: rows.reduce((n, r) => n + (r.score?.unsupportedClaims.length ?? 0), 0),
			},
		};
	});
};
const models = loadModels();
const smoke = smokeCases(cases, models);
const forecast = estimateBenchmark(models, smoke, 1, [], loadModels(), "smoke");
const historicalCalibration = estimateBenchmark(models, smoke, 1, manifest.calibration, loadModels(), "smoke");
// Exact payer totals from today's actual sessions. Do not turn an unbilled request
// rejection into an observed zero-cost successful session, or invent absent samples.
const observed = models.map((model) => {
	const rows = latest.filter(
		(c) =>
			c.model === model.model &&
			c.provider === model.provider &&
			c.reasoning === model.reasoning &&
			c.output.trim() &&
			c.costMicros !== null,
	);
	const paired = rows.filter(
		(c) => c.verifierUsage && c.verifierUsage.inputTokens > 0 && c.verifierUsage.outputTokens > 0,
	);
	const router = (calls: typeof rows) =>
		calls.reduce((n, c) => n + (c.openRouterCostMicros ?? 0), 0) / Math.max(1, calls.length) / 1e6;
	const openai = (calls: typeof rows) =>
		calls.reduce((n, c) => n + (c.openaiCostMicros ?? 0), 0) / Math.max(1, calls.length) / 1e6;
	const planned = cases.filter((c) => !c.exploratory).length * 3;
	const calibration = manifest.calibration.find(
		(c: import("./runner").Calibration) =>
			c.model === model.model && c.provider === model.provider && c.reasoning === model.reasoning,
	);
	const calibratedMean = calibration
		? ((calibration.pairOpenRouterCostMicros ?? 0) + (calibration.pairOpenaiCostMicros ?? 0)) / 1e6
		: null;
	return {
		...model,
		samples: rows.length,
		completedPairSamples: paired.length,
		meanActualSessionUsd: rows.length ? router(rows) + openai(rows) : null,
		meanCompletedPairUsd: paired.length ? router(paired) + openai(paired) : null,
		actualToHistoricalCalibration:
			rows.length && calibratedMean ? (router(rows) + openai(rows)) / calibratedMean : null,
		plannedSessions: planned,
		projectedFullUsd: paired.length ? (router(paired) + openai(paired)) * planned : null,
		observedMixedCompletionProjectionUsd: rows.length ? (router(rows) + openai(rows)) * planned : null,
		projectedOpenRouterUsd: paired.length ? router(paired) * planned : null,
		projectedOpenaiUsd: paired.length ? openai(paired) * planned : null,
	};
});
const unmeasured = observed.filter((r) => !r.completedPairSamples);
const rawFullProjection = observed.reduce((n, r) => n + (r.projectedFullUsd ?? 0), 0);
const missingEstimate = estimateBenchmark(
	models.filter((m) => unmeasured.some((u) => u.model === m.model && u.reasoning === m.reasoning)),
	cases,
	3,
);
const fullProjection = rawFullProjection + missingEstimate.estimatedUsd;
const observedCost = observed.reduce((n, r) => n + (r.meanActualSessionUsd ?? 0) * r.samples, 0);
const historicalCostForSameSessions = observed.reduce(
	(n, r) =>
		n +
		(r.actualToHistoricalCalibration
			? ((r.meanActualSessionUsd ?? 0) * r.samples) / r.actualToHistoricalCalibration
			: 0),
	0,
);
const invalid = replay
	.filter((r) => r.modelOutputAvailable && !r.schemaValid)
	.map((r) => ({
		key: r.key,
		model: r.model,
		category: r.category,
		caseId: r.caseId,
		issues: r.schemaIssues,
		output: r.output,
	}));
const safetyRejected = replay
	.filter((r) => r.schemaValid && !r.guardAccepted)
	.map((r) => ({
		key: r.key,
		model: r.model,
		category: r.category,
		caseId: r.caseId,
		error: r.guardError,
		output: r.output,
		score: r.score,
	}));
const control = controls(cases);
const checks = values.checks ? JSON.parse(await readFile(resolve(values.checks), "utf8")) : null;
const hash = studyHash(models, cases, 3);
const report = {
	studyId: frozenStudy.studyId,
	studyHash: hash,
	sourceHash: manifest.hash,
	sourceJournalHash: createHash("sha256").update(journal).digest("hex"),
	scoredEvents: saved.length,
	writerRawRecords: writerRaw.length,
	uniqueSessions: latest.length,
	openaiSessions: latest.filter((c) => c.provider === "openai").length,
	verifierStatus:
		"Every saved verdict needs re-verification: questions, notes and task context changed. Replay is NOT qualification; no saved output was repaired or rewritten. No-change honesty percentages are unmeasured, not zero; notes alone cannot prove honesty.",
	denominators:
		"Percentages use every saved session, including nine OpenAI request errors with no model output. No-model-output rows are separately identified and never called model schema errors. Fabrication counts are deterministic diagnostics, not verifier-confirmed semantic truth; new validation exposes previously unscored outputs.",
	tables: table(),
	perLanguage: table(true),
	invalid,
	safetyRejected,
	replay,
	control,
	smoke: {
		sessions: forecast.calls,
		categories: ["wording", "extraction", "missing-info", "injection"],
		languages: ["ar", "en", "mixed"],
		variants: models.length,
		forecast,
		historicalCalibration,
		oldSmokeQualifies: false,
	},
	cost: {
		basis:
			"Today (2026-11-13), exact payer costs including the OpenRouter fee once. Completed generation+verifier means project new completed sessions; unbilled request failures and missing judges are not free completed sessions. Missing DeepSeek-low measurements use the separately disclosed catalog/token forecast. Historical calibration is forecast evidence only, invalid for qualifying this study. New prompts/verifier/schema can change usage; paid smoke is still required.",
		observed,
		measuredVariants: observed.length - unmeasured.length,
		unmeasured: unmeasured.map((r) => `${r.model}@${r.reasoning}`),
		measuredVariantFullUsd: rawFullProjection,
		observedMixedCompletionProjectionUsd: observed.reduce(
			(n, r) => n + (r.observedMixedCompletionProjectionUsd ?? 0),
			0,
		),
		unmeasuredCatalogUsd: missingEstimate.estimatedUsd,
		projectedFullUsd: fullProjection,
		observedCostUsd: observedCost,
		observedToHistoricalPairCalibration: historicalCostForSameSessions
			? observedCost / historicalCostForSameSessions
			: null,
		projectedOpenRouterUsd:
			observed.reduce((n, r) => n + (r.projectedOpenRouterUsd ?? 0), 0) + missingEstimate.openRouterEstimatedUsd,
		projectedOpenaiUsd:
			observed.reduce((n, r) => n + (r.projectedOpenaiUsd ?? 0), 0) + missingEstimate.openaiEstimatedUsd,
		samplingLimit:
			"OpenAI: only three completed pairs per variant; DeepSeek/Gemini: 155 completed pairs each. Different task mix, changed prompts/verifier and the unmeasured DeepSeek-low variant prevent a measured new-study price claim.",
	},
	checks,
};
await mkdir(out, { recursive: true });
await writeFile(join(out, "replay.json"), JSON.stringify(report, null, 2));
const pct = (v: number) => `${v.toFixed(2)}%`;
const rows = report.tables.map(
	(r) =>
		`| ${r.group} | ${r.sessions} | ${pct(r.before.schemaValidPercent)} → ${pct(r.after.schemaValidPercent)} | ${pct(r.before.emptyPercent)} → ${pct(r.after.emptyPercent)} | unmeasured → pending (${r.after.noChangePending}) | ${r.before.fabricationCount} → ${r.after.fabricationCount} |`,
);
const invalidExamples = [...new Set(invalid.map((r) => r.model))].map((model) => {
	const row = invalid.find((r) => r.model === model);
	return row
		? `- ${model}, ${row.caseId}: ${row.issues[0]?.path.join(".")} — ${row.issues[0]?.message}. Literal output: ${row.output.replace(/\n/gu, " ")}`
		: "";
});
const costRows = observed.map(
	(r) =>
		`| ${r.model}@${r.reasoning} | ${r.samples} / ${r.completedPairSamples} | ${r.meanActualSessionUsd?.toFixed(6) ?? "unmeasured"} | ${r.meanCompletedPairUsd?.toFixed(6) ?? "unmeasured"} | ${r.projectedFullUsd?.toFixed(6) ?? "catalog proxy, separately disclosed"} |`,
);
await writeFile(
	join(out, "replay.md"),
	`New study ${hash}. Historical smoke invalid. ${report.verifierStatus}\n\n${report.denominators}\n\n| Model / category | Sessions | Schema valid before → after | Empty before → after | No-change honest before → after | Fabrication diagnostics before → after |\n|---|---:|---:|---:|---|---:|\n${rows.join("\n")}\n\nRemaining schema failures are genuine violations of the now-disclosed v5 contract; the old prompt omitted these rules, so they are not evidence that these writers ignored v5. No output is silently repaired. Examples:\n\n${invalidExamples.join("\n")}\n\n${safetyRejected.length} local safety rejections remain diagnostic, not adjudicated model errors; every semantic verdict needs re-verification. Hard-fact guards are unchanged.\n\n| Variant | Actual output / complete pair samples | Actual session mean USD | Complete pair mean USD | Full 252-session projection USD |\n|---|---:|---:|---:|---:|\n${costRows.join("\n")}\n\n${report.cost.basis} ${report.cost.samplingLimit} New smoke: token forecast $${forecast.estimatedUsd.toFixed(6)}; historical calibrated reservation projection $${historicalCalibration.estimatedUsd.toFixed(6)} (OpenRouter $${historicalCalibration.openRouterEstimatedUsd.toFixed(6)} + OpenAI $${historicalCalibration.openaiEstimatedUsd.toFixed(6)}), not a new-study calibration. Full projection $${fullProjection.toFixed(6)} includes $${missingEstimate.estimatedUsd.toFixed(6)} for the unmeasured variant.\n\nFull examples, local safety failures, per-language tables, costs and every literal output: replay.json.\n`,
);
if (checks) {
	const smokeCommand =
		"pnpm --filter @reactive-resume/tooling eval:review --stage smoke --budget-usd 9 --openai-budget-usd 40 --approval-file <reviewed-approval.json> --env-file <benchmark-key-file> -o evaluations/results";
	const lines = [
		"1. Fixed verifier: questions/notes/task context are non-evidence; independent response judgment; no-edit retention N/A and correct no-change reasons accepted (production + benchmark).",
		"2. Fixed contracts: section-specific extraction fields/types, safe IDs, limits and four category examples; grouped literal claims allowed; full citation/evidence/hard-fact checks retained.",
		"3. Fixed scoring: structural failure ≠ empty ≠ honest no-change; only actual edits enter retention; only warranted improvements enter usefulness.",
		"4. Fixed question matching: reviewed AR/EN morphology and topic + requested-information controls cover reports, store count and request volume; unrelated/negated questions fail.",
		"5. Fixed missing-info eligibility: question correctness has its own denominator; zero required facts does not disqualify it.",
		`6. Fixed task selection: safety and ≤0.3 fidelity gap must pass separately in AR, EN and mixed; per-language metrics reported. New study ${hash}; November 12 smoke invalid.`,
		`7. Offline replay ${latest.length} unique sessions (${report.openaiSessions} OpenAI), ${saved.length} scored events: schema-valid ${latest.filter((c) => c.schemaValid).length}→${replay.filter((r) => r.schemaValid).length}; empty ${latest.filter((c) => c.emptyAnswer).length}→${replay.filter((r) => r.emptyAnswer).length}; all verdicts need re-verification; tables: replay.md / replay.json.`,
		`8. Remaining genuine v5 contract violations: ${invalid.length} extraction outputs (e.g. experience/jobTitle or experience/title instead of position; paths/literal examples in replay.md); the old prompt omitted these rules. ${safetyRejected.length} local safety rejects require adjudication, not labelled model errors; ${latest.length - replay.filter((r) => r.modelOutputAvailable).length} request errors had no output. No-change honesty remains unmeasured.`,
		`9. New smoke (${forecast.calls} sessions = 4 categories × ${models.length} variants × 3 languages): ${smokeCommand}; token forecast $${forecast.estimatedUsd.toFixed(6)}, historical calibration projection $${historicalCalibration.estimatedUsd.toFixed(6)} (forecast only). Full ${models.length * cases.filter((c) => !c.exploratory).length * 3} sessions: today's completed-pair projection $${fullProjection.toFixed(6)} (${observed.length - unmeasured.length} measured variants + $${missingEstimate.estimatedUsd.toFixed(6)} catalog proxy for ${unmeasured.length} unmeasured); details in replay.json.`,
		`10. Tests: ${JSON.stringify(checks)}; no inference, .env reads, staging or commits.`,
	];
	await writeFile(join(out, "final-17.md"), lines.join("\n") + "\n");
}
