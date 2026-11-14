import type { TaskCase } from "./types";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { fixtureHash } from "../study";
import { loadTaskFixtures, taskReviewItems } from "./fixtures";

const fixture: TaskCase = {
	id: "summary-en",
	category: "summary",
	language: "en",
	holdout: false,
	exploratory: false,
	kind: "task",
	requiresQuestion: false,
	sector: "administration",
	cv: [{ id: "cv-1", section: "experience", text: "Prepared reports with Excel." }],
	jobAd: { segments: [{ id: "job-1", text: "SAP preferred." }] },
	gold: { summary: { text: "Prepared reports with Excel." } },
	mutants: [{ id: "invented", output: { summary: { text: "Used SAP." } }, expect: "unsafe" }],
};
const context = {
	category: "summary" as const,
	task: "Summarize confirmed CV facts.",
	systemPrompt: "Use only confirmed CV facts.",
	promptVersion: "test-summary-v1",
	schemaVersion: "test-summary-schema-v1",
};

it("loads and validates task fixtures without dropping contract-specific input", async () => {
	const out = await mkdtemp(join(tmpdir(), "task-fixtures-"));
	try {
		const tuning = join(out, "tuning.json");
		const holdout = join(out, "holdout.json");
		const extended = { ...fixture, sourceRevision: "revision-1", direction: "en-ar" };
		await writeFile(tuning, JSON.stringify([extended]));
		await writeFile(holdout, JSON.stringify([{ ...fixture, id: "summary-holdout", holdout: true }]));
		expect(loadTaskFixtures([tuning, holdout])).toEqual([
			extended,
			{ ...fixture, id: "summary-holdout", holdout: true },
		]);
		expect(await readFile(tuning, "utf8")).toBe(JSON.stringify([extended]));
		await writeFile(holdout, JSON.stringify([fixture]));
		expect(() => loadTaskFixtures([tuning, holdout])).toThrow("TASK_FIXTURE_DUPLICATE");
		for (const invalid of [
			{ ...fixture, kind: "wording" },
			{ ...fixture, exploratory: true },
			{ ...fixture, cv: [...fixture.cv, ...fixture.cv] },
			{ ...fixture, jobAd: { segments: [{ id: "cv-1", text: "Job only" }] } },
			{ ...fixture, mutants: [{ id: "bad", output: {}, expect: "safe" }] },
			{ ...fixture, provenance: { synthetic: false, authoredBy: "codex lane", declaration: "unverified" } },
			{ ...fixture, provenance: { synthetic: true, authoredBy: "unknown", declaration: "unverified" } },
		]) {
			await writeFile(tuning, JSON.stringify([invalid]));
			expect(() => loadTaskFixtures([tuning])).toThrow("TASK_FIXTURE_INVALID");
		}
		expect(() => loadTaskFixtures([join(out, ".env.local")])).toThrow("ENV_FILE_FORBIDDEN");
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});

it("binds prompt, task, glossary and complete input to each review item hash", () => {
	const [item] = taskReviewItems([fixture], [context]);
	expect(item).toMatchObject({
		...fixture,
		review: { ...context, input: { cv: fixture.cv, jobAd: fixture.jobAd }, glossary: null },
	});
	if (!item) throw new Error("MISSING_ITEM");
	const [reordered] = taskReviewItems(
		[fixture],
		[
			{
				schemaVersion: context.schemaVersion,
				promptVersion: context.promptVersion,
				systemPrompt: context.systemPrompt,
				task: context.task,
				category: context.category,
			},
		],
	);
	if (!reordered) throw new Error("MISSING_ITEM");
	expect(fixtureHash(reordered)).toBe(fixtureHash(item));
	for (const changed of [
		{ ...context, systemPrompt: "الحقائق المؤكدة فقط" },
		{ ...context, task: "اكتب ملخصا" },
		{ ...context, glossary: { Excel: "إكسل" } },
	]) {
		const [next] = taskReviewItems([fixture], [changed]);
		if (!next) throw new Error("MISSING_ITEM");
		expect(fixtureHash(next)).not.toBe(fixtureHash(item));
	}
	expect(() => taskReviewItems([fixture], [])).toThrow("TASK_REVIEW_CONTEXT_REQUIRED");
	expect(() => taskReviewItems([fixture], [context, context])).toThrow("TASK_REVIEW_CONTEXT_DUPLICATE");
});
