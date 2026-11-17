import type { StudyName } from "./config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import billingAmendment from "./billing-amendment.json";
import freeze from "./fairness-study.json";
import tasksFreeze from "./tasks-study.json";

const billingPaths = ["attempt.ts", "production.ts", "runner.ts", "verifier.ts", "freeze.ts", "cli.ts"].map(
	(file) => `tooling/evaluations/review/${file}`,
);

export const frozenStudy = freeze;
export const frozenStudyFor = (study: StudyName) => (study === "core" ? freeze : tasksFreeze);
export function assertFrozenStudy(
	read: (path: string) => Uint8Array = (path) => readFileSync(resolve("..", path)),
	study: StudyName = "core",
) {
	const freeze = frozenStudyFor(study);
	const files = {
		...freeze.files,
		"tooling/evaluations/review/holdout.json": freeze.holdoutHash,
		"tooling/evaluations/review/holdout-passages.json": freeze.holdoutPassagesHash,
	};
	const digest = (path: string) => createHash("sha256").update(read(path)).digest("hex");
	const runtimePath = "tooling/evaluations/review/billing-runtime.ts";
	if (study === "tasks-v1" && digest(runtimePath) !== billingAmendment.runtimeSha256)
		throw new Error("STUDY_FREEZE_CHANGED");
	const current = Object.fromEntries(Object.keys(files).map((path) => [path, digest(path)]));
	if (study !== "tasks-v1") {
		if (!Object.entries(files).every(([path, expected]) => current[path] === expected))
			throw new Error("STUDY_FREEZE_CHANGED");
		return freeze;
	}
	// Sayed D39: exact billing-only revision. Scientific identity and review hashes stay unchanged.
	if (billingAmendment.studyId !== freeze.studyId || billingAmendment.owner !== "Sayed")
		throw new Error("STUDY_FREEZE_CHANGED");
	const revisions: Record<string, { before: string; after: string }> = billingAmendment.revisions;
	if (Object.keys(revisions).length !== billingPaths.length || billingPaths.some((path) => !revisions[path]))
		throw new Error("STUDY_FREEZE_CHANGED");
	for (const [path, expected] of Object.entries(files)) {
		const revision = revisions[path];
		if (
			(revision && revision.after !== current[path]) ||
			(current[path] !== expected && (!revision || revision.before !== expected))
		)
			throw new Error("STUDY_FREEZE_CHANGED");
	}
	return freeze;
}

export const billingRuntimeRevision = billingAmendment;
