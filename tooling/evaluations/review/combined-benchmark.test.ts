import { expect, it } from "vite-plus/test";
import { parseOptions, taskVariantId, variantCases } from "./config";
import { verifierModelFor } from "./runner";
import { resolveStudyPlan } from "./study-plan";

it("restricts paid full campaigns to holdouts without filtering direct diagnostic calls", () => {
	const plan = resolveStudyPlan(parseOptions(["--study", "tasks-v1", "--fake"]));
	for (const model of plan.writers) {
		expect(model.fullHoldoutOnly).toBe(true);
		expect(variantCases(model, plan.cases, "full")).toHaveLength(216);
		expect(variantCases(model, plan.cases, "full").every((c) => c.holdout)).toBe(true);
		expect(variantCases(model, plan.cases)).toHaveLength(270);
	}
});

it("binds one-pass smoke and three-repeat full execution to the same frozen campaign", () => {
	const smoke = resolveStudyPlan(parseOptions(["--study", "tasks-v1", "--stage", "smoke", "--runs", "1", "--fake"]));
	const full = resolveStudyPlan(parseOptions(["--study", "tasks-v1", "--stage", "full", "--runs", "3", "--fake"]));
	expect(smoke.identity).toBe(full.identity);
	expect(smoke.runs).toBe(1);
	expect(full.runs).toBe(3);
});

it("uses six categories, three approved finalists and the pinned DeepSeek verifier by default", () => {
	const plan = resolveStudyPlan(parseOptions(["--study", "tasks-v1", "--stage", "full", "--dry-run"]));
	expect(new Set(plan.cases.map((item) => item.category))).toEqual(
		new Set(["summary", "job-evidence", "tailoring", "translation", "cover-letter", "interview-prep"]),
	);
	expect(plan.writers.map(taskVariantId)).toEqual([
		"openai/gpt-6-luna@none",
		"openai/gpt-6-luna@low",
		"openai/gpt-6.1-terra@medium",
	]);
	expect(plan.runs).toBe(3);
	for (const writer of plan.writers)
		expect(verifierModelFor(writer)).toMatchObject({ model: "deepseek/deepseek-v4.1-flash-1017", reasoning: "low" });
	for (const category of plan.categories) {
		const cases = plan.cases.filter((item) => item.category === category);
		expect(cases.filter((item) => !item.holdout)).toHaveLength(9);
		for (const language of ["ar", "en", "mixed"])
			expect(cases.filter((item) => item.holdout && item.language === language)).toHaveLength(12);
	}
});
