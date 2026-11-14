import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { dispatchLimits } from "./dispatch";
import taskDefaults from "./models-tasks.json";
import defaults from "./models.json";

const effortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
const modelSchema = z
	.object({
		model: z.string().regex(/^[a-z0-9.-]+\/[a-z0-9.-]+$/u),
		provider: z.enum(["azure", "openai", "together", "google-vertex"]),
		providerEndpoint: z.enum(["google-vertex/eu", "google-vertex/global"]).optional(),
		reasoning: effortSchema,
		inputPerMillion: z.number().finite().positive(),
		outputPerMillion: z.number().finite().positive(),
		optional: z.boolean().default(false),
		categories: z
			.array(
				z.enum([
					"wording",
					"extraction",
					"missing-info",
					"injection",
					"translation",
					"job-evidence",
					"summary",
					"tailoring",
					"cover-letter",
					"interview-prep",
				]),
			)
			.min(1)
			.optional(),
		sets: z
			.array(z.enum(["tuning", "holdout"]))
			.min(1)
			.optional(),
	})
	.refine((m) => !m.providerEndpoint || m.provider === "google-vertex", {
		message: "Endpoint pin must match provider",
	});
export type StudyName = "core" | "tasks-v1";
export type ModelConfig = z.infer<typeof modelSchema>;
export function variantCases<
	T extends {
		category: string;
		holdout: boolean;
		language?: string;
		input?: string;
		exploratory?: boolean;
		kind?: string;
		requiresQuestion?: boolean;
	},
