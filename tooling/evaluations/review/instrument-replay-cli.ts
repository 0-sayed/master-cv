import { required } from "./required";
/** Offline only. No provider client, campaign runner, or transport is invoked here. */
process.loadEnvFile = () => {};
const { readFile, writeFile, mkdir } = await import("node:fs/promises");
const { createHash } = await import("node:crypto");
const { parseArgs } = await import("node:util");
const { resolve, join } = await import("node:path");
const { loadStudyCases } = await import("./study");
const { getTaskContract } = await import("./contracts");
const { tasksVerifier } = await import("./contracts/verifier/verifier");
const { toEvaluation } = await import("./contracts/types");
const { smokeCellReport, sessionRouterCostMicros } = await import("./instrument");
const { safetyPass, criticalSafetyFailure } = await import("./metrics");
const { values } = parseArgs({
	options: { results: { type: "string" }, journal: { type: "string" }, out: { type: "string" } },
});
if (!values.results || !values.journal || !values.out) throw new Error("RESULTS_JOURNAL_OUT_REQUIRED");
const bytes = await readFile(resolve(values.results));
const original = JSON.parse(bytes.toString()) as import("./runner").BenchmarkArtifact;
if (original.calls.length !== 54 || original.calls.some((c) => c.holdout)) throw new Error("TUNING_SMOKE_REQUIRED");
const cases = loadStudyCases("tasks-v1");
const journalBytes = await readFile(resolve(values.journal));
const events = journalBytes
	.toString()
	.trim()
	.split("\n")
	.map((line) => JSON.parse(line));
