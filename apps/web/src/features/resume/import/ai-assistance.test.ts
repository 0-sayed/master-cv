import type { ReviewState } from "./review-draft";
import type { ReviewCandidate, ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { describe, expect, it } from "vite-plus/test";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import { applyImportReviewCandidate, importDraftGeneration } from "./ai-assistance";
import { createReviewState } from "./review-draft";

function fixture() {
	const data = parseResumeText("Sara Example\nEXPERIENCE\nExample Labs | Engineer | 2024");
	const state = createReviewState(data, "550e8400-e29b-41d4-a716-446655440000");
	const entry = data.sections.experience.items[0];
	if (!entry) throw new Error("Missing fixture entry");
	const source = { kind: "import", id: "source", revision: "digest" } as const;
	const candidate: ReviewCandidate = {
		id: "c1",
		section: "experience",
		entityId: "source-entity",
		field: "position",
		value: "Software Engineer",
		rawDateText: null,
		evidenceIds: ["e1"],
		confirmation: "needs_review",
	} as const;
	const result: ReviewResult = {
		schemaVersion: 2,
		kind: "extraction",
		sourceRevision: source,
		questions: [],
		evidence: [],
		candidates: [candidate],
	};
	return {
		state: {
			...state,
			confirmed: { [`experience:${entry.id}:position`]: JSON.stringify("Engineer") },
			reviewed: { [`experience:${entry.id}`]: "reviewed" },
			aiReview: {
				version: 1 as const,
				source,
				operationId: "op",
				result: structuredClone(result),
				draftGeneration: importDraftGeneration(state.data),
				appliedCandidateIds: [],
			},
		} as ReviewState,
		entry,
		candidate: structuredClone(candidate),
	};
}
describe("local extraction candidate application", () => {
	it("changes only the chosen draft field and invalidates confirmation and submission", () => {
		const f = fixture();
		const next = applyImportReviewCandidate(f.state, "c1", f.entry.id);
		expect(next.data.sections.experience.items[0]?.position).toBe("Software Engineer");
		expect(next.confirmed[`experience:${f.entry.id}:position`]).toBeUndefined();
		expect(next.reviewed[`experience:${f.entry.id}`]).toBeUndefined();
		expect(next.submission).toBeUndefined();
		expect(f.state.data.sections.experience.items[0]?.position).toBe("Engineer");
	});
	it("rejects stale local edits and mismatched source digests", () => {
		const f = fixture();
		f.state.data.basics.headline = "Manual work";
		expect(() => applyImportReviewCandidate(f.state, "c1", f.entry.id)).toThrow("AI_IMPORT_STALE");
		const other = fixture();
		if (!other.state.aiReview) throw new Error("Missing fixture review");
		other.state.aiReview.source = { ...other.state.aiReview.source, revision: "foreign" };
		expect(() => applyImportReviewCandidate(other.state, "c1", other.entry.id)).toThrow("AI_IMPORT_STALE");
	});
	it("withholds null unknowns and does not overwrite reused confirmed master facts", () => {
		const f = fixture();
		if (f.state.aiReview?.result?.kind !== "extraction") throw new Error("fixture");
		f.state.aiReview.result.candidates[0] = { ...f.candidate, value: null };
		expect(() => applyImportReviewCandidate(f.state, "c1", f.entry.id)).toThrow("AI_IMPORT_UNKNOWN");
		const other = fixture();
		other.state.reused = [
			{
				confirmation: "confirmed",
				structured: { section: "experience", entityId: other.entry.id, field: "position", value: "Engineer" },
			},
		] as never;
		expect(() => applyImportReviewCandidate(other.state, "c1", other.entry.id)).toThrow("AI_IMPORT_CONFIRMED_MASTER");
	});
});