>(
	model: ModelConfig,
	cases: readonly T[],
	phase: "smoke" | "full" = "full",
	smokeCategory?: "extraction" | "wording-extraction",
): T[] {
	const eligible = cases.filter(
		(c) =>
			(!model.categories || model.categories.some((category) => category === c.category)) &&
			(!model.sets || model.sets.includes(c.holdout ? "holdout" : "tuning")),
	);
	if (phase === "full") return eligible;
	const categories =
		smokeCategory === "wording-extraction"
			? ["wording", "extraction"]
			: smokeCategory === "extraction"
				? ["extraction"]
				: [...new Set(eligible.filter((c) => !c.exploratory).map((c) => c.category))];
	return categories.flatMap((category) =>
		["ar", "en", "mixed"].map((language) => {
			const selected = eligible
				.filter((c) => c.category === category && c.language === language && !c.exploratory)
				.sort(
					(a, b) =>
						Number(a.holdout) - Number(b.holdout) ||
						Number(a.kind !== "wording") - Number(b.kind !== "wording") ||
						Number(a.requiresQuestion) - Number(b.requiresQuestion) ||
						(b.input?.length ?? 0) - (a.input?.length ?? 0),
				)[0];
			if (!selected) throw new Error("SMOKE_SCOPE_INCOMPLETE");
			return selected;
		}),
	);
}
export function applyReasoning(models: ModelConfig[], efforts?: ModelConfig["reasoning"][]): ModelConfig[] {
	const variants = efforts ? models.flatMap((m) => efforts.map((reasoning) => ({ ...m, reasoning }))) : models;
	const unique = new Map<string, ModelConfig>();
	for (const model of variants) {
		const key = JSON.stringify([model.model, model.provider, model.reasoning]);
		if (!unique.has(key)) unique.set(key, constrainScope(model));
	}
	return [...unique.values()];
}
function constrainScope(model: ModelConfig): ModelConfig {
	const raw = defaults.find(
		(m) => m.model === model.model && m.provider === model.provider && m.reasoning === model.reasoning,
	);
	if (!raw) return model;
	const canonical = modelSchema.parse(raw);
	const categories = canonical.categories
		? (model.categories ?? canonical.categories).filter((c) => canonical.categories?.includes(c))
		: model.categories;
	const sets = canonical.sets ? (model.sets ?? canonical.sets).filter((s) => canonical.sets?.includes(s)) : model.sets;
	if (categories?.length === 0 || sets?.length === 0) throw new Error("INVALID_MODEL_SCOPE");
	return { ...model, ...(categories ? { categories } : {}), ...(sets ? { sets } : {}) };
}
/** Catalog refresh changes prices, never the selected variant's task or dataset scope. */
export function applyCatalogPrices(models: ModelConfig[], priced: ModelConfig[]): ModelConfig[] {
	return models.map((model) => {
		const price = priced.find(
			(p) => p.model === model.model && p.provider === model.provider && p.reasoning === model.reasoning,
		);
		if (!price) throw new Error("CATALOG_VARIANT_MISSING");
		return { ...model, inputPerMillion: price.inputPerMillion, outputPerMillion: price.outputPerMillion };
	});
}
export function loadModels(path?: string, selected?: string[], allowGoogle = true): ModelConfig[] {
	const all = z
		.array(modelSchema)
		.min(1)
		.parse(path ? JSON.parse(readFileSync(path, "utf8")) : defaults);
	const matches = (m: ModelConfig, id: string) => id === m.model || id === `${m.model}@${m.reasoning}`;
	if (selected?.some((id) => !all.some((m) => matches(m, id)))) throw new Error("UNKNOWN_MODEL");
	if (
		selected?.some((id) =>
			all.some((m) => matches(m, id) && (m.provider === "google-vertex" || m.model.startsWith("google/"))),
		) &&
		!allowGoogle
	)
		throw new Error("GOOGLE_NOT_APPROVED");
	const models = all.filter(
		(m) =>
			(selected ? selected.some((id) => matches(m, id)) : !m.optional) &&
			(allowGoogle || !(m.provider === "google-vertex" || m.model.startsWith("google/"))),
	);
	if (
		!models.length ||
		new Set(models.map((m) => JSON.stringify([m.model, m.provider, m.reasoning]))).size !== models.length
	)
		throw new Error("INVALID_MODEL_SELECTION");
	return models.map(constrainScope);
}
/** Pruning changes only membership, never pins, effort or category/partition scope. */
export const taskVariantId = (m: ModelConfig) => `${m.model}@${m.reasoning}`;
export function pruneTaskVariants(models: ModelConfig[], selected?: string[]): ModelConfig[] {
	const canonical = taskDefaults.map((m) => modelSchema.parse(m));
	const scope = (m: ModelConfig) =>
		JSON.stringify([m.model, m.provider, m.providerEndpoint, m.reasoning, m.categories, m.sets]);
	if (!models.length || models.some((m) => !canonical.some((c) => scope(c) === scope(m))))
		throw new Error("INVALID_TASK_VARIANTS");
	if (!selected) return models;
	if (
		!selected.length ||
		new Set(selected).size !== selected.length ||
		selected.some((id) => !models.some((m) => taskVariantId(m) === id))
	)
		throw new Error("INVALID_TASK_VARIANTS");
	return models.filter((m) => selected.includes(taskVariantId(m)));
}
export function parseOptions(args: string[]) {
	const { values } = parseArgs({
		args,
		options: {
			"session-concurrency": { type: "string" },
			"openai-concurrency": { type: "string" },
			"together-concurrency": { type: "string" },
			"max-unverified": { type: "string" },
			fake: { type: "boolean", default: false },
			chaos: { type: "boolean", default: false },
			seed: { type: "string", default: "1" },
			"recover-systemic": { type: "boolean", default: false },
			"reconcile-file": { type: "string" },
			"dry-run": { type: "boolean", default: false },
			preflight: { type: "boolean", default: false },
			"startup-check": { type: "boolean", default: false },
			"smoke-category": { type: "string" },
			"env-file": { type: "string" },
			models: { type: "string" },
			config: { type: "string" },
			runs: { type: "string" },
			variants: { type: "string" },
			reasoning: { type: "string" },
			budget: { type: "string" },
			"budget-usd": { type: "string" },
			"openai-budget-usd": { type: "string", default: "10" },
			out: { type: "string", short: "o", default: "evaluations/results" },
			stage: { type: "string", default: "full" },
			study: { type: "string", default: "core" },
			resume: { type: "string" },
			"smoke-file": { type: "string" },
			"approval-file": { type: "string", multiple: true },
			"allow-google-safety-retention": { type: "boolean", default: true },
			"refresh-catalog": { type: "boolean", default: false },
		},
		strict: true,
	});
	if (values["startup-check"] && (values.fake || values["dry-run"] || values.preflight || values["refresh-catalog"]))
		throw new Error("STARTUP_CHECK_MODE_CONFLICT");
	if (values.chaos && !values.fake) throw new Error("CHAOS_REQUIRES_FAKE");
	if (values.variants !== undefined && values.study !== "tasks-v1")
		throw new Error("TASK_VARIANTS_REQUIRE_TASKS_STUDY");
	const runs = z.coerce
		.number()
		.int()
		.min(1)
		.max(20)
		.parse(values.runs ?? (values.study === "tasks-v1" ? "2" : "3"));
	if (values.budget && values["budget-usd"]) throw new Error("DUPLICATE_BUDGET");
	const budgetUsd = z.coerce
		.number()
		.finite()
		.positive()
		.refine((n) => Number.isSafeInteger(Math.floor(n * 1e6)))
		.parse(values["budget-usd"] ?? values.budget ?? "5");
	const reasoning = values.reasoning?.split(",").map((e) => effortSchema.parse(e));
	return {
		...dispatchLimits({
			sessionConcurrency:
				values["session-concurrency"] === undefined ? undefined : Number(values["session-concurrency"]),
			openaiConcurrency: values["openai-concurrency"] === undefined ? undefined : Number(values["openai-concurrency"]),
			togetherConcurrency:
				values["together-concurrency"] === undefined ? undefined : Number(values["together-concurrency"]),
			maxUnverified: values["max-unverified"] === undefined ? undefined : Number(values["max-unverified"]),
		}),
		fake: values.fake,
		chaos: values.chaos,
		seed: z.coerce.number().int().min(0).max(4294967295).parse(values.seed),
		recoverSystemic: values["recover-systemic"],
		reconcileFile: values["reconcile-file"],
		dryRun: values["dry-run"],
		preflight: values.preflight,
		startupCheck: values["startup-check"],
		smokeCategory: z.enum(["extraction", "wording-extraction"]).optional().parse(values["smoke-category"]),
		envFile: values["env-file"],
		selected: values.models?.split(","),
		variants: values.variants?.split(","),
		config: values.config,
		runs,
		reasoning,
		budgetUsd,
		openaiBudgetUsd: z.coerce
			.number()
			.finite()
			.positive()
			.refine((n) => Number.isSafeInteger(Math.floor(n * 1e6)))
			.parse(values["openai-budget-usd"]),
		out: values.out,
		stage: z.enum(["smoke", "full"]).parse(values.stage),
		study: z.enum(["core", "tasks-v1"]).parse(values.study),
		resume: values.resume,
		smokeFile: values["smoke-file"],
		approvalFiles: values["approval-file"] ?? [],
		// Retained for existing single-file consumers; the benchmark validates approvalFiles.
		approvalFile: values["approval-file"]?.length === 1 ? values["approval-file"][0] : undefined,
		allowGoogle: values["allow-google-safety-retention"],
		refreshCatalog: values["refresh-catalog"],
	};
}