const raw = events.filter((e) => e.type === "raw").map((e) => e.data);
const entries = original.calls.map((call) => {
	const c = required(cases.find((c) => c.id === call.caseId)) as import("./contracts/types").TaskCase;
	const contract = getTaskContract(c.category);
	const output = contract.outputSchema.parse(JSON.parse(required(call.output)));
	const local = contract.score(c, output, null);
	const score = contract.score(c, output, call.verifierVerdict);
	const fault = tasksVerifier.auditFault(c, output as Record<string, unknown>, call.verifierVerdict);
	const assessment = fault
		? null
		: tasksVerifier.assess(c, output as Record<string, unknown>, call.verifierVerdict as Record<string, unknown>);
	const evaluation = toEvaluation(score);
	const replayed = {
		...call,
		...evaluation,
		verifierFault: fault,
		verifierAccepted: assessment?.accepted ?? false,
		adjudication: fault ? "verifier-fault" : assessment?.accepted ? "verifier" : "pending-human",
	} as import("./runner").BenchmarkCall;
	const semantic = call.verifierVerdict as { verdicts: { verdict: string }[]; coverage: { status: string } };
	const rules: string[] = [];
	if (call.guardError === "SUMMARY_UNCOVERED_TEXT")
		rules.push("WRITER_ANNOTATION: exact spans omit punctuation/conjunction; supported facts remain safe");
	if (c.category === "job-evidence") {
		const quality = contract.score(c, output, null).quality;
		if (
			local.safetyDeterministic.pass &&
			quality.value === 1 &&
			semantic.verdicts.every((v) => v.verdict === "supported")
		)
			rules.push(
				"FIXTURE_RULE: requirement verdicts and cited facts match the authored tuning expectations; bounded SAP absence is correct",
			);
	}
	if (c.category === "tailoring" && local.quality.value === 0 && !call.verifierAccepted && replayed.verifierAccepted)
		rules.push(
			"STRUCTURAL_PROOF: validated empty patches, unchanged approved order and empty notes; safe with zero change quality",
		);
	if (c.category === "cover-letter") {
		if (!local.safetyDeterministic.pass) rules.push("WRITER_CITATION: candidate title lacks its supporting CV ID");
		else if (!call.guardAccepted)
			rules.push("GUARD_FALSE_REJECT: cited date/role/relative-particle/document paraphrases preserve supplied facts");
		if (semantic.coverage.status === "uncovered")
			rules.push(
				"WRITER_ANNOTATION: factual experience sentence outside claims; the repaired prompt now states this rule explicitly",
			);
		if (local.quality.pass === false)
			rules.push("WRITER_LENGTH: body fails the unchanged 180–320 word or paragraph requirement");
	}
	if (c.category === "interview-prep")
		rules.push(
			"QUESTION_RULE: evaluate each full question; deliver at least five safe questions in the requested language",
		);
	if (c.category === "translation" && fault)
		rules.push(
			"QUALITY_UNRESOLVED: saved verdict lacks valid MQM; new judge or qualified human quality review required",
		);
	const seconds = raw.filter((r) => r.key.split(":verify")[0] === call.key).reduce((n, r) => n + r.latencyMs / 1000, 0);
	return {
		call: replayed,
		originalUsable: call.guardAccepted && call.verifierAccepted && !call.verifierFault,
		usable: replayed.guardAccepted && replayed.verifierAccepted && !fault,
		safety: safetyPass(replayed),
		critical: criticalSafetyFailure(replayed),
		rules,
		localGuard: local.safetyDeterministic,
		rawAttemptSeconds: seconds,
		routerMicros: sessionRouterCostMicros(call),
		openaiMicros: call.openaiCostMicros ?? 0,
	};
});
const matrix = entries.map((e) => ({
	key: e.call.key,
	model: e.call.model,
	reasoning: e.call.reasoning,
	category: e.call.category,
	language: e.call.language,
	originalUsable: e.originalUsable,
	usable: e.usable,
	safety: e.safety,
	fault: e.call.verifierFault,
	guard: e.call.guardError,
	retainedQuestionIds: e.call.taskScore?.retainedQuestionIds ?? null,
	rules: e.rules,
	humanDecision: false,
}));
const variants = [...new Set(entries.map((e) => `${e.call.model}@${e.call.reasoning}`))].map((key) => {
	const rows = entries.filter((e) => `${e.call.model}@${e.call.reasoning}` === key);
	return {
		key,
		usable: rows.filter((e) => e.usable).length,
		safe: rows.filter((e) => e.safety).length,
		sessions: rows.length,
		fullSessions: rows.length * 36,
		fullRouterUsd: (rows.reduce((n, e) => n + e.routerMicros, 0) * 36) / 1e6,
		fullOpenaiUsd: (rows.reduce((n, e) => n + e.openaiMicros, 0) * 36) / 1e6,
		fullSerialHours: (rows.reduce((n, e) => n + e.rawAttemptSeconds, 0) * 36) / 3600,
	};
});
const priorRejected = entries.filter((e) =>
	["pending-human", "verifier-fault"].includes(
		required(original.calls.find((c) => c.key === e.call.key)).adjudication ?? "",
	),
);
const report = {
	mode: "offline",
	actualSpendUsd: 0,
	sourceSha256: createHash("sha256").update(bytes).digest("hex"),
	journalSha256: createHash("sha256").update(journalBytes).digest("hex"),
	note: "Saved judgments are not new evidence of the repaired judge. Fixture-rule classifications are automated offline conclusions, not human decisions.",
	sessions: matrix.length,
	matrix,
	variants,
	cells: smokeCellReport(entries.map((e) => e.call)),
	priorRejected: priorRejected.map((e) => ({
		key: e.call.key,
		rules: e.rules,
		unresolvedHumanSafety: e.rules.length === 0,
	})),
	unresolvedQuality: matrix.filter((e) => e.fault?.startsWith("VERIFIER_MQM")).map((e) => e.key),
};
await mkdir(resolve(values.out), { recursive: true });
await writeFile(join(resolve(values.out), "replay.json"), JSON.stringify(report, null, 2));
await writeFile(
	join(resolve(values.out), "results.json"),
	JSON.stringify(
		{ ...original, calls: entries.map((e) => e.call), mode: "offline-replay", sourceStopReason: original.stopReason },
		null,
		2,
	),
);
console.log(
	JSON.stringify({
		sessions: report.sessions,
		variants,
		unresolvedSafety: report.priorRejected.filter((e) => e.unresolvedHumanSafety).length,
		unresolvedQuality: report.unresolvedQuality.length,
	}),
);
