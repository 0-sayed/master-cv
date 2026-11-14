import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { smokeCases, studyHash, validateSmoke, validateResume } from "./study";
import { vertexFixture } from "./vertex-test-fixture";

it("invalidates a synthetic historical injection-only smoke for the changed extraction schema", async () => {
	const models = loadModels();
	const fake = await runBenchmark({
		models: [...models, vertexFixture],
		cases: [required(cases.find((c) => c.category === "injection"))],
		runs: 3,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
	});
	const smoke = { ...fake, mode: "live" as const };
	expect(smoke.mode).toBe("live");
	expect(smoke.calls).toHaveLength(36);
	expect(new Set(smoke.calls.map((c) => c.category))).toEqual(new Set(["injection"]));
	expect(studyHash(models, cases, 3)).not.toBe(smoke.study?.hash);
	const settings = {
		hash: smoke.study?.hash ?? "",
		mode: "live",
		phase: "full",
		budgetUsd: 9,
		priorSpendMicros: 0,
		calibration: [],
	};
	expect(() => validateResume(settings, { ...settings, hash: studyHash(models, cases, 3) })).toThrow(
		"RESUME_MANIFEST_MISMATCH",
	);
	expect(() => validateSmoke(smoke, models, smokeCases(cases, models))).toThrow("SMOKE_INCOMPLETE");
});
