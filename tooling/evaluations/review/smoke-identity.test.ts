import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { type BenchmarkArtifact } from "./runner";
import { smokeCases, studyHash, validateSmoke, validateResume } from "./study";

it("invalidates the November 12 injection-only smoke for the changed extraction schema without losing historical calibration", () => {
	const smoke = JSON.parse(
		readFileSync(new URL("../results/2026-11-12T19-49-25.081Z-cc4d6966/results.json", import.meta.url), "utf8"),
	) as BenchmarkArtifact;
	const models = loadModels();
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
