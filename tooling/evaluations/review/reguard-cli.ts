import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Disable every automatic environment loader before importing application code.
process.loadEnvFile = () => {};
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET ??= "synthetic-reguard-only";
const { values } = parseArgs({
	options: {
		source: { type: "string" },
		out: { type: "string", short: "o" },
		baseline: { type: "string" },
		resume: { type: "boolean" },
		reverify: { type: "boolean" },
		"credential-file": { type: "string" },
	},
});
if (!values.out || (!values.source && !values.resume)) throw new Error("SOURCE_AND_EXPLICIT_OUTPUT_REQUIRED");
const out = resolve(values.out);
const hash = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const prior = values.resume ? await json(join(out, "reguard-manifest.json")) : null;
const source = resolve(values.source ?? prior.source);
if (out === source || out === resolve("..") || out === process.cwd())
	throw new Error("SEPARATE_REPORT_DIRECTORY_REQUIRED");
if (!values.reverify) globalThis.fetch = () => Promise.reject(new Error("OFFLINE_REGUARD_NETWORK_FORBIDDEN"));
const [
	{ reguardCalls },
	{ readJournal, appendEvent },
	{ scoreBenchmark },
	{ controls },
	{ cases },
	{ runBenchmark },
	{ assertFrozenStudy },
	{ withOpenRouterFee },
	{ gracefulDrain },
] = await Promise.all([
	import("./reguard"),
	import("./journal"),
	import("./metrics"),
	import("./study"),
	import("./corpus"),
	import("./runner"),
	import("./freeze"),
	import("./budget"),
	import("./interrupt"),
]);
const freeze = assertFrozenStudy();
const sourceManifestText = await readFile(join(source, "manifest.json"), "utf8");
const manifest = JSON.parse(sourceManifestText);
const sourceJournal = await readFile(join(source, "calls.jsonl"), "utf8");
const sourceResults = await json(join(source, "results.json"));
const sourceHistory = await readJournal(join(source, "calls.jsonl"));
const latest = [...new Map(sourceHistory.previousCalls.map((c) => [c.key, c])).values()];
if (
	JSON.stringify(latest.map((c) => [c.key, c.output, c.guardAccepted]).sort()) !==
	JSON.stringify(
		sourceResults.calls.map((c: import("./runner").BenchmarkCall) => [c.key, c.output, c.guardAccepted]).sort(),
	)
)
	throw new Error("REGUARD_RESULTS_JOURNAL_MISMATCH");
