import { spawnSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
it.each([
	"tooling/evaluations/results/new-run/manifest.json",
	"tooling/evaluations/review/identities.private.json",
	"docs/superpowers/new-plan.md",
	"pr.md",
	"apps/web/pr.md",
])("keeps local artifact %s out of git's untracked candidates", (path) => {
	expect(
		spawnSync("git", ["check-ignore", "--quiet", path], { cwd: new URL("../../../", import.meta.url) }).status,
	).toBe(0);
});
import { resolve } from "node:path";
import { evaluationOutputFolder } from "./output-directory";
it("accepts git-ignored results inside the repository", () => {
	// reports is already globally ignored, even before the dedicated results rule.
	expect(evaluationOutputFolder({ out: "evaluations/results/reports" })).toMatch(/results\/reports\/.+/);
});
it.each(["/tmp/t006-live", "../outside-results", "evaluations/results/../../../../outside"])(
	"rejects live output outside the results tree: %s",
	(out) => {
		expect(() => evaluationOutputFolder({ out })).toThrow("OUTPUT_MUST_BE_EVALUATION_RESULTS");
	},
);
it("rejects a resumed folder outside the repository even with an allowed output root", () => {
	expect(() => evaluationOutputFolder({ out: "evaluations/results", resume: resolve("/tmp/old-run") })).toThrow(
		"OUTPUT_MUST_BE_EVALUATION_RESULTS",
	);
});
it("rejects an outside output root even when resuming a folder inside results", () => {
	expect(() =>
		evaluationOutputFolder({ out: "/tmp/outside-results", resume: resolve("evaluations/results/existing-run") }),
	).toThrow("OUTPUT_MUST_BE_EVALUATION_RESULTS");
});
