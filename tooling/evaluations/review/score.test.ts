import type { ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { expect, it } from "vite-plus/test";
import { scoreReviewCase, summarizeReviewRuns, type ReviewCase, type ReviewRun } from "./score";
const source = { kind: "resume", id: "cv", revision: "1" } as const;
const target = { sectionId: "experience", itemId: "employer-a", field: "description" };
const evidence = {
	id: "a",
	source,
	target,
	quote: "Built services",
	confirmation: "confirmed" as const,
	factId: null,
	factRevision: null,
};
const result: ReviewResult = {
	schemaVersion: 2,
	kind: "wording",
	sourceRevision: source,
	evidence: [evidence],
	questions: [],
	notes: [],
	proposals: [
		{
			schemaVersion: 2,
			id: "p",
			target,
			before: "Built services",
			after: "Built services with a 30% increase",
			claims: [{ id: "c", text: "Built services with a 30% increase", evidenceIds: ["a"] }],
			location: "Experience",
			why: "Test",
			status: "pending",
			source: "improve",
			base: source,
			targetHash: "hash",
			evidenceIds: ["a"],
		},
	],
};
const gold: ReviewCase = {
	id: "metric",
	language: "en",
	input: "Built services",
	sources: [evidence],
	supportedClaims: ["Built services"],
	forbiddenClaims: ["30%"],
	requiredFacts: ["services"],
	unknownFields: [],
	citations: [{ subjectId: "p", allowedEvidenceIds: ["a"] }],
};
it("does not score retention when no edit is proposed", () => {
	expect(scoreReviewCase(gold, { ...result, proposals: [], notes: ["No change needed."] }).lostFacts).toEqual([]);
});
it("reports a labelled fabricated metric and swapped employer evidence", () => {
	expect(scoreReviewCase(gold, result).unsupportedClaims).toEqual(["30%"]);
	if (result.kind !== "wording") throw new Error("fixture");
	const proposal = result.proposals[0];
	if (!proposal) throw new Error("Missing fixture proposal");
	const swapped: ReviewResult = { ...result, proposals: [{ ...proposal, evidenceIds: ["b"] }] };
	expect(scoreReviewCase(gold, swapped).invalidEvidenceIds).toEqual(["b"]);
});
it("reports disagreement across identical-input runs and incomplete human review", () => {
	const runs: ReviewRun[] = [0, 1, 2].map((index) => ({
		caseId: gold.id,
		result: { ...result, notes: [`variant-${index}`] },
		score: scoreReviewCase(gold, result),
		runIndex: index,
		inputDigest: "same",
		sourceDigest: "same",
		language: "en",
		promptVersion: "t006-wording-v1",
		schemaVersion: "t006-review-v1",
		modelVersion: "scripted-double",
		routeVersion: "synthetic/1",
		latencyMs: 0,
		calls: 1,
		costMicros: 10,
		humanRubric: null,
	}));
	expect(summarizeReviewRuns(runs)).toMatchObject({
		runs: 3,
		cases: 1,
		disagreement: [{ caseId: "metric", distinctOutputs: 3 }],
		incompleteHumanReview: 3,
		unsupportedClaims: 3,
		citationErrors: 0,
	});
});
it("matches gold labels across case and Arabic-Indic digit variants", () => {
	const variant = structuredClone(result);
	if (variant.kind !== "wording") throw new Error("fixture");
	const proposal = variant.proposals[0];
	if (!proposal) throw new Error("fixture");
	proposal.after = "Built services with a ٣٠% increase";
	expect(scoreReviewCase({ ...gold, forbiddenClaims: ["30%"], requiredFacts: ["BUILT"] }, variant)).toMatchObject({
		unsupportedClaims: ["30%"],
		lostFacts: [],
	});
});
