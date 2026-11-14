import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { assertFrozenStudy } from "./freeze";
import history from "./freeze-history.json";
import { required } from "./required";
it("seals both studies independently, including every task contract and glossary", () => {
	const read = (path: string) => readFileSync(resolve("..", path));
	const tasks = assertFrozenStudy(read, "tasks-v1");
	expect(tasks.studyId).toContain("tasks-v1");
	expect(tasks.policy).toContain("Task 10");
	for (const target of ["summary/holdout.json", "translation/glossary.json", "verifier/prompt.md", "guard.ts"]) {
		expect(() =>
			assertFrozenStudy(
				(path) =>
					path === `tooling/evaluations/review/contracts/${target}` ? new TextEncoder().encode("changed") : read(path),
				"tasks-v1",
			),
		).toThrow("STUDY_FREEZE_CHANGED");
	}
});
it("refuses changed task bytes and retains the stale historical core freeze without resealing it", () => {
	expect(() => assertFrozenStudy(() => new TextEncoder().encode("changed"))).toThrow("STUDY_FREEZE_CHANGED");
	// Shared task bytes changed before naming cleanup; historical core identity must not be rewritten to make this green.
	expect(() => assertFrozenStudy((path) => readFileSync(resolve("..", path)))).toThrow("STUDY_FREEZE_CHANGED");
	expect(() => assertFrozenStudy((path) => readFileSync(resolve("..", path)), "tasks-v1")).not.toThrow();
});

it("keeps transport repairs sealed without accepting arbitrary edits", () => {
	for (const target of [
		"runner.ts",
		"canaries.ts",
		"contracts/canaries.json",
		"verifier.ts",
		"verifier-health.ts",
		"cooldown.ts",
		"question-equivalences.json",
		"decision.ts",
	]) {
		expect(() =>
			assertFrozenStudy((path) =>
				path === `tooling/evaluations/review/${target}`
					? new TextEncoder().encode("unreviewed runtime")
					: readFileSync(resolve("..", path)),
			),
		).toThrow("STUDY_FREEZE_CHANGED");
	}
});

it("seals the payload v2 and task execution dependencies without rewriting the historical lexical baseline", async () => {
	const { frozenStudy } = await import("./freeze");
	const { recordedControls } = await import("./study");
	const previous = required(history.find((row) => row.name === "fairness-study-before-task1b.json"));
	expect(previous.studyId).toBe("t006-review-fairness-v11-lane23b");
	expect(frozenStudy.studyId).not.toBe(previous.studyId);
	expect(frozenStudy.policy).toContain("payload v2");
	expect(frozenStudy.policy).toContain("lane23b");
	expect(recordedControls()).toMatchObject({ checked: 126, pass: true, failures: [] });
	for (const target of [
		"packages/api/src/features/ai/payload.ts",
		"tooling/evaluations/review/execution.ts",
		"tooling/evaluations/review/contracts/types.ts",
		"tooling/evaluations/review/contracts/index.ts",
		"tooling/evaluations/review/contracts/route.ts",
		"tooling/evaluations/review/contracts/runtime.ts",
	]) {
		expect(() =>
			assertFrozenStudy((path) =>
				path === target ? new TextEncoder().encode("unreviewed") : readFileSync(resolve("..", path)),
			),
		).toThrow("STUDY_FREEZE_CHANGED");
	}
});
