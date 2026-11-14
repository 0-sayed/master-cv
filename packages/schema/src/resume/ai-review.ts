import { z } from "zod";
import { decodeHtmlEntities } from "@reactive-resume/utils/string";
import { sourceRevisionSchema } from "../ai-operation";
import { masterFactInputSchema, masterSectionSchema } from "../career-master";
import { resumeDataSchema } from "./data";

const id = z.string().trim().min(1).max(200);
const safeId = id.refine(
	(value) => !["__proto__", "prototype", "constructor"].includes(value) && !/[./\\]/u.test(value),
	"Invalid target identifier",
);
const plainText = z
	.string()
	.trim()
	.min(1)
	.max(4000)
	.refine((value) => !/<[^>]*>/u.test(value), "Plain text required");
const distinctIds = z
	.array(id)
	.min(1)
	.max(50)
	.refine((values) => new Set(values).size === values.length, "Duplicate identifiers");

/** Shared address shape; domain validation also checks the actual section type. */
export const proposalTargetSchema = z.strictObject({
	sectionId: safeId,
	itemId: safeId.optional(),
	roleId: safeId.optional(),
	field: id,
});
export const reviewTargetSchema = proposalTargetSchema.refine(
	(target) =>
		target.sectionId === "summary"
			? target.field === "content" && !target.itemId && !target.roleId
			: Boolean(target.itemId) && target.field === "description",
	"Unsupported wording target",
);
export type ProposalTarget = z.infer<typeof proposalTargetSchema>;

export const reviewEvidenceSchema = z
	.strictObject({
		id,
		source: sourceRevisionSchema,
		factId: id.nullable(),
		factRevision: z.number().int().positive().nullable(),
		target: reviewTargetSchema.nullable(),
		quote: z.string().min(1).max(32000),
		confirmation: z.enum(["confirmed", "source_unconfirmed", "user_supplied"]),
	})
	.refine(
		(evidence) => (evidence.factId === null) === (evidence.factRevision === null),
		"Fact identity and revision must be paired",
	);
export type ReviewEvidence = z.infer<typeof reviewEvidenceSchema>;

// Claim text is literal data; markup is validated on the proposed HTML and model text at their boundaries.
export const reviewClaimSchema = z.strictObject({
	id,
	text: z.string().trim().min(1).max(4000),
	evidenceIds: distinctIds,
});
export type ReviewClaim = z.infer<typeof reviewClaimSchema>;
/** Sentence/clause boundaries exclude decimals and technology names (no following space). */
export const splitReviewClaims = (text: string, evidenceIds: string[]): ReviewClaim[] =>
	text
		.trim()
		.split(/(?<=[.!?؟؛;])\s+/u)
		.filter(Boolean)
		.map((text, i) => ({ id: `claim-${i + 1}`, text, evidenceIds }));
export const reviewClaimsSchema = z.array(reviewClaimSchema).min(1).max(100);
export function claimsCoverText(text: string, claims: ReviewClaim[]): boolean {
	const clean = (s: string) => s.replace(/\s+/gu, " ").trim();
	return (
		new Set(claims.map((c) => c.id)).size === claims.length &&
		clean(claims.map((c) => c.text).join(" ")) === clean(text)
	);
}

export const reviewProposalSchema = z
	.strictObject({
		schemaVersion: z.literal(2),
		id,
		target: reviewTargetSchema,
		location: z.string().min(1).max(500),
		before: z.string().max(32000),
		after: z.string().min(1).max(32000),
		why: z.string().trim().min(1).max(4000),
		status: z.literal("pending"),
		source: z.enum(["check", "assistant", "improve"]),
		base: sourceRevisionSchema,
		targetHash: id,
		evidenceIds: distinctIds,
		claims: reviewClaimsSchema,
	})
	.refine(
		(p) =>
			claimsCoverText(decodeHtmlEntities(p.after.replace(/<[^>]*>/gu, " ")), p.claims) &&
			p.claims.every((c) => c.evidenceIds.every((id) => p.evidenceIds.includes(id))),
		"Claims must cover text and cite proposal evidence",
	);
export type ReviewProposal = z.infer<typeof reviewProposalSchema>;

