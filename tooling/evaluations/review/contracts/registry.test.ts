import type { TaskCase, TaskContract, TaskScore } from "./types";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { loadModels, variantCases } from "../config";
import { cases } from "../corpus";
import { appendEvent, readJournal } from "../journal";
import { buildModelPayload } from "../production";
import { required } from "../required";
import { runBenchmark } from "../runner";
import { createTaskRegistry, getTaskContract } from "./index";
import { toEvaluation } from "./types";

const taskCase: TaskCase = {
	id: "synthetic-summary-en",
	category: "summary",
	language: "en",
	holdout: false,
	exploratory: false,
	kind: "task",
	requiresQuestion: false,
	sector: "administration",
	cv: [{ id: "fact-1", section: "summary", text: "Prepared weekly reports." }],
	jobAd: { segments: [{ id: "job-1", text: "SAP experience preferred." }] },
	gold: { text: "Prepared weekly reports." },
	mutants: [{ id: "job-only-skill", output: { text: "Used SAP." }, expect: "unsafe" }],
};

const safeScore: TaskScore = {
	caseId: taskCase.id,
	structuralFailure: false,
	missingQuestion: false,
	emptyAnswer: false,
	safetyDeterministic: { pass: true, reasons: [] },
	quality: { metric: "key-fact-coverage", value: 1, pass: true },
	lostFacts: [],
	unsupportedClaims: [],
};

// Test-only contract: no task prompt, fixture or production route is registered by Task 1a.
const fakeContract: TaskContract<TaskCase, { text: string }> = {
	category: "summary",
	promptVersion: "test-summary-v1",
	systemPrompt: "Use supplied confirmed CV facts only.",
	outputSchema: z.strictObject({ text: z.string() }),
	schemaVersion: "test-summary-schema-v1",
	guardPolicy: { lostFact: false, subsetEntities: true },
	visibleCap: () => 2048,
	verifierCap: 4096,
	deadlineMs: 90_000,
	buildInput: (c) =>
		buildModelPayload({
			selections: c.cv.map((fact) => ({
				id: fact.id,
				kind: "confirmed_content",
				section: fact.section,
				text: fact.text,
			})),
			contactValues: [],
		}),
	claims: (_c, output) => [{ id: "claim-1", text: output.text, evidenceIds: ["fact-1"], kind: "fact" }],
	verifierContext: () => ({
		taskInstruction: "Summarize confirmed CV facts.",
		retention: "not_applicable",
		absenceChecks: [],
	}),
	score: (c) => ({ ...safeScore, caseId: c.id }),
};

it("registry returns contracts by category", () => {
	const lookup = createTaskRegistry([fakeContract]);
	expect(lookup("summary")).toBe(fakeContract);
	expect(() => lookup("translation")).toThrow("TASK_CONTRACT_NOT_FOUND: translation");
	expect(() => createTaskRegistry([fakeContract, fakeContract])).toThrow("TASK_CONTRACT_DUPLICATE: summary");
	for (const category of [
		"summary",
		"job-evidence",
		"tailoring",
		"translation",
		"cover-letter",
		"interview-prep",
	] as const) {
		expect(getTaskContract(category).category).toBe(category);
		expect(getTaskContract(category)).not.toBe(fakeContract);
	}
});

it.each([
	{ pass: true, quality: true, expectedGuard: true, expectedMiss: false },
	{ pass: true, quality: false, expectedGuard: true, expectedMiss: true },
	{ pass: true, quality: null, expectedGuard: true, expectedMiss: false },
	{ pass: false, quality: true, expectedGuard: false, expectedMiss: false },
])("keeps deterministic safety independent from advisory quality ($pass/$quality)", (row) => {
	const evaluation = toEvaluation({
		...safeScore,
		safetyDeterministic: { pass: row.pass, reasons: row.pass ? [] : ["AI_UNSUPPORTED_CLAIM", "job-only-skill"] },
		quality: { metric: "key-fact-coverage", value: row.quality === null ? null : 0.5, pass: row.quality },
	});
	expect(evaluation).toMatchObject({
		schemaValid: true,
		structuralFailure: false,
		guardAccepted: row.expectedGuard,
		guardError: row.pass ? null : "AI_UNSUPPORTED_CLAIM",
		usefulnessMiss: row.expectedMiss,
		result: null,
	});
});

