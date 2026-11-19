import type { PdfRuleCode } from "./catalog";
import type { PdfCheckResult } from "./types";
import { describe, expect, it } from "vite-plus/test";
import fc from "fast-check";
import { PDF_ATS_RULE_CODES, pdfRuleCap, pdfRuleCategory, pdfRuleDeduction, pdfRuleSeverity } from "./catalog";
import { scoreChecks } from "./score";

const result = (code: PdfRuleCode, status: PdfCheckResult["status"]): PdfCheckResult => ({
	code,
	category: pdfRuleCategory(code),
	severity: pdfRuleSeverity(code),
	status,
	findings: [],
});

const allPassing = () => PDF_ATS_RULE_CODES.map((code) => result(code, "pass"));

const statusArbitrary = fc.constantFrom<PdfCheckResult["status"]>("pass", "skip", "fail");

const resultsArbitrary = fc
	.array(statusArbitrary, { minLength: PDF_ATS_RULE_CODES.length, maxLength: PDF_ATS_RULE_CODES.length })
	.map((statuses) => PDF_ATS_RULE_CODES.map((code, index) => result(code, statuses[index] ?? "pass")));

describe("scoreChecks", () => {
	it("rounds the weighted date deduction after scoring its category", () => {
		const results = allPassing().map((entry) =>
			entry.code === "MIXED_DATE_FORMATS" ? result(entry.code, "fail") : entry,
		);
		const breakdown = scoreChecks(results);
		expect(breakdown.categories.find((category) => category.category === "dates")?.score).toBe(95);
		expect(breakdown.score).toBe(100);
	});
	it.each(PDF_ATS_RULE_CODES)("applies the catalog score effect for %s", (code) => {
		const passing = scoreChecks(allPassing());
		const failed = scoreChecks(allPassing().map((entry) => (entry.code === code ? result(code, "fail") : entry)));
		const severity = pdfRuleSeverity(code);
		expect(passing.score).toBe(100);
		if (severity === "tip") {
			expect(failed.score).toBe(100);
			expect(failed.cappedBy).toEqual([]);
		} else {
			const category = failed.categories.find((entry) => entry.category === pdfRuleCategory(code));
			if (!category) throw new Error("Scored category is missing");
			const penalty = severity === "blocker" ? 60 : pdfRuleDeduction(code);
			expect(category.score).toBe(100 - penalty);
			const weightedScore = Math.round(100 - (penalty * category.weight) / 100);
			if (severity === "blocker") {
				const cap = pdfRuleCap(code);
				if (cap === null) throw new Error("Blocker has no cap");
				expect(failed.score).toBe(Math.min(weightedScore, cap));
				expect(failed.cappedBy).toEqual([code]);
			} else {
				expect(failed.score).toBe(weightedScore);
				expect(failed.cappedBy).toEqual([]);
			}
		}
	});
	it("holds the score to the tightest cap among the blockers that fired", () => {
		const breakdown = scoreChecks([
			...allPassing().filter((entry) => entry.code !== "NO_EMAIL" && entry.code !== "NO_TEXT_LAYER"),
			result("NO_EMAIL", "fail"),
			result("NO_TEXT_LAYER", "fail"),
		]);

		expect(breakdown.score).toBeLessThanOrEqual(pdfRuleCap("NO_TEXT_LAYER") ?? 0);
		expect(breakdown.cappedBy).toEqual(["NO_TEXT_LAYER", "NO_EMAIL"]);
	});

	it("always produces an integer inside 0–100", () => {
		fc.assert(
			fc.property(resultsArbitrary, (results) => {
				const { score } = scoreChecks(results);

				expect(Number.isInteger(score)).toBe(true);
				expect(score).toBeGreaterThanOrEqual(0);
				expect(score).toBeLessThanOrEqual(100);
			}),
		);
	});

	it("never rewards a document for failing one more check", () => {
		fc.assert(
			fc.property(resultsArbitrary, fc.nat(), (results, seed) => {
				const target = results[seed % results.length];
				if (!target || target.status === "fail") return;

				const worse = results.map((entry) =>
					entry.code === target.code ? { ...entry, status: "fail" as const } : entry,
				);

				expect(scoreChecks(worse).score).toBeLessThanOrEqual(scoreChecks(results).score);
			}),
		);
	});
});