const writers = new Map(sourceHistory.rawRecords.filter((r) => !r.key.endsWith(":verify")).map((r) => [r.key, r]));
for (const c of latest) {
	const raw = writers.get(c.key);
	if (!raw || (JSON.parse(raw.body).choices?.[0]?.message?.content ?? "") !== c.output)
		throw new Error("REGUARD_LITERAL_OUTPUT_MISMATCH");
}
const identity = {
	source,
	sourceStudyHash: manifest.hash,
	sourceJournalHash: hash(sourceJournal),
	sourceManifestHash: hash(sourceManifestText),
	targetStudyHash: hash(JSON.stringify({ sourceStudy: manifest.hash, freeze })),
	guardVersion: "literal-evidence",
	budgetUsd: manifest.budgetUsd,
	openaiBudgetUsd: manifest.openaiBudgetUsd,
};
if (prior && JSON.stringify(prior) !== JSON.stringify(identity)) throw new Error("REGUARD_RESUME_IDENTITY_MISMATCH");
const control = controls(cases);
if (!control.pass) throw new Error("REGUARD_CONTROLS_FAILED");
const replay = reguardCalls(latest);
const changed = replay.sessions.filter((s) => s.changed);
const judges = new Map(sourceHistory.rawRecords.filter((r) => r.key.endsWith(":verify")).map((r) => [r.key, r]));
for (const session of changed.filter((s) => !s.needsReverification.length)) {
	const call = latest.find((c) => c.key === session.key);
	if (!call) throw new Error("REGUARD_SESSION_MISSING");
	const raw = judges.get(session.key + ":verify");
	if (
		!raw ||
		raw.status !== 200 ||
		raw.fixtureHash !== call.fixtureHash ||
		raw.promptHash !== call.promptDigest ||
		raw.model !== call.verifierUsage?.model ||
		raw.reasoning !== call.verifierUsage?.reasoning ||
		JSON.stringify(JSON.parse(JSON.parse(raw.body).choices[0].message.content)) !== JSON.stringify(call.verifierVerdict)
	)
		throw new Error("REGUARD_VERIFIER_RECORD_MISMATCH");
}
const pending = changed.filter((s) => s.after && s.needsReverification.length);
const groups = [
	...new Set(replay.sessions.map((s) => JSON.stringify([s.model, s.reasoning, s.holdout, s.category]))),
].map((key) => {
	const [model, reasoning, holdout, category] = JSON.parse(key);
	const rows = replay.sessions.filter((s) => JSON.stringify([s.model, s.reasoning, s.holdout, s.category]) === key);
	return {
		model,
		reasoning,
		holdout,
		category,
		sessions: rows.length,
		beforePass: rows.filter((s) => s.before).length,
		afterPass: rows.filter((s) => s.after).length,
		changed: rows.filter((s) => s.changed).length,
		needsReverification: rows.filter((s) => s.after && s.needsReverification.length).length,
	};
});
const measuredVerifierRates = [
	...new Set(latest.filter((c) => c.verifierUsage).map((c) => JSON.stringify([c.category, c.verifierUsage?.model]))),
].map((key) => {
	const [category, model] = JSON.parse(key);
	const measured = latest
		.filter(
			(c) =>
				c.category === category &&
				c.verifierUsage?.model === model &&
				!c.verifierFault &&
				c.verifierUsage?.costMicros != null,
		)
		.map((c) =>
			model.startsWith("deepseek/")
				? withOpenRouterFee(c.verifierUsage?.costMicros ?? 0)
				: (c.verifierUsage?.costMicros ?? 0),
		)
		.sort((a, b) => a - b);
	if (!measured.length) throw new Error("MEASURED_VERIFIER_COST_REQUIRED");
	const mean = Math.ceil(measured.reduce((a, b) => a + b, 0) / measured.length);
	return {
		category,
		verifier: model,
		samples: measured.length,
		meanMicros: mean,
		p95Micros: measured[Math.ceil(measured.length * 0.95) - 1],
	};
});
const verifierCosts = pending.map((s) => {
	const model = s.model.startsWith("openai/") ? "deepseek/deepseek-v4.1-flash-1017" : "openai/gpt-6-luna";
	const rate = measuredVerifierRates.find((r) => r.category === s.category && r.verifier === model);
	if (!rate) throw new Error("MEASURED_VERIFIER_COST_REQUIRED");
	return { key: s.key, ...rate };
});
const oldScores = scoreBenchmark(latest);
if (
	sourceResults.scores.some(
		(s: import("./metrics").ScoreGroup) =>
			oldScores.find(
				(r) =>
					r.model === s.model &&
					r.reasoning === s.reasoning &&
					r.holdout === s.holdout &&
					r.dimension === s.dimension &&
					r.value === s.value,
			)?.falseRejects !== s.falseRejects,
	)
)
	throw new Error("SCORER_FALSE_REJECT_DEFINITION_MISMATCH");
