import type { ModelConfig } from "./config";
import type { TaskCase } from "./contracts/types";
import type { BenchmarkArtifact } from "./runner";
import { readFileSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertJudgeCanaries } from "./canaries";
import { getTaskContract } from "./contracts";
import { assertFrozenStudy } from "./freeze";
import { blockedSmokeCategories } from "./instrument";
import { readJournal } from "./journal";
import { required } from "./required";
import {
	loadStudyCases,
	studyReviewItems,
	arabicApprovalProvenance,
	validateSmoke,
	smokeCases,
	controls,
} from "./study";
import { completionKeys, digest, estimateCompletion, repairGuards } from "./task-completion";

export const archive = "/mnt/storage/master-cv-design-archive/ui-audit/personal-career-benchmark";
export const outputRoot = join(archive, "tasks-v1-completion");
export const sourceFolder = join(
	archive,
	"campaign-20261117T055510Z-paid-smoke/full/2026-11-17T06-05-28.891Z-e75c9fdf",
);
export const smokeFolder = join(
	archive,
	"campaign-20261117T055510Z-paid-smoke/smoke/2026-11-17T05-55-22.063Z-fd1ddd76",
);
export const readJson = async (p: string) => JSON.parse(await readFile(p, "utf8"));
export async function saveJson(p: string, value: unknown) {
	await mkdir(resolve(p, ".."), { recursive: true });
	const { rename } = await import("node:fs/promises");
	await writeFile(p + ".tmp", JSON.stringify(value, null, 2) + "\n");
	await rename(p + ".tmp", p);
}
export async function completionContext() {
	const freeze = assertFrozenStudy((p) => readFileSync(resolve(import.meta.dirname, "../../..", p)), "tasks-v1");
	const source = (await readJson(join(sourceFolder, "results.json"))) as BenchmarkArtifact;
	const sourceManifest = await readJson(join(sourceFolder, "manifest.json"));
	const smoke = (await readJson(join(smokeFolder, "results.json"))) as BenchmarkArtifact;
	const smokeManifest = await readJson(join(smokeFolder, "manifest.json"));
	const history = await readJournal(join(sourceFolder, "calls.jsonl"));
	const cases = loadStudyCases("tasks-v1") as TaskCase[];
	const controlResult = controls(cases.filter((c) => !c.exploratory));
	if (!controlResult.pass) throw new Error("GUARD_CONTROLS_FAILED");
	const guardReport = await readJson(join(archive, "verified-shared-guard-full/guard-replay.json"));
	const { createHash } = await import("node:crypto");
	if (
		guardReport.targetStudyId !== freeze.studyId ||
		guardReport.sourceResultsSha256 !==
			createHash("sha256")
				.update(await readFile(join(sourceFolder, "results.json")))
				.digest("hex")
	)
		throw new Error("GUARD_REPLAY_SOURCE_OR_SEAL_CHANGED");
	const scored = new Map<string, typeof source.calls>();
	for (const c of history.previousCalls) scored.set(c.key, [...(scored.get(c.key) ?? []), c]);
	if (source.calls.some((c) => !scored.get(c.key)?.some((j) => isDeepStrictEqual(j, c))))
		throw new Error("SOURCE_NOT_IN_JOURNAL");
	const unfinished = completionKeys(source);
	if (unfinished.length !== 11 || source.calls.length !== 1620) throw new Error("SOURCE_MATRIX_CHANGED");
	const rawByKey = new Map(history.rawRecords.map((r) => [r.key, r]));
	const translation = getTaskContract("translation");
	for (const key of unfinished) {
		const raw = rawByKey.get(key);
		const c = required(source.calls.find((c) => c.key === key));
		if (!raw || raw.status !== 200) throw new Error("CACHED_TRANSLATION_WRITER_REQUIRED");
		const body = JSON.parse(raw.body);
		const parsed = translation.outputSchema.parse(JSON.parse(body.choices[0].message.content));
		if (digest(parsed) !== c.outputDigest) throw new Error("CACHED_TRANSLATION_WRITER_CHANGED");
	}
	const smokeModels = smokeManifest.models as ModelConfig[];
	// Retain the original binding. Exact current verifier/probe hashes and raw votes must still pass.
	assertJudgeCanaries(required(smoke.study?.judgeCanaries), {
		studyHash: required(smoke.study).hash,
		models: smokeModels,
		mode: "live",
	});
	const correctedSmoke = { ...smoke, calls: repairGuards(cases, smoke.calls) };
	validateSmoke(correctedSmoke, smokeModels, smokeCases(cases, smokeModels), "tasks-v1");
	if (blockedSmokeCategories(correctedSmoke.calls).includes("cover-letter"))
		throw new Error("COVER_LETTER_SMOKE_BLOCKED");
	const approval = arabicApprovalProvenance(
		await readJson(join(archive, "arabic-review-v6/approved-review.json")),
		studyReviewItems("tasks-v1", cases),
	);
	const rows = source.calls.filter((c) => c.category === "translation" && !unfinished.includes(c.key));
	const translationEstimates = unfinished.map((key) => {
		const call = required(source.calls.find((c) => c.key === key));
		let peers = rows.filter(
			(c) => c.caseId === call.caseId && c.model === call.model && c.reasoning === call.reasoning,
		);
		if (!peers.length)
			peers = rows.filter(
				(c) => c.language === call.language && c.model === call.model && c.reasoning === call.reasoning,
			);
		return estimateCompletion(peers, 1, true);
	});
	const forecast = {
		translation: {
			...required(translationEstimates[0]),
			sessions: 11,
			measuredSessions: translationEstimates.reduce((n, e) => n + e.measuredSessions, 0),
			openRouterUsd: translationEstimates.reduce((n, e) => n + e.openRouterUsd, 0),
			openaiUsd: 0,
			serialSeconds: translationEstimates.reduce((n, e) => n + e.serialSeconds, 0),
			parallelSeconds: translationEstimates.reduce((n, e) => n + e.parallelSeconds, 0),
			calibration: "same case and variant when available, otherwise same language and variant",
		},
		coverLetter: estimateCompletion(
			smoke.calls.filter((c) => c.category === "cover-letter"),
			324,
			false,
		),
	};
	const binding = {
		tools: Object.fromEntries(
			await Promise.all(
				["task-completion.ts", "task-completion-context.ts", "task-completion-cli.ts", "task-decision-cli.ts"].map(
					async (name) => [
						name,
						createHash("sha256")
							.update(await readFile(new URL(name, import.meta.url)))
							.digest("hex"),
					],
				),
			),
		),
		sourceHash: guardReport.sourceResultsSha256,
		targetStudyId: freeze.studyId,
		canaryPlanHash: required(smoke.study?.judgeCanaries).planHash,
		sourceSmokeHash: digest(smoke),
		unfinished,
		fixtureHashes: cases.map((c) => [c.id, digest(c)]),
		models: smokeModels.map((m) => [m.model, m.provider, m.reasoning]),
		runs: 3,
	};
	return {
		controlResult,
		source,
		sourceManifest,
		smoke,
		correctedSmoke,
		history,
		cases,
		models: smokeModels,
		unfinished,
		forecast,
		approval,
		binding,
		bindingHash: digest(binding),
	};
}
