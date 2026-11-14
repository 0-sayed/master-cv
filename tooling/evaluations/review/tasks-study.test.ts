import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { HARD_FACTS_VERSION } from "@reactive-resume/api/features/ai/hard-facts";
import { PAYLOAD_VERSION } from "@reactive-resume/api/features/ai/payload";
import * as config from "./config";
import { loadModels, parseOptions } from "./config";
import { loadTaskFixtures, taskReviewItems } from "./contracts/fixtures";
import { tasksGuardVersion } from "./contracts/guard";
import { getTaskContract } from "./contracts/index";
import { tasksVerifierVersion } from "./contracts/verifier/verifier";
import { required } from "./required";
import { runBenchmark } from "./runner";
import * as study from "./study";

const categories = ["summary", "job-evidence", "tailoring", "translation", "cover-letter", "interview-prep"] as const;
const tasks = loadTaskFixtures(
	categories.flatMap((c) =>
		["tuning", "holdout"].map((part) => new URL(`./contracts/${c}/${part}.json`, import.meta.url).pathname),
	),
);

it("binds the recorded task controls to the current freeze and the actual guard scan", () => {
	const actual = study.controls(tasks);
	expect(actual).toMatchObject({ checked: 1056, pass: true, failures: [] });
	expect(study.recordedControls(undefined, "tasks-v1")).toEqual(actual);
	const scope = config.parseTaskCategories("summary,job-evidence,tailoring,translation");
	const scoped = study.controls(study.loadStudyCases("tasks-v1", scope));
	expect(scoped).toMatchObject({ checked: 699, pass: true, failures: [] });
	expect(study.recordedControls(undefined, "tasks-v1", scope)).toEqual(scoped);
});

it("tasks-v1 hash covers contracts, glossary, verifier+guard+payload versions, fixtures", () => {
	expect(study.taskStudyIdentity).toBeTypeOf("function");
	const identity = study.taskStudyIdentity();
	expect(identity).toMatchObject({
		payloadVersion: PAYLOAD_VERSION,
		hardFactsVersion: HARD_FACTS_VERSION,
		tasksVerifierVersion,
		tasksGuardVersion,
	});
	expect(identity.glossaryHash).toBe(
		createHash("sha256")
			.update(readFileSync(new URL("./contracts/translation/glossary.json", import.meta.url)))
			.digest("hex"),
	);
	const models = loadModels();
	const hash = () => study.studyHash(models, tasks, 3, undefined, "tasks-v1");
	const original = hash();
	for (const category of categories) {
		const contract = getTaskContract(category);
		expect(identity.contracts.find((c) => c.category === category)).toMatchObject({
			promptVersion: contract.promptVersion,
			schemaVersion: contract.schemaVersion,
		});
		for (const key of ["promptVersion", "schemaVersion"] as const) {
			const before = contract[key];
			try {
				contract[key] += ":changed";
				expect(hash(), `${category}.${key}`).not.toBe(original);
			} finally {
				contract[key] = before;
			}
		}
	}
	expect(
		study.studyHash(
			models,
			tasks.map((c, i) => (i ? c : { ...c, sector: "changed" })),
			3,
			undefined,
			"tasks-v1",
		),
	).not.toBe(original);
});

it("loads only tasks-v1 fixtures and validates the identical taskReviewItems approval envelope", () => {
	expect(study.loadStudyCases).toBeTypeOf("function");
	expect(study.loadStudyCases("tasks-v1")).toEqual(tasks);
	const contexts = study.taskReviewContexts();
	const canaries = loadTaskFixtures([new URL("./contracts/canaries.json", import.meta.url).pathname]);
	const items = taskReviewItems([...tasks, ...canaries], contexts);
	expect(study.studyReviewItems("tasks-v1", tasks)).toEqual(items);
	const gated = items.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)));
	const entries = gated.map((c) => ({
		id: c.id,
		hash: study.fixtureHash(c),
		sourceReviewed: true,
		goldReviewed: true,
	}));
	const approval = (reviewer: string, fixtures: typeof entries) => ({
		version: 1,
		reviewer,
		reviewedAt: "2026-11-13T12:00:00.000Z",
		fixtures,
	});
	const files = [approval("reviewer-a", entries.slice(0, 20)), approval("reviewer-b", entries.slice(20))];
	expect(study.arabicApprovalProvenance(files, items).map((p) => p.reviewer)).toEqual(["reviewer-a", "reviewer-b"]);
	const bare = tasks
		.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)))
		.map((c) => ({ id: c.id, hash: study.fixtureHash(c), sourceReviewed: true, goldReviewed: true }));
	expect(() => study.arabicApprovalProvenance([approval("bare", bare)], items)).toThrow("ARABIC_REVIEW_INCOMPLETE");
});

