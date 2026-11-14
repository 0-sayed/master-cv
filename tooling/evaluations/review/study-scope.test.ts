import { expect, it } from "vite-plus/test";
import { parseTaskCategories, parseOptions } from "./config";
import { loadStudyCases, recordedControls, studyReviewItems, taskCategories } from "./study";
it("retains default six categories and rejects ambiguous or incompatible scopes", () => {
	expect(parseOptions(["--study", "tasks-v1"]).categories).toBeUndefined();
	for (const value of ["", "summary,summary", "unknown", "summary,"])
		expect(() => parseTaskCategories(value)).toThrow();
	expect(() => parseOptions(["--categories", "summary"])).toThrow("TASK_CATEGORIES_REQUIRE_TASKS_STUDY");
	expect(() =>
		parseOptions(["--study", "tasks-v1", "--categories", "summary", "--smoke-category", "extraction"]),
	).toThrow();
});
it("uses the complete recorded controls for an explicit full category scope", () => {
	const all = recordedControls(undefined, "tasks-v1");
	expect(all).toMatchObject({ checked: 1056, pass: true, failures: [] });
	expect(recordedControls(undefined, "tasks-v1", [...taskCategories])).toEqual(all);
	expect(recordedControls(undefined, "tasks-v1", [...taskCategories].reverse())).toEqual(all);
});
it("scopes every category without dropping languages, partitions or owner-review canaries", () => {
	const scope = parseTaskCategories("job-evidence,tailoring,translation,summary");
	const cases = loadStudyCases("tasks-v1", scope);
	expect(new Set(cases.map((c) => c.category)).size).toBe(4);
	for (const category of scope)
		for (const language of ["ar", "en", "mixed"])
			for (const holdout of [false, true])
				expect(cases.some((c) => c.category === category && c.language === language && c.holdout === holdout)).toBe(
					true,
				);
	const review = studyReviewItems("tasks-v1", cases);
	expect(review.every((c) => scope.includes(c.category as (typeof scope)[number]))).toBe(true);
	expect(review.some((c) => c.id === "judge-canary-translation-ar")).toBe(true);
});
