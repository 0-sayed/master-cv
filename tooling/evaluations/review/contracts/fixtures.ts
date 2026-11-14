import type { TaskCase } from "./types";
import { readFileSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";

const categorySchema = z.enum([
	"summary",
	"job-evidence",
	"tailoring",
	"translation",
	"cover-letter",
	"interview-prep",
]);
const idSchema = z
	.string()
	.min(1)
	.refine((s) => s.trim() === s);
const definedSchema = z.unknown().refine((v) => v !== undefined);
const taskCaseSchema = z
	.looseObject({
		id: idSchema,
		category: categorySchema,
		language: z.enum(["ar", "en", "mixed"]),
		holdout: z.boolean(),
		exploratory: z.literal(false),
		kind: z.literal("task"),
		requiresQuestion: z.boolean(),
		sector: z.string().min(1),
		provenance: z
			.strictObject({
				synthetic: z.literal(true),
				authoredBy: z.literal("codex lane"),
				declaration: z.literal(
					"جميع الأشخاص والجهات في هذه الحالة مختلقة، ولا تستند بياناتها إلى أشخاص أو جهات حقيقية. All people and organisations in this case are fictional.",
				),
			})
			.optional(),
		cv: z.array(
			z
				.object({
					id: idSchema,
					section: z.string().min(1),
					text: z.string().min(1),
					protected: z
						.array(
							z.object({
								kind: z.enum([
									"name",
									"employer",
									"title",
									"date",
									"number",
									"skill",
									"degree",
									"certification",
									"language",
								]),
								text: z.string().min(1),
							}),
						)
						.optional(),
				})
				.transform(({ protected: values, ...fact }) => (values === undefined ? fact : { ...fact, protected: values })),
		),
		jobAd: z.object({ segments: z.array(z.object({ id: idSchema, text: z.string().min(1) })) }).nullable(),
		gold: definedSchema,
		mutants: z.array(z.object({ id: idSchema, output: definedSchema, expect: z.enum(["unsafe", "honest"]) })),
	})
	.transform(({ provenance, ...c }) => (provenance === undefined ? c : { ...c, provenance }))
	.refine((c) => {
		const evidenceIds = [...c.cv.map((f) => f.id), ...(c.jobAd?.segments.map((s) => s.id) ?? [])];
		return (
			new Set(evidenceIds).size === evidenceIds.length && new Set(c.mutants.map((m) => m.id)).size === c.mutants.length
		);
	});

const contextSchema = z.object({
	category: categorySchema,
	task: z.string().min(1),
	systemPrompt: z.string().min(1),
	promptVersion: z.string().min(1),
	schemaVersion: z.string().min(1),
	glossary: z.unknown().optional(),
});
export type TaskReviewContext = z.infer<typeof contextSchema>;
export type TaskReviewItem = TaskCase & {
	review: TaskReviewContext & { input: { cv: TaskCase["cv"]; jobAd: TaskCase["jobAd"] }; glossary: unknown };
};

function readJson(path: string): unknown {
	if (basename(path).startsWith(".env")) throw new Error("ENV_FILE_FORBIDDEN");
	const real = realpathSync(path);
	if (basename(real).startsWith(".env")) throw new Error("ENV_FILE_FORBIDDEN");
	return JSON.parse(readFileSync(real, "utf8"));
}

/** Validate the shared envelope; category-specific inputs survive for their contract to validate. */
export function loadTaskFixtures(files: readonly string[]): TaskCase[] {
	const cases = files.flatMap((file) => {
		const result = z.array(taskCaseSchema).safeParse(readJson(file));
		if (!result.success) throw new Error(`TASK_FIXTURE_INVALID: ${file}: ${result.error.message}`);
		return result.data;
	});
	if (!cases.length) throw new Error("TASK_FIXTURE_REQUIRED");
	if (new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error("TASK_FIXTURE_DUPLICATE");
	return cases;
}

export function loadTaskReviewContexts(files: readonly string[]): TaskReviewContext[] {
	return files.flatMap((file) => {
		const result = z.array(contextSchema).safeParse(readJson(file));
		if (!result.success) throw new Error(`TASK_REVIEW_CONTEXT_INVALID: ${file}: ${result.error.message}`);
		return result.data;
	});
}

/** Hash this exact envelope at approval time too; prompt/glossary Arabic cannot escape the script gate. */
export function taskReviewItems(cases: readonly TaskCase[], contexts: readonly TaskReviewContext[]): TaskReviewItem[] {
	const byCategory = new Map(contexts.map((c) => [c.category, contextSchema.parse(c)]));
	if (byCategory.size !== contexts.length) throw new Error("TASK_REVIEW_CONTEXT_DUPLICATE");
	return cases.map((c) => {
		const context = byCategory.get(c.category);
		if (!context) throw new Error(`TASK_REVIEW_CONTEXT_REQUIRED: ${c.category}`);
		return {
			...c,
			review: { ...context, input: { cv: c.cv, jobAd: c.jobAd }, glossary: context.glossary ?? null },
		};
	});
}
