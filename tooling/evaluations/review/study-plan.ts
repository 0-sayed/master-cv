import type { ModelConfig, StudyName, TaskScope, parseOptions } from "./config";
import type { ExecutionCase } from "./execution";
import { applyReasoning, loadModels, pruneTaskVariants } from "./config";
import { loadStudyCases, requireFullModels, studyHash, taskCategories } from "./study";

export type StudyPlan = {
	study: StudyName;
	cases: ExecutionCase[];
	writers: ModelConfig[];
	runs: number;
	stage: "smoke" | "full";
	identity: string;
	categories: TaskScope;
};

export function resolveStudyPlan(options: ReturnType<typeof parseOptions>): StudyPlan {
	const cases = loadStudyCases(options.study, options.categories);
	const config =
		options.config ??
		(options.study === "tasks-v1" ? new URL("./models-tasks.json", import.meta.url).pathname : undefined);
	let writers = applyReasoning(loadModels(config, options.selected, options.allowGoogle), options.reasoning);
	if (options.study === "tasks-v1" && options.variants !== undefined)
		writers = pruneTaskVariants(writers, options.variants);
	if (options.study === "tasks-v1" && options.smokeCategory) throw new Error("TASKS_SMOKE_SCOPE_FORBIDDEN");
	if (options.categories) {
		const categories = options.categories;
		writers = writers
			.map((model) => ({
				...model,
				categories: categories.filter((category) => !model.categories || model.categories.includes(category)),
			}))
			.filter((model) => model.categories.length > 0);
	}
	if (options.stage === "full") requireFullModels(writers);
	return {
		study: options.study,
		cases,
		writers,
		runs: options.stage === "smoke" ? 1 : options.runs,
		stage: options.stage,
		// The campaign binds the canonical full qualification, while smoke executes one pass.
		identity: studyHash(writers, cases, options.runs, options.smokeCategory, options.study),
		categories: options.study === "tasks-v1" ? (options.categories ?? [...taskCategories]) : [],
	};
}