// Dates remain structured facts. Two closed shapes preserve optional raw text without
// optional JSON-schema properties (OpenAI/Azure strict output requires every key).
const extractionDates = {
	start: z.string().nullable(),
	end: z.string().nullable(),
	present: z.boolean(),
};
const extractionValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
	z.strictObject(extractionDates),
	z.strictObject({ ...extractionDates, raw: z.string() }),
]);
const extractionFields = [...new Set(masterFactInputSchema.options.map((option) => option.shape.field.value))];
export const reviewCandidateSchema = z
	.strictObject({
		id,
		section: masterSectionSchema,
		entityId: safeId.max(64),
		field: z.enum(extractionFields),
		value: extractionValueSchema,
		rawDateText: z.string().max(4000).nullable(),
		evidenceIds: distinctIds,
		confirmation: z.literal("needs_review"),
	})
	.superRefine((candidate, ctx) => {
		const parsed = masterFactInputSchema.safeParse({
			section: candidate.section,
			entityId: candidate.entityId,
			field: candidate.field,
			value: candidate.value,
			source: { kind: "manual", id: "", quote: "" },
		});
		// Validate field membership even when its value is explicitly unknown.
		const knownField = masterFactInputSchema.options.some(
			(option) => option.shape.section.value === candidate.section && option.shape.field.value === candidate.field,
		);
		if (!knownField || candidate.value === undefined || (candidate.value !== null && !parsed.success))
			ctx.addIssue({ code: "custom", message: "Invalid extraction field/value" });
	});
export type ReviewCandidate = z.infer<typeof reviewCandidateSchema>;
const questionSchema = z.strictObject({
	id,
	target: reviewTargetSchema.nullable(),
	prompt: plainText,
	evidenceIds: distinctIds,
});
const common = {
	schemaVersion: z.literal(2),
	sourceRevision: sourceRevisionSchema,
	evidence: z.array(reviewEvidenceSchema).max(100),
	questions: z.array(questionSchema).max(20),
};
export const reviewResultSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		...common,
		kind: z.literal("wording"),
		proposals: z.array(reviewProposalSchema).max(50),
		notes: z.array(z.string().max(4000)).max(20),
	}),
	z.strictObject({ ...common, kind: z.literal("extraction"), candidates: z.array(reviewCandidateSchema).max(100) }),
]);
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const reviewDecisionInputSchema = z
	.strictObject({
		operationId: id,
		proposalIds: distinctIds,
		requestKey: id,
		expectedUpdatedAt: z.iso.datetime(),
		decision: z.enum(["accept", "reject", "undo", "accept_edited"]),
		editedText: plainText.optional(),
		undoDecisionId: id.optional(),
	})
	.refine(
		(value) =>
			(value.decision === "accept_edited"
				? value.proposalIds.length === 1 && value.editedText !== undefined
				: value.editedText === undefined) &&
			(value.decision === "undo" ? value.undoDecisionId !== undefined : value.undoDecisionId === undefined),
		"Invalid decision fields",
	);
export type ReviewDecisionInput = z.infer<typeof reviewDecisionInputSchema>;
export const reviewDecisionViewSchema = z.strictObject({
	decisionId: id,
	operationId: id,
	statuses: z.record(z.string(), z.enum(["pending", "accepted", "rejected"])),
	resumeId: id,
	updatedAt: z.iso.datetime(),
	data: resumeDataSchema,
});
export type ReviewDecisionView = z.infer<typeof reviewDecisionViewSchema>;
export const reviewAnswerInputSchema = z.strictObject({
	operationId: id,
	questionId: id,
	requestKey: id,
	expectedSource: sourceRevisionSchema,
	text: plainText,
});
export type ReviewAnswerInput = z.infer<typeof reviewAnswerInputSchema>;

export const reviewQuestionDismissalSchema = z.strictObject({ operationId: id, questionId: id, requestKey: id });
export const reviewViewSchema = z.strictObject({
	result: reviewResultSchema,
	statuses: z.record(z.string(), z.enum(["pending", "accepted", "rejected"])),
	answers: z.array(reviewEvidenceSchema),
	dismissedQuestionIds: z.array(id),
	answeredQuestionIds: z.array(id),
	undoable: z.array(
		z.strictObject({
			decisionId: id,
			proposalIds: distinctIds,
			changes: z.array(reviewProposalSchema),
			userSupplied: z.boolean(),
		}),
	),
});
export type ReviewView = z.infer<typeof reviewViewSchema>;
