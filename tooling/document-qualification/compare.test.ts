import { describe, expect, it } from "vite-plus/test";
import { compareQualification } from "./compare";

const gold = {
	review: { status: "draft" as const },
	text: "أحمد شركة ألف مطور 2020–2022 شركة باء مدير 2023–2024",
	fields: [
		{ id: "name", value: "أحمد" },
		{ id: "company-a", value: "شركة ألف" },
		{ id: "role-a", value: "مطور" },
		{ id: "dates-a", value: "2020–2022" },
		{ id: "company-b", value: "شركة باء" },
		{ id: "role-b", value: "مدير" },
		{ id: "dates-b", value: "2023–2024" },
	],
	associations: [
		{ id: "job-a", fields: ["company-a", "role-a", "dates-a"] },
		{ id: "job-b", fields: ["company-b", "role-b", "dates-b"] },
	],
	order: [
		["name", "company-a"],
		["company-a", "company-b"],
	] as [string, string][],
	forbidden: ["HIDDEN-FACT"],
};

describe("qualification comparator", () => {
	it("keeps draft gold pending even when all automated checks pass", () => {
		const result = compareQualification(gold, gold.text);
		expect(result.passed).toBe(true);
		expect(result.acceptance).toBe("pending-review");
		expect(result.normalized.recall).toBe(1);
	});
	it("does not hide a missing name or a lost diacritic", () => {
		expect(compareQualification(gold, gold.text.replace("أحمد", "احمد")).missing).toContain("name");
		expect(compareQualification({ ...gold, fields: [{ id: "name", value: "مُحَمَّد" }] }, "محمد").passed).toBe(false);
	});
	it("detects swapped dates even when every field is present", () => {
		const text = "أحمد شركة ألف مطور 2023–2024 شركة باء مدير 2020–2022";
		const result = compareQualification(gold, text);
		expect(result.missing).toEqual([]);
		expect(result.associationFailures.length).toBeGreaterThan(0);
		expect(result.passed).toBe(false);
	});
	it("rejects extra numerical claims and hidden facts", () => {
		expect(compareQualification(gold, `${gold.text} improved 99%`).unexpectedNumbers).toContain("99");
		expect(compareQualification(gold, `${gold.text} HIDDEN-FACT`).forbidden).toEqual(["HIDDEN-FACT"]);
	});
	it("preserves order rather than sorting words to make a check pass", () => {
		const text = "شركة باء مدير 2023–2024 أحمد شركة ألف مطور 2020–2022";
		expect(compareQualification(gold, text).orderFailures).toContain("company-a→company-b");
	});
	it("allows declared numeric equivalents but preserves raw text and exact metrics", () => {
		const text = gold.text.replace("2020", "٢٠٢٠").replace("2022", "۲۰۲۲");
		const result = compareQualification(gold, text);
		expect(result.passed).toBe(true);
		expect(result.exact.recall).toBeLessThan(1);
		expect(result.observed).toBe(text);
	});
	it("does not turn empty evidence into a perfect recall", () => {
		const result = compareQualification({ ...gold, fields: [], associations: [], order: [] }, "");
		expect(result.normalized.recall).toBeNull();
		expect(result.passed).toBe(false);
	});
	it("does not discard a directional control that belongs to an authored field", () => {
		const source = "أحمد\u202e";
		expect(
			compareQualification(
				{ ...gold, text: source, fields: [{ id: "name", value: source }], associations: [], order: [] },
				"أحمد",
			).passed,
		).toBe(false);
	});
});