it("structural failures cannot become accepted outputs", () => {
	expect(toEvaluation({ ...safeScore, structuralFailure: true })).toMatchObject({
		schemaValid: false,
		structuralFailure: true,
		guardAccepted: false,
		result: null,
	});
});

it("toEvaluation round-trips through the journal", async () => {
	const folder = await mkdtemp(join(tmpdir(), "t006-task-contract-"));
	try {
		// Reuse a complete core call envelope; this does not dispatch a new task category.
		const core = await runBenchmark({
			models: loadModels().slice(0, 1),
			cases: cases.filter((c) => !c.holdout).slice(0, 1),
			runs: 1,
			fake: true,
			budgetUsd: 5,
		});
		const score: TaskScore = {
			...safeScore,
			safetyDeterministic: { pass: false, reasons: ["AI_UNSUPPORTED_CLAIM", "job-only-skill"] },
			quality: { metric: "key-fact-coverage", value: 0.5, pass: false },
			lostFacts: ["fact-1"],
			unsupportedClaims: ["claim-1"],
		};
		const call = {
			...required(core.calls[0]),
			...toEvaluation(score),
			caseId: taskCase.id,
			category: taskCase.category,
		};
		const path = join(folder, "calls.jsonl");
		await appendEvent(path, { type: "scored", data: call });
		const history = await readJournal(path);
		expect(history.previousCalls).toEqual([call]);
		expect(history.previousCalls[0]).toMatchObject({
			schemaValid: true,
			guardAccepted: false,
			guardError: "AI_UNSUPPORTED_CLAIM",
			usefulnessMiss: true,
			score: {
				caseId: "synthetic-summary-en",
				unsupportedClaims: ["claim-1"],
				lostFacts: ["fact-1"],
				invalidEvidenceIds: [],
				unresolvedUnknowns: [],
			},
			taskScore: {
				quality: { metric: "key-fact-coverage", value: 0.5, pass: false },
				safetyDeterministic: { pass: false, reasons: ["AI_UNSUPPORTED_CLAIM", "job-only-skill"] },
			},
			result: null,
		});
	} finally {
		await rm(folder, { recursive: true });
	}
});

it("TaskCase sorts in variantCases like core cases", () => {
	const model = required(loadModels()[0]);
	const languages = ["ar", "en", "mixed"] as const;
	const tasks = languages.flatMap((language) => [
		{ ...taskCase, id: `holdout-${language}`, language, holdout: true },
		{ ...taskCase, id: `question-${language}`, language, requiresQuestion: true },
		{ ...taskCase, id: `preferred-${language}`, language },
	]);
	const originalIds = tasks.map((c) => c.id);
	const base = required(cases.find((c) => !c.holdout && c.kind === "wording"));
	const core = tasks.map((c) => ({
		...base,
		id: c.id,
		language: c.language,
		holdout: c.holdout,
		requiresQuestion: c.requiresQuestion,
	}));
	expect(variantCases(model, tasks, "smoke").map((c) => c.id)).toEqual([
		"preferred-ar",
		"preferred-en",
		"preferred-mixed",
	]);
	expect(variantCases(model, core, "smoke").map((c) => c.id)).toEqual([
		"preferred-ar",
		"preferred-en",
		"preferred-mixed",
	]);
	expect(variantCases(model, tasks, "full").map((c) => c.id)).toEqual(originalIds);
	expect(tasks.map((c) => c.id)).toEqual(originalIds);
	expect(variantCases({ ...model, sets: ["holdout"] }, tasks, "smoke").map((c) => c.id)).toEqual([
		"holdout-ar",
		"holdout-en",
		"holdout-mixed",
	]);
});
