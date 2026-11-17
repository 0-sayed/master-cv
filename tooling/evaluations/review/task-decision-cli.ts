import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

process.loadEnvFile = () => {};
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET ??= "synthetic-offline-decision";
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_DECISION_NETWORK_FORBIDDEN"));
const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { root: { type: "string" }, out: { type: "string", short: "o" }, fixture: { type: "boolean" } },
});
const { completionContext, outputRoot, readJson, saveJson } = await import("./task-completion-context");
const { rateTranslations, mergeCompletion, repairGuards, digest, translationReviewOutputs } =
	await import("./task-completion");
const { buildDecisionEvidence } = await import("./decision-table");
const { decideEvidence } = await import("./decision");
const root = values.root ?? outputRoot;
const finalPath = "/mnt/storage/master-cv-design-archive/ui-audit/benchmark-decision-tasks-v1-final.md";
if (values.fixture && (!values.out || resolve(values.out) === finalPath || resolve(root) === outputRoot))
	throw new Error("FIXTURE_REQUIRES_SEPARATE_ROOT_AND_OUTPUT");
const context = await completionContext();
const packet = await readJson(join(root, "translation-ratings/private-binding.json"));
if (packet.bindingHash !== context.bindingHash) throw new Error("RATING_PACKAGE_BINDING_CHANGED");
if (digest(packet.outputs) !== digest(translationReviewOutputs(context.cases, context.source.calls)))
	throw new Error("RATING_PACKAGE_WRITER_OR_SOURCE_CHANGED");
const publicOutputs = [];
for (let i = 0; i < packet.outputs.length; i += 12) {
	const batch = await readJson(join(root, `translation-ratings/batch-${String(i / 12 + 1).padStart(2, "0")}.json`));
	publicOutputs.push(...batch.outputs);
}
if (
	digest(publicOutputs) !==
	digest(packet.outputs.map(({ key: _key, writerDigest: _digest, ...o }: { key: string; writerDigest: string }) => o))
)
	throw new Error("BLIND_PACKAGE_CHANGED");
