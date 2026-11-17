import { expect, it } from "vite-plus/test";
import { parseOptions, taskVariantId } from "./config";
import { resolveStudyPlan } from "./study-plan";

it("requires explicit, exclusive process credentials", () => {
	expect(parseOptions(["--credential-source", "process"]).credentialSource).toBe("process");
	for (const mode of ["--key-file", "--env-file"]) {
		expect(() => parseOptions(["--credential-source", "process", mode, "unused"])).toThrow(
			"DUPLICATE_CREDENTIAL_SOURCE",
		);
	}
});

it("resolves the six-category finalist study without a writer expansion", () => {
	const options = parseOptions([
		"--study",
		"tasks-v1",
		"--stage",
		"smoke",
		"--dry-run",
		"--variants",
		"openai/gpt-6-luna@none,openai/gpt-6-luna@low,openai/gpt-6.1-terra@medium",
	]);
	const plan = resolveStudyPlan(options);
	expect(plan.categories).toEqual([
		"summary",
		"job-evidence",
		"tailoring",
		"translation",
		"cover-letter",
		"interview-prep",
	]);
	expect(plan.writers.map(taskVariantId)).toEqual([
		"openai/gpt-6-luna@none",
		"openai/gpt-6-luna@low",
		"openai/gpt-6.1-terra@medium",
	]);
	expect(plan.runs).toBe(1);
	expect(plan.cases).toHaveLength(270);
});

it("uses three repetitions for the full study", () => {
	const plan = resolveStudyPlan(parseOptions(["--study", "tasks-v1", "--dry-run"]));
	expect(plan.runs).toBe(3);
	expect(plan.stage).toBe("full");
	expect(plan.identity).not.toBe("");
});
