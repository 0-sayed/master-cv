import type { StudyName } from "./config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import freeze from "./fairness-study.json";
import tasksFreeze from "./tasks-study.json";

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
	for (const [path, expected] of Object.entries(files)) {
		if (createHash("sha256").update(read(path)).digest("hex") !== expected) throw new Error("STUDY_FREEZE_CHANGED");
	}
	return freeze;
}
