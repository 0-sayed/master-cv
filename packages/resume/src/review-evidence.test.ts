import type { ReviewEvidence, ReviewProposal, ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { describe, expect, it } from "vite-plus/test";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { blockText } from "./proposals";
import {
	applyReviewProposals,
	hashReviewTarget,
	rebaseReviewProposal,
	validateReviewEvidence,
} from "./review-evidence";

const source = { kind: "resume", id: "r1", revision: "v1" } as const;
const target = { sectionId: "summary", field: "content" };
const original = "<p>Built services.</p><p>Kept manual work.</p>";
const evidence: ReviewEvidence = {
	id: "e1",
	source,
	factId: null,
	factRevision: null,
	target,
	quote: "Built services.",
	confirmation: "confirmed",
};
function proposal(overrides: Partial<ReviewProposal> = {}): ReviewProposal {
	return {
		schemaVersion: 2,
		id: "p1",
		target,
		location: "Summary",
		before: "<p>Built services.</p>",
		after: "<p>Developed services.</p>",
		why: "Clearer",
		status: "pending",
		source: "improve",
		base: source,
		targetHash: hashReviewTarget(original),
		evidenceIds: ["e1"],
		claims: splitReviewClaims(overrides.after ? blockText(overrides.after) : "Developed services.", ["e1"]),
		...overrides,
	};
}
function result(proposals = [proposal()]): ReviewResult {
	return {
		schemaVersion: 2,
		kind: "wording",
		sourceRevision: source,
		evidence: [evidence],
		questions: [],
		proposals,
		notes: [],
	};
}
const resume = () => ({
	...structuredClone(defaultResumeData),
	summary: { ...defaultResumeData.summary, content: original },
});

describe("atomic review passage application", () => {
	it("rebases only acknowledged sibling changes and keeps full-field manual-edit detection", () => {
		const first = proposal();
		const sibling = proposal({ id: "p2", before: "<p>Kept manual work.</p>", after: "<p>Preserved manual work.</p>" });
		const next = applyReviewProposals(resume(), [first]);
		const rebased = rebaseReviewProposal(next, sibling, [first]);
		expect(applyReviewProposals(next, [rebased]).summary.content).toBe(
			"<p>Developed services.</p><p>Preserved manual work.</p>",
		);
		next.summary.content += "<p>New manual work.</p>";
		expect(() => rebaseReviewProposal(next, sibling, [first])).toThrow();
	});
	it("changes only the selected paragraph without mutating its input", () => {
		const data = resume();
		const updated = applyReviewProposals(data, [proposal()]);
		expect(updated.summary.content).toBe("<p>Developed services.</p><p>Kept manual work.</p>");
		expect(data.summary.content).toBe(original);
		expect(updated.basics).toEqual(data.basics);
	});
	it("rejects duplicate IDs, overlap and a stale complete target field atomically", () => {
		const data = resume();
		for (const batch of [
			[proposal(), proposal()],
			[proposal(), proposal({ id: "p2" })],
			[proposal({ targetHash: "stale" })],
		])
			expect(() => applyReviewProposals(data, batch)).toThrow();
		expect(data.summary.content).toBe(original);
	});
	it("rejects ambiguous repeated text and unsafe targets", () => {
		const data = resume();
		data.summary.content = "<p>Built services.</p><p>Built services.</p>";
		expect(() =>
			applyReviewProposals(data, [proposal({ targetHash: hashReviewTarget(data.summary.content) })]),
		).toThrow();
		for (const bad of [
			{ sectionId: "basics", field: "email" },
			{ sectionId: "__proto__", itemId: "x", field: "description" },
			{ sectionId: "summary", field: "content", itemId: "x" },
		])
			expect(() => applyReviewProposals(resume(), [proposal({ target: bad })])).toThrow();
	});
	it("keeps replacement tokens literal, escapes proposed markup and retains Arabic", () => {
		const next = applyReviewProposals(resume(), [proposal({ after: "<p>$&amp; &lt;script&gt; نص عربي</p>" })]);
		expect(next.summary.content).toBe("<p>$&amp; &lt;script&gt; نص عربي</p><p>Kept manual work.</p>");
		expect(() => applyReviewProposals(resume(), [proposal({ after: '<p onclick="alert(1)">bad</p>' })])).toThrow();
	});
	it("applies an inverse without discarding unrelated later work", () => {
		const next = applyReviewProposals(resume(), [proposal()]);
		next.basics.headline = "New manual headline";
		const restored = applyReviewProposals(next, [
			proposal({
				before: "<p>Developed services.</p>",
				after: "<p>Built services.</p>",
				targetHash: hashReviewTarget(next.summary.content),
			}),
		]);
		expect(restored.summary.content).toBe(original);
		expect(restored.basics.headline).toBe("New manual headline");
	});
});

describe("authoritative review evidence", () => {
	it("accepts matching source evidence", () =>
		expect(validateReviewEvidence(result(), [evidence])).toEqual({ ok: true }));
	it("rejects forged quotes, revisions, unknown evidence and unconfirmed wording", () => {
		for (const bad of [
			{ ...evidence, quote: "Led all delivery" },
			{ ...evidence, source: { ...source, revision: "v2" } },
			{ ...evidence, confirmation: "source_unconfirmed" as const },
		])
			expect(validateReviewEvidence(result(), [bad]).ok).toBe(false);
		expect(validateReviewEvidence(result([proposal({ evidenceIds: ["missing"] })]), [evidence]).ok).toBe(false);
	});
	it("rejects a real citation associated with a different entry", () => {
		const other = { ...evidence, target: { sectionId: "experience", itemId: "other-company", field: "description" } };
		const review = { ...result(), evidence: [other] };
		expect(validateReviewEvidence(review, [other]).ok).toBe(false);
	});
});
