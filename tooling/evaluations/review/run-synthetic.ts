import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { cases } from "./corpus";
import { scoreReviewCase, summarizeReviewRuns, type ReviewCase, type ReviewRun } from "./score";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const runs: ReviewRun[] = [];
for (const { id, language, input, forbiddenClaims } of cases) {
	const source = { kind: "resume", id: "synthetic-cv", revision: "synthetic-v1" } as const;
	const sources: ReviewCase["sources"] = [
		{
			id: "selected",
			source,
			target: { sectionId: "summary", field: "content" },
			quote: input,
			factId: null,
			factRevision: null,
			confirmation: "confirmed",
		},
	];
	const gold: ReviewCase = {
		id,
		language,
		input,
		sources,
		supportedClaims: [input],
		forbiddenClaims,
		requiredFacts: [],
		unknownFields: [],
		citations: [],
	};
	for (let runIndex = 0; runIndex < 3; runIndex++) {
		const start = performance.now();
		// A deterministic withholding double: this evaluates scorer bookkeeping only.
		// Real worker/semantic-rejection repetitions are exercised by review-delivery.integration.test.ts.
		const result = {
			schemaVersion: 2 as const,
			kind: "wording" as const,
			sourceRevision: source,
			evidence: sources,
			questions: [],
			proposals: [],
			notes: [],
		};
		const score = scoreReviewCase(gold, result);
		runs.push({
			caseId: id,
			language,
			result,
			score,
			runIndex,
			inputDigest: digest(input),
			sourceDigest: digest(sources),
			promptVersion: "t006-wording-v1",
			schemaVersion: "t006-review-v1",
			modelVersion: "scripted-withholding-double",
			routeVersion: "synthetic/1",
			latencyMs: performance.now() - start,
			calls: 0,
			costMicros: 0,
			humanRubric: null,
		});
	}
}
const path = resolve(process.argv[2] ?? "reports/t006-synthetic-review.json");
await mkdir(dirname(path), { recursive: true });
const artifact = {
	qualification: "Synthetic scorer bookkeeping only. No model calls, no human rubric, no A02 approval.",
	summary: summarizeReviewRuns(runs),
	runs,
};
await writeFile(path, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact.summary));