it("cross-study smoke/resume rejected even with otherwise matching identity fields", async () => {
	const manifest = {
		hash: "same",
		mode: "fake",
		phase: "smoke",
		budgetUsd: 5,
		priorSpendMicros: 0,
		calibration: [],
		study: "core" as const,
	};
	expect(() => study.validateResume(manifest, { ...manifest, study: "tasks-v1" })).toThrow("RESUME_MANIFEST_MISMATCH");
	const models = loadModels().slice(0, 1);
	const fixtures = study.smokeCases(tasks, models);
	const run = await runBenchmark({
		phase: "smoke",
		models,
		cases: fixtures,
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
	});
	run.study = {
		name: "core",
		phase: "smoke",
		hash: "same",
		gitCommit: "synthetic",
		controls: { checked: 0, pass: true, failures: [], knownLimitations: [], honestFalseRejects: [] },
		calibration: [],
	};
	expect(() => study.validateSmoke(run, models, fixtures, "tasks-v1")).toThrow("LIVE_SMOKE_MISMATCH");
	run.study.name = "tasks-v1";
	expect(study.validateSmoke(run, models, fixtures, "tasks-v1")).toHaveLength(1);
});

it("loads the seven finalist variants without a DeepSeek-low writer and keeps stage separate", () => {
	expect(parseOptions(["--study", "tasks-v1", "--stage", "smoke"]).study).toBe("tasks-v1");
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	expect(models.map((m) => `${m.model}@${m.reasoning}`)).toEqual([
		"openai/gpt-6-luna@none",
		"openai/gpt-6-luna@low",
		"openai/gpt-6-luna@high",
		"openai/gpt-6.1-terra@low",
		"openai/gpt-6.1-terra@medium",
		"openai/gpt-6.1-terra@high",
		"deepseek/deepseek-v4.1-flash-1017@none",
	]);
	expect(study.smokeCases(tasks, models)).toHaveLength(18);
});

it("tasks defaults to two full repetitions while core and explicit overrides stay unchanged", () => {
	expect(parseOptions(["--study", "tasks-v1"]).runs).toBe(2);
	expect(parseOptions([]).runs).toBe(3);
	expect(parseOptions(["--study", "tasks-v1", "--runs", "4"]).runs).toBe(4);
});
it("prunes only canonical task variants and binds the subset without reducing smoke language/category coverage", () => {
	expect(config.pruneTaskVariants).toBeTypeOf("function");
	const all = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const ids = all.slice(0, 4).map((m) => `${m.model}@${m.reasoning}`);
	expect(parseOptions(["--study", "tasks-v1", "--variants", ids.join(",")]).variants).toEqual(ids);
	const subset = config.pruneTaskVariants(all, ids);
	expect(subset).toEqual(all.slice(0, 4));
	expect(study.studyHash(subset, tasks, 2, undefined, "tasks-v1")).not.toBe(
		study.studyHash(all, tasks, 2, undefined, "tasks-v1"),
	);
	expect(study.smokeCases(tasks, subset)).toHaveLength(18);
	for (const invalid of [[], [required(ids[0]), required(ids[0])], ["deepseek/deepseek-v4.1-flash-1017@low"]])
		expect(() => config.pruneTaskVariants(all, invalid)).toThrow("INVALID_TASK_VARIANTS");
	expect(() => config.pruneTaskVariants([{ ...required(all[0]), reasoning: "medium" }])).toThrow(
		"INVALID_TASK_VARIANTS",
	);
	expect(() => parseOptions(["--variants", ids.join(",")])).toThrow("TASK_VARIANTS_REQUIRE_TASKS_STUDY");
});
