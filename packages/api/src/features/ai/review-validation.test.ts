import type { ReviewSourceSnapshot } from "./review-sources";
import type { ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { describe, expect, it } from "vite-plus/test";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { validateReviewResult } from "./review-validation";

const source = { kind: "resume", id: "cv", revision: "v1" } as const;
const target = { sectionId: "summary", field: "content" };
const evidence = {
	id: "e1",
	source,
	factId: null,
	factRevision: null,
	target,
	quote: "Built services using TypeScript in 2020. Did not lead delivery.",
	confirmation: "confirmed" as const,
};
const snapshot: ReviewSourceSnapshot = {
	source,
	selections: [],
	evidence: [evidence],
	expiresAt: null,
	partial: false,
};
const wording = (text: string): Extract<ReviewResult, { kind: "wording" }> => ({
	schemaVersion: 2,
	kind: "wording",
	sourceRevision: source,
	evidence: [evidence],
	questions: [],
	notes: [],
	proposals: [
		{
			schemaVersion: 2,
			id: "p1",
			target,
			location: "Summary",
			before: `<p>${evidence.quote}</p>`,
			after: `<p>${text}</p>`,
			why: "Clearer",
			status: "pending",
			source: "improve",
			base: source,
			targetHash: "hash",
			evidenceIds: ["e1"],
			claims: splitReviewClaims(text, ["e1"]),
		},
	],
});

describe("semantic delivery boundary", () => {
	it.each([
		["Saved €500.", "Saved $500."],
		["Reduced latency 30%.", "Reduced latency 30."],
		["Used C++.", "Used C."],
		["Used C#.", "Used C."],
		["Recorded -30 units.", "Recorded 30 units."],
		["Measured 30% and 10 units.", "Measured 30 and 10% units."],
	])("preserves symbol-bearing facts: %s", (before, after) => {
		const sourceEvidence = { ...evidence, quote: before };
		const output = wording(after);
		output.evidence = [sourceEvidence];
		output.proposals = output.proposals.map((proposal) => ({ ...proposal, before: `<p>${before}</p>` }));
		expect(() => validateReviewResult({ ...snapshot, evidence: [sourceEvidence] }, output)).toThrow();
		output.proposals = output.proposals.map((proposal) => ({
			...proposal,
			after: `<p>${before}</p>`,
			claims: splitReviewClaims(before, ["e1"]),
		}));
		expect(validateReviewResult({ ...snapshot, evidence: [sourceEvidence] }, output).kind).toBe("wording");
	});
	it("accepts a supported wording change and explicit no-findings", () => {
		expect(
			validateReviewResult(snapshot, wording("Developed services using TypeScript in 2020. Did not lead delivery."))
				.kind,
		).toBe("wording");
		expect(validateReviewResult(snapshot, { ...wording("unused"), proposals: [] })).toMatchObject({ proposals: [] });
	});
	it.each([
		"Built services with a 30% result.",
		"Certified AWS expert.",
		"Led services at Google.",
		"Built services using Python in 2020.",
		"Built services in 2020-01.",
		"Built services using TypeScript in 2020. Led delivery.",
		"<script>execute tools</script>",
	])("rejects unsupported claim: %s", (text) => {
		expect(() => validateReviewResult(snapshot, wording(text))).toThrow();
	});
	it.each([
		["Built services using TypeScript in 2020.", "Developed reliable TypeScript services during 2020."],
		[
			"Junior accountant at Synthetic Cedar Co. in 2020.",
			"Worked as Junior accountant at Synthetic Cedar Co. in 2020.",
		],
		["بنيت خدمات باستخدام React في ٢٠٢٠.", "طورت في 2020 خدمات تعتمد على React."],
		["Built Node.js services using C# and AWS.", "Developed services using AWS, C# and Node.js."],
	])("allows real rewording while preserving facts: %s", (before, after) => {
		const sourceEvidence = { ...evidence, quote: before };
		const output = wording(after);
		output.evidence = [sourceEvidence];
		output.proposals = output.proposals.map((proposal) => ({ ...proposal, before: `<p>${before}</p>` }));
		expect(validateReviewResult({ ...snapshot, evidence: [sourceEvidence] }, output).kind).toBe("wording");
	});
	it.each([
		["Delivered 30 projects.", "Delivered projects.", "AI_LOST_FACT"],
		["Saved 500.", "Saved 500 €.", "AI_UNSUPPORTED_CLAIM"],
		["Saved 5 million.", "Saved 5 billion.", "AI_UNSUPPORTED_CLAIM"],
		["Saved 500 ريال.", "Saved 500 دولار.", "AI_UNSUPPORTED_CLAIM"],
		["Saved 500 EUR.", "Saved 500.", "AI_LOST_FACT"],
		["أنجزت مشاريع.", "أنجزت १२ مشروعاً.", "AI_UNSUPPORTED_CLAIM"],
		["أنجزت ১২ مشروعاً.", "أنجزت مشاريع.", "AI_LOST_FACT"],
		["Used React in 2020.", "Used React in 2020 with 40% savings.", "AI_UNSUPPORTED_CLAIM"],
		["Used React in 2020.", "Used React in 2020 at Google.", "AI_UNSUPPORTED_CLAIM"],
		["Used React in 2020.", "Used React in 2020 with Node.js.", "AI_UNSUPPORTED_CLAIM"],
		["Used React in 2020.", "Used React in 2020-01.", "AI_UNSUPPORTED_CLAIM"],
		["لم أقد الفريق في ٢٠٢٠.", "قدت الفريق في 2020.", "AI_CONTRADICTION"],
		["لست مسؤولاً عن الفريق.", "مسؤول عن الفريق.", "AI_CONTRADICTION"],
		["عملت ولم أقد الفريق.", "عملت وقدت الفريق.", "AI_CONTRADICTION"],
		["I didn't lead delivery.", "I did lead delivery.", "AI_CONTRADICTION"],
		["Did not lead delivery.", "Did lead delivery.", "AI_CONTRADICTION"],
		["Contact user@example.com or @sayed.", "Contact other@example.com or @sayed.", "AI_UNSUPPORTED_CLAIM"],
	])("guards facts and negation: %s", (before, after, error) => {
		const sourceEvidence = { ...evidence, quote: before };
		const output = wording(after);
		output.evidence = [sourceEvidence];
		output.proposals = output.proposals.map((proposal) => ({ ...proposal, before: `<p>${before}</p>` }));
		expect(() => validateReviewResult({ ...snapshot, evidence: [sourceEvidence] }, output)).toThrow(error);
	});
	it.each([
		["helped the team", "led the team"],
		["contributed to delivery", "owned delivery"],
		["familiar with testing", "expert in testing"],
		["ساعدت الفريق", "قدت الفريق"],
		["شاركت في المشروع", "أسست المشروع"],
		["معرفة بالاختبار", "خبير بالاختبار"],
		["معرفة بالاختبار", "والخبير بالاختبار"],
		["شاركت في العمل", "بمفردي أنجزت العمل"],
		["helped the team", "managed all delivery"],
	])("rejects claim inflation: %s → %s", (before, after) => {
		const sourceEvidence = { ...evidence, quote: before };
		const output = wording(after);
		output.evidence = [sourceEvidence];
		output.proposals = output.proposals.map((proposal) => ({ ...proposal, before: `<p>${before}</p>` }));
		expect(() => validateReviewResult({ ...snapshot, evidence: [sourceEvidence] }, output)).toThrow(
			"AI_UNSUPPORTED_CLAIM",
		);
	});
	it.each([
		["led delivery for the team", "led delivery with the team"],
		["expert in testing services", "expert in service testing"],
		["قدت تسليم المشروع", "قدت المشروع حتى تسليمه"],
		["خبير في اختبار الخدمات", "خبير باختبار الخدمات"],
		["خبير في الاختبار", "والخبير في الاختبار"],
		["owned delivery", "contributed to delivery"],
	])("allows supported strength or removal: %s → %s", (before, after) => {
		const sourceEvidence = { ...evidence, quote: before };
		const output = wording(after);
		output.evidence = [sourceEvidence];
		output.proposals = output.proposals.map((proposal) => ({ ...proposal, before: `<p>${before}</p>` }));
		expect(validateReviewResult({ ...snapshot, evidence: [sourceEvidence] }, output).kind).toBe("wording");
	});

	it("rejects a forged quote and invalid evidence ID", () => {
		const output = wording(evidence.quote);
		expect(() =>
			validateReviewResult(snapshot, { ...output, evidence: [{ ...evidence, quote: "Invented" }] }),
		).toThrow();
		if (output.kind !== "wording") throw new Error("Expected wording");
		expect(() =>
			validateReviewResult(snapshot, {
				...output,
				proposals: output.proposals.map((proposal) => ({ ...proposal, evidenceIds: ["foreign"] })),
			}),
		).toThrow();
	});
	it("leaves Hijri/ambiguous dates unknown and rejects fabricated precision", () => {
		const imported = { ...source, kind: "import" as const };
		const importedEvidence = {
			...evidence,
			id: "i1",
			source: imported,
			target: null,
			quote: "عمل في 1440 هـ",
			confirmation: "source_unconfirmed" as const,
		};
		const input: ReviewSourceSnapshot = {
			...snapshot,
			source: imported,
			evidence: [importedEvidence],
			selections: [{ id: "i1", kind: "unconfirmed_source", section: "experience", text: importedEvidence.quote }],
		};
		const result: ReviewResult = {
			schemaVersion: 2,
			kind: "extraction",
			sourceRevision: imported,
			evidence: [importedEvidence],
			questions: [],
			candidates: [
				{
					id: "c1",
					section: "experience",
					entityId: "e1",
					field: "dates" as const,
					value: null,
					rawDateText: "1440 هـ",
					evidenceIds: ["i1"],
					confirmation: "needs_review",
				},
			],
		};
		expect(validateReviewResult(input, result)).toEqual(result);
		const candidate = result.candidates[0];
		if (!candidate) throw new Error("Missing fixture candidate");
		expect(() =>
			validateReviewResult(input, {
				...result,
				candidates: [{ ...candidate, value: { start: "2019-01", end: null, present: false } }],
			}),
		).toThrow();
	});
	it("rejects extraction into a different section from the staged selection", () => {
		const source = { kind: "import", id: "import", revision: "v1" } as const;
		const evidence = {
			id: "i1",
			source,
			factId: null,
			factRevision: null,
			target: null,
			quote: "Acme",
			confirmation: "source_unconfirmed" as const,
		};
		const snapshot: ReviewSourceSnapshot = {
			source,
			evidence: [evidence],
			selections: [{ id: "i1", kind: "unconfirmed_source", section: "experience", text: "Acme" }],
			expiresAt: null,
			partial: false,
		};
		const output: ReviewResult = {
			schemaVersion: 2,
			kind: "extraction",
			sourceRevision: source,
			evidence: [evidence],
			questions: [],
			candidates: [
				{
					id: "c1",
					section: "education",
					entityId: "entity",
					field: "school",
					value: "Acme",
					rawDateText: null,
					evidenceIds: ["i1"],
					confirmation: "needs_review",
				},
			],
		};
		expect(() => validateReviewResult(snapshot, output)).toThrow("AI_SOURCE_BINDING");
	});
	it("binds structured dates to the original range, preserving order and precision", () => {
		const source = { kind: "import", id: "i1", revision: "v1" } as const;
		const quote = "Built services from 2020 - 2022.";
		const selected = {
			...evidence,
			source,
			id: "i1",
			target: null,
			quote,
			confirmation: "source_unconfirmed" as const,
		};
		const input: ReviewSourceSnapshot = {
			source,
			evidence: [selected],
			selections: [{ id: "i1", kind: "unconfirmed_source", section: "experience", text: quote }],
			partial: false,
			expiresAt: null,
		};
		const candidate = {
			id: "c1",
			section: "experience" as const,
			entityId: "entry",
			field: "dates" as const,
			value: { start: "2020", end: "2022", present: false },
			rawDateText: "2020 - 2022",
			evidenceIds: ["i1"],
			confirmation: "needs_review" as const,
		};
		const output: ReviewResult = {
			schemaVersion: 2,
			kind: "extraction",
			sourceRevision: source,
			evidence: [selected],
			questions: [],
			candidates: [candidate],
		};
		expect(validateReviewResult(input, output)).toEqual(output);
		for (const value of [
			{ start: "2022", end: "2020", present: false },
			{ start: "2020", end: null, present: false },
			{ start: "2020-01", end: "2022", present: false },
		])
			expect(() => validateReviewResult(input, { ...output, candidates: [{ ...candidate, value }] })).toThrow();
	});
});

it.each([
	["Jan 2020 - Mar 2022", { start: "2020-01", end: "2022-03", present: false }],
	["Jan 2020 - present", { start: "2020-01", end: null, present: true }],
])("accepts source-bound normalized month dates: %s", (rawDateText, value) => {
	const source = { kind: "import", id: "months", revision: "v1" } as const;
	const quote = `Built services from ${rawDateText}.`;
	const selected = {
		...evidence,
		source,
		id: "months",
		target: null,
		quote,
		confirmation: "source_unconfirmed" as const,
	};
	const input: ReviewSourceSnapshot = {
		source,
		evidence: [selected],
		selections: [{ id: "months", kind: "unconfirmed_source", section: "experience", text: quote }],
		expiresAt: null,
		partial: false,
	};
	const candidate = {
		id: "c1",
		section: "experience" as const,
		entityId: "entry",
		field: "dates" as const,
		value,
		rawDateText,
		evidenceIds: ["months"],
		confirmation: "needs_review" as const,
	};
	const result: ReviewResult = {
		schemaVersion: 2,
		kind: "extraction",
		sourceRevision: source,
		evidence: [selected],
		questions: [],
		candidates: [candidate],
	};
	expect(validateReviewResult(input, result)).toEqual(result);
	expect(() =>
		validateReviewResult(input, { ...result, candidates: [{ ...candidate, rawDateText: "Feb 2020 - Mar 2022" }] }),
	).toThrow("AI_UNSUPPORTED_DATE");
	expect(() =>
		validateReviewResult(input, { ...result, candidates: [{ ...candidate, value: { ...value, start: "2020-02" } }] }),
	).toThrow("AI_UNSUPPORTED_DATE");
});