await mkdir(out, { recursive: true });
if (!prior) await writeFile(join(out, "reguard-manifest.json"), JSON.stringify(identity, null, 2), { flag: "wx" });
const report = {
	...identity,
	qualification: "paired guard-only replay; previously inspected holdout, not unseen validation",
	falseRejectDefinition:
		"outcome != transient AND no verifier fault AND adjudication != verifier-fault AND honestOutput AND (!guardAccepted OR !verifierAccepted)",
	scorerDefinitionVerified: true,
	groups,
	sessions: replay.sessions,
	controls: control,
	changed: changed.length,
	needsReverification: pending,
	verifierCosts,
	measuredVerifierRates,
	estimatedVerifierUsd: verifierCosts.reduce((n, c) => n + c.meanMicros, 0) / 1e6,
	beforeScores: oldScores,
	afterScores: scoreBenchmark(replay.calls),
};
await writeFile(join(out, "reguard.json"), JSON.stringify(report, null, 2));
await writeFile(
	join(out, "guard-pass.csv"),
	[
		"model,reasoning,holdout,category,sessions,beforePass,afterPass,changed,needsReverification",
		...groups.map((g) => Object.values(g).join(",")),
	].join("\n") + "\n",
);
if (values.baseline) {
	const baseline = await json(resolve(values.baseline));
	const rejected = latest
		.filter((c) => c.schemaValid && !c.guardAccepted)
		.map((c) => c.key)
		.sort();
	if (JSON.stringify(baseline.rows.map((r: { key: string }) => r.key).sort()) !== JSON.stringify(rejected))
		throw new Error("REGUARD_AUDIT_COVERAGE_MISMATCH");
	await writeFile(join(out, "guard-audit.json"), JSON.stringify(baseline, null, 2));
	await writeFile(join(out, "guard-audit.md"), baseline.markdown);
}
await writeFile(
	join(out, "results.json"),
	JSON.stringify(
		{
			...sourceResults,
			id: `${sourceResults.id}-literal-evidence`,
			calls: replay.calls,
			study: { ...sourceResults.study, hash: identity.targetStudyHash },
			scores: scoreBenchmark(replay.calls),
			reguard: identity,
		},
		null,
		2,
	),
);
if (values.reverify) {
	const journal = join(out, "calls.jsonl");
	try {
		await access(journal);
	} catch {
		await writeFile(journal, sourceJournal, { flag: "wx" });
	}
	const history = await readJournal(journal);
	if (!(await readFile(journal, "utf8")).startsWith(sourceJournal)) throw new Error("REGUARD_JOURNAL_PREFIX_MISMATCH");
	const completed = new Map(history.previousCalls.map((c) => [c.key, c]));
	const keys = pending
		.filter(
			(s) =>
				completed.get(s.key)?.sessionAttempts === latest.find((c) => c.key === s.key)?.sessionAttempts ||
				completed.get(s.key)?.verifierFault,
		)
		.map((s) => s.key);
	let key: string | undefined;
	if (keys.length) {
		if (pending.some((s) => s.needsReverification.includes("verifier-input-identity-changed")))
			throw new Error("REGUARD_REQUEST_CHANGED");
		if (!values["credential-file"] || basename(values["credential-file"]).startsWith(".env"))
			throw new Error("EXPLICIT_NON_ENV_CREDENTIAL_FILE_REQUIRED");
		const { readBenchmarkKey } = await import("./credentials");
		key = await readBenchmarkKey(values["credential-file"]);
	}
	const drain = gracefulDrain();
	try {
		const artifact = await runBenchmark({
			...history,
			previousCalls: reguardCalls([...completed.values()]).calls,
			reverifyKeys: keys,
			models: manifest.models,
			verifierModels: manifest.models,
			cases: cases.filter((c) => !c.exploratory),
			runs: manifest.runs,
			phase: "full",
			fake: false,
			...(key ? { key } : {}),
			budgetUsd: manifest.budgetUsd,
			openaiBudgetUsd: manifest.openaiBudgetUsd,
			priorSpendMicros: manifest.priorSpendMicros,
			priorOpenaiSpendMicros: manifest.priorOpenaiSpendMicros,
			calibration: manifest.calibration,
			sessionConcurrency: manifest.sessionConcurrency,
			openaiConcurrency: manifest.openaiConcurrency,
			togetherConcurrency: manifest.togetherConcurrency,
			maxUnverified: manifest.maxUnverified,
			signal: drain.signal,
			onReserve: (data) => appendEvent(journal, { type: "reserved", data }),
			onRaw: (data) => appendEvent(journal, { type: "raw", data }),
			onAttempt: (data) => appendEvent(journal, { type: "attempt", data }),
			onCall: (data) => appendEvent(journal, { type: "scored", data }),
		});
		await writeFile(
			join(out, "reverified-results.json"),
			JSON.stringify({ ...artifact, scores: scoreBenchmark(artifact.calls), reguard: identity }, null, 2),
		);
	} finally {
		drain.dispose();
	}
	await writeFile(
		join(out, "reverification-status.json"),
		JSON.stringify({ eligible: pending.length, requested: keys.length }, null, 2),
	);
}
