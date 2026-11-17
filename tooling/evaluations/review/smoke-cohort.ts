import type { ModelConfig } from "./config";
import type { ExecutionCase } from "./execution";
import type { BenchmarkArtifact } from "./runner";
import { loadModels } from "./config";
import { studyHash } from "./study";

/** Full can use an explicit subset of a sealed three-finalist smoke without rebuying it. */
export function bindSmokeCohort(
	smoke: BenchmarkArtifact,
	selected: ModelConfig[],
	cases: ExecutionCase[],
	expectedHash: string,
): string {
	if (smoke.study?.hash === expectedHash) return expectedHash;
	const canonical = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const canonicalHash = studyHash(canonical, cases, 3, undefined, "tasks-v1");
	const equal = (a: ModelConfig, b: ModelConfig) =>
		studyHash([a], cases, 3, undefined, "tasks-v1") === studyHash([b], cases, 3, undefined, "tasks-v1");
	if (
		smoke.study?.name !== "tasks-v1" ||
		smoke.study.hash !== canonicalHash ||
		!selected.length ||
		selected.some((model) => !canonical.some((member) => equal(model, member)))
	)
		throw new Error("LIVE_SMOKE_MISMATCH");
	return canonicalHash;
}

export function selectedSmoke(smoke: BenchmarkArtifact, models: ModelConfig[]): BenchmarkArtifact {
	return {
		...smoke,
		calls: smoke.calls.filter((call) =>
			models.some(
				(model) => model.model === call.model && model.provider === call.provider && model.reasoning === call.reasoning,
			),
		),
	};
}
