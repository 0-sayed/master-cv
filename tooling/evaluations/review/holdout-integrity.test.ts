import { expect, it } from "vite-plus/test";
import { loadStudyCases, taskCategories } from "./study";

it("keeps twelve realistic unseen holdouts per language and category outside tuning", () => {
	const cases = loadStudyCases("tasks-v1");
	const input = (c: (typeof cases)[number]) => (c.kind === "task" ? JSON.stringify([c.cv, c.jobAd]) : "");
	const tuning = new Set(cases.filter((c) => !c.holdout).map(input));
	for (const category of taskCategories) {
		for (const language of ["ar", "en", "mixed"]) {
			const holdout = cases.filter((c) => c.holdout && c.category === category && c.language === language);
			expect(holdout).toHaveLength(12);
			expect(new Set(holdout.map(input)).size).toBe(12);
			for (const c of holdout) {
				expect(tuning.has(input(c)), c.id).toBe(false);
				if (c.kind !== "task") throw new Error("TASK_REQUIRED");
				expect(c.cv.length).toBeGreaterThanOrEqual(5);
				expect(c.cv.map((f) => f.text).join(" ").length).toBeGreaterThan(500);
			}
		}
	}
});
