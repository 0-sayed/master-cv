import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { claimsCoverText, splitReviewClaims } from "./ai-review";
import {
	reviewAnswerInputSchema,
	reviewCandidateSchema,
	reviewDecisionInputSchema,
	reviewEvidenceSchema,
	reviewProposalSchema,
	reviewResultSchema,
} from "./ai-review";

const source = { kind: "resume", id: "r1", revision: "v1" };
it("accepts fully cited literal spans regardless of punctuation grouping, never omitted text", () => {
	const text = "Filed reports; checked stock. Recorded orders.";
	expect(claimsCoverText(text, [{ id: "c", text, evidenceIds: ["e1"] }])).toBe(true);
	expect(claimsCoverText(text, [{ id: "c", text: "Filed reports;", evidenceIds: ["e1"] }])).toBe(false);
});
it("declares the exact extraction fields and safe entity bound to structured-output providers", () => {
	const schema = z.toJSONSchema(reviewCandidateSchema, { unrepresentable: "any" });
	expect(schema).toMatchObject({
		properties: {
			field: {
				enum: [
					"company",
					"position",
					"location",
					"dates",
					"description",
					"school",
					"degree",
					"area",
					"grade",
					"name",
					"proficiency",
					"language",
					"fluency",
					"title",
					"issuer",
				],
			},
			entityId: { maxLength: 64 },
		},
	});
});
it("preserves validated date objects with optional raw text and rejects invalid extraction values", () => {
	const candidate = {
		id: "c",
		section: "experience",
		entityId: "e",
		field: "dates",
		rawDateText: null,
		evidenceIds: ["e1"],
		confirmation: "needs_review",
	};
	for (const value of [
		null,
		{ start: "2020", end: "2021", present: false },
		{ start: "2020", end: null, present: true, raw: "2020 to present" },
	]) {
		expect(reviewCandidateSchema.parse({ ...candidate, value }).value).toEqual(value);
	}
	for (const value of [{ start: "2021", end: "2020", present: false }, { anything: true }, [], true, 42, undefined]) {
		expect(reviewCandidateSchema.safeParse({ ...candidate, value }).success).toBe(false);
	}
});
const target = { sectionId: "summary", field: "content" };
const evidence = {
	id: "e1",
	source,
	factId: null,
	factRevision: null,
	target,
	quote: "Built services",
	confirmation: "confirmed",
};
const proposal = {
	schemaVersion: 2,
	id: "p1",
	target,
	location: "Summary",
	before: "<p>Built services</p>",
	after: "<p>Developed services</p>",
	why: "Clearer",
	status: "pending",
	source: "improve",
	base: source,
	targetHash: "hash",
	claims: splitReviewClaims("Developed services", ["e1"]),
	evidenceIds: ["e1"],
};
const result = {
	schemaVersion: 2,
	kind: "wording",
	sourceRevision: source,
	evidence: [evidence],
	questions: [],
	proposals: [proposal],
	notes: [],
};

describe("review contracts", () => {
	it("checks claim coverage against visible decoded wording", () => {
		expect(
			reviewProposalSchema.safeParse({
				...proposal,
				after: "<p>Updated R&amp;D&#39;s guide.</p>",
				claims: splitReviewClaims("Updated R&D's guide.", ["e1"]),
			}).success,
		).toBe(true);
	});
	it("treats escaped markup characters in claim text as literal data", () => {
		expect(
			reviewProposalSchema.safeParse({
				...proposal,
				after: "<p>Reviewed &lt;label&gt; text.</p>",
				claims: splitReviewClaims("Reviewed <label> text.", ["e1"]),
			}).success,
		).toBe(true);
	});
	it("accepts Arabic and English pending source-backed proposals and explicit empty success", () => {
		expect(reviewResultSchema.safeParse(result).success).toBe(true);
		expect(reviewResultSchema.safeParse({ ...result, proposals: [], notes: ["لا توجد ملاحظات"] }).success).toBe(true);
	});
	it("rejects unknown versions, extra fields and model-selected decision states", () => {
		for (const value of [
			{ ...result, schemaVersion: 99 },
			{ ...result, accepted: true },
			{ ...result, proposals: [{ ...proposal, status: "accepted" }] },
		])
			expect(reviewResultSchema.safeParse(value).success).toBe(false);
	});
	it("rejects missing evidence, mismatched fact revisions and unsafe targets", () => {
		expect(reviewProposalSchema.safeParse({ ...proposal, evidenceIds: [] }).success).toBe(false);
		expect(reviewEvidenceSchema.safeParse({ ...evidence, factId: "f1" }).success).toBe(false);
		for (const bad of [
			{ sectionId: "basics", field: "email" },
			{ sectionId: "__proto__", itemId: "x", field: "description" },
			{ sectionId: "summary", field: "color" },
			{ sectionId: "experience", field: "description" },
		])
			expect(reviewProposalSchema.safeParse({ ...proposal, target: bad }).success).toBe(false);
	});
	it("validates extraction field types and preserves null unknown dates", () => {
		const candidate = {
			id: "c1",
			section: "experience",
			entityId: "entity1",
			field: "dates",
			value: null,
			rawDateText: "1440 هـ",
			evidenceIds: ["e1"],
			confirmation: "needs_review",
		};
		const extraction = {
			schemaVersion: 2,
			kind: "extraction",
			sourceRevision: { kind: "import", id: "i1", revision: "digest" },
			evidence: [],
			questions: [],
			candidates: [candidate],
		};
		expect(reviewResultSchema.safeParse(extraction).success).toBe(true);
		for (const value of ["2020", { start: "2020-01", end: "2019-01", present: false }])
			expect(reviewResultSchema.safeParse({ ...extraction, candidates: [{ ...candidate, value }] }).success).toBe(
				false,
			);
		expect(
			reviewResultSchema.safeParse({ ...extraction, candidates: [{ ...candidate, field: "company", value: 42 }] })
				.success,
		).toBe(false);
	});
	it("rejects blank answers and malformed decision combinations", () => {
		expect(
			reviewAnswerInputSchema.safeParse({
				operationId: "o1",
				questionId: "q1",
				requestKey: "a1",
				expectedSource: source,
				text: "   ",
			}).success,
		).toBe(false);
		const decision = {
			operationId: "o1",
			proposalIds: ["p1"],
			requestKey: "d1",
			expectedUpdatedAt: "2026-11-12T00:00:00.000Z",
			decision: "accept",
		};
		expect(reviewDecisionInputSchema.safeParse(decision).success).toBe(true);
		for (const bad of [
			{ ...decision, decision: "undo" },
			{ ...decision, decision: "accept_edited" },
			{ ...decision, editedText: "unexpected" },
			{ ...decision, proposalIds: ["p1", "p1"] },
		])
			expect(reviewDecisionInputSchema.safeParse(bad).success).toBe(false);
	});
});

describe("version 2 claim coverage", () => {
	const v2 = { ...proposal, schemaVersion: 2, claims: [{ id: "c1", text: "Developed services", evidenceIds: ["e1"] }] };
	it("requires citations covering the complete proposed text", () => {
		expect(reviewProposalSchema.safeParse(v2).success).toBe(true);
		for (const claims of [
			[],
			[{ id: "c1", text: "Developed", evidenceIds: ["e1"] }],
			[{ id: "c1", text: "Developed services", evidenceIds: [] }],
		])
			expect(reviewProposalSchema.safeParse({ ...v2, claims }).success).toBe(false);
	});
});
