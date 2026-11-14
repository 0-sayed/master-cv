import { expect, it } from "vite-plus/test";
import { cases } from "./corpus";
import { fixedHonesty } from "./honesty";
import { controls } from "./study";
it("measures independently written honest paraphrases rather than gold identity", () => {
	const result = fixedHonesty();
	expect(result.total).toBe(58);
	expect(result.families).toBe(12);
	expect(result.shortPassages.failures).toEqual([]);
	expect(result.fullPassages.total).toBe(10);
	expect(result.fullPassages.languages).toEqual({ en: 5, ar: 5 });
	expect(result.fullPassages.rejected).toBe(result.fullPassages.failures.length);
});
it("every tuning gold passes and every tuning attack fails the production guard", () => {
	expect(controls(cases.filter((c) => !c.holdout)).failures).toEqual([]);
});
it("tuning has distinct structures, transformations and extracted fields", () => {
	const tuning = cases.filter((c) => !c.holdout);
	expect(new Set(tuning.map((c) => c.structure)).size).toBeGreaterThanOrEqual(8);
	expect(new Set(tuning.map((c) => c.task)).size).toBeGreaterThanOrEqual(5);
	expect(new Set(tuning.flatMap((c) => (c.extraction ? [c.extraction.field] : [])))).toEqual(
		new Set(["company", "position", "location", "dates", "school", "degree"]),
	);
});