const ratingsPaths = [1, 2].map((n) => join(root, `translation-ratings/ratings-pass-${n}.json`));
if (positionals[0] === "validate-ratings") {
	const rated = rateTranslations(packet, await Promise.all(ratingsPaths.map(readJson)), values.fixture);
	console.log(
		JSON.stringify({
			passed: true,
			outputs: rated.size,
			ratings: rated.size * 2,
			reviewKind: values.fixture ? "fixture" : "ai",
			model: values.fixture ? "scripted" : "gpt-6-astra",
		}),
	);
} else if (positionals[0] === "rebuild") {
	const out = values.out ?? finalPath;
	const prefix = values.fixture ? "fake-" : "";
	const needed = [
		join(root, `${prefix}translation/results.json`),
		join(root, `${prefix}cover-letter/results.json`),
		...ratingsPaths,
	];
	const missing: string[] = [];
	const data = await Promise.all(
		needed.map(async (p) => {
			try {
				return await readJson(p);
			} catch (e) {
				if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
				missing.push(p);
				return null;
			}
		}),
	);
	if (missing.length) {
		await writeFile(
			out,
			"# tasks-v1 final decision\n\nBLOCKED: paid completion and translation ratings remain pending. No final model selection is available.\n\n" +
				missing
					.sort()
					.map((p) => `- Missing: \`${p}\``)
					.join("\n") +
				"\n",
		);
		console.log(JSON.stringify({ status: "BLOCKED", missing: missing.length, spendUsd: 0 }));
		process.exitCode = 2;
	} else {
		const [translation, cover, ...passes] = data;
		for (const a of [translation, cover]) {
			if (a.completion?.bindingHash !== context.bindingHash || a.mode !== (values.fixture ? "fake" : "live"))
				throw new Error("LIVE_BOUND_COMPLETION_REQUIRED");
			if (a.stopReason || a.incomplete?.length || a.modelStops.length) throw new Error("COMPLETION_NOT_FINISHED");
		}
		let calls = mergeCompletion(context.source, translation, cover, values.fixture);
		const expected = new Set(
			context.cases
				.filter((c) => c.holdout)
				.flatMap((c) =>
					context.models.flatMap((m) =>
						[0, 1, 2].map((run) => JSON.stringify([c.id, m.model, m.provider, m.reasoning, run])),
					),
				),
		);
		const actual = calls.map((c) => JSON.stringify([c.caseId, c.model, c.provider, c.reasoning, c.runIndex]));
		if (
			actual.length !== expected.size ||
			new Set(actual).size !== expected.size ||
			actual.some((s) => !expected.has(s))
		)
			throw new Error("FINAL_MATRIX_INCOMPLETE_OR_DUPLICATE");
		const rated = rateTranslations(packet, passes, values.fixture);
		for (const o of packet.outputs)
			if (calls.find((c) => c.key === o.key)?.outputDigest !== o.writerDigest) throw new Error("RATED_WRITER_CHANGED");
		calls = repairGuards(context.cases, calls).map((c) => {
			const r = rated.get(c.key);
			if (!r) return c;
			if (!c.taskScore) throw new Error("TRANSLATION_TASK_SCORE_MISSING");
			return { ...c, taskScore: { ...c.taskScore, quality: { ...c.taskScore.quality, value: r.quality } } };
		});
		const artifact = {
			...context.source,
			mode: values.fixture ? ("fake" as const) : ("live" as const),
			id: "tasks-v1-final-" + context.bindingHash.slice(0, 16),
			calls,
			stopReason: null,
			modelStops: [],
			incomplete: [],
			estimate: { ...context.source.estimate, calls: expected.size },
		};
		const ratings = calls.flatMap((c) =>
			(rated.get(c.key)?.votes ?? []).map((r) => ({ ...r, reportId: artifact.id, outputId: "output-" + c.id })),
		);
		const evidence = buildDecisionEvidence(artifact, "tasks-v1");
		const decisions = decideEvidence(evidence, ratings);
		const lines = [
			"# tasks-v1 final decision",
			"",
			values.fixture
				? "OFFLINE_FIXTURE_TEST. Scripted responses and ratings. Astra did not run. No model decision is valid."
				: "PROVISIONAL. These results do not establish statistical proof or release approval.",
			"",
			"The report combines unchanged paid writers, the repaired shared guards, the 11 translation completions, and the cover-letter full run.",
			"",
			values.fixture
				? "Translation ratings are scripted fixtures. Astra and human review remain unperformed."
				: "Translation quality uses two independent Astra AI passes. Major MQM errors weigh 5 and minor errors weigh 1. Human review remains unperformed.",
			"",
			"The selector requires zero critical safety failures and ranks per-language safety, quality, writer cost, then latency. Pending verifier disputes still block eligibility.",
			"",
			"| Task | Decision | Per-language safety | Quality / eligibility |",
			"| --- | --- | --- | --- |",
		];
		for (const row of decisions) {
			const e = evidence.find((e) => e.category === row.category);
			lines.push(
				`| ${row.category} | ${JSON.stringify(row.winner)} | ${e?.candidates
					.map(
						(c) =>
							`${c.model}@${c.reasoning}: ${Object.entries(c.perLanguage)
								.map(([l, s]) => `${l} ${s.safetyRate}`)
								.join(", ")}`,
					)
					.join("; ")} | ${row.reason} |`,
			);
		}
		lines.push(
			"",
			"## Provenance",
			"",
			`Source results SHA-256: \`${context.binding.sourceHash}\`.`,
			`Corrected study: \`${context.binding.targetStudyId}\`.`,
			`Continuation binding: \`${context.bindingHash}\`.`,
			"The passed canaries keep their original paid study binding. Their current probe/verifier hashes and raw votes pass the unchanged gate.",
			"The existing guard replay remains immutable. No writer response is replaced during the guard correction.",
			"Prior inspection of the holdout fixtures remains disclosed. These results do not measure performance on previously unseen cases.",
			"",
			`Complete matrix: ${calls.length} sessions. Translation ratings: ${rated.size * 2}. Raw verifier faults remain measured evidence.`,
			"",
		);
		await saveJson(join(root, "final-decision.json"), {
			status: values.fixture ? "OFFLINE_FIXTURE_TEST" : "PROVISIONAL",
			binding: context.binding,
			sourceArtifactHashes: { translation: digest(translation), cover: digest(cover), ratings: passes.map(digest) },
			decisions,
			evidence,
			ratings: ratings.length,
		});
		await writeFile(out, lines.join("\n"));
		console.log(
			JSON.stringify({
				status: values.fixture ? "OFFLINE_FIXTURE_TEST" : "PROVISIONAL",
				sessions: calls.length,
				ratings: ratings.length,
				tasks: decisions.length,
				spendUsd: 0,
			}),
		);
	}
} else throw new Error("Use validate-ratings or rebuild");
