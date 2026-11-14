import { z } from "zod";
import { sourceRevisionSchema } from "../ai-operation";
import { reviewDecisionViewSchema } from "./ai-review";
import { resumeDataSchema } from "./data";
import {
	jobEvidenceSchema,
	summaryOutputSchema,
	tailoringOutputSchema,
	translationOutputSchema,
} from "./variant-outputs";

const id = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.refine(
		(value) => !["__proto__", "prototype", "constructor"].includes(value) && !/[./\\]/u.test(value),
		"Invalid identifier",
	);
export const documentLocaleSchema = z.enum(["ar-SA", "en-US"]);
export const variantOperationKindSchema = z.enum([
	"review.job-evidence",
	"review.tailoring",
	"review.translation",
	"review.summary",
]);
export type VariantOperationKind = z.infer<typeof variantOperationKindSchema>;
const operationCommon = { resumeId: id, expectedUpdatedAt: z.iso.datetime() };
const operationJob = { ...operationCommon, jobId: id, jobRevision: id, expectedSelectionRevision: z.iso.datetime() };
export const variantOperationParameters = {
	"review.job-evidence": z.strictObject(operationJob),
	"review.tailoring": z.strictObject(operationJob),
	"review.translation": z.strictObject({ ...operationCommon, expectedSourceRevision: z.iso.datetime() }),
	"review.summary": z.strictObject({
		...operationCommon,
		selectedEvidenceIds: z
			.array(id)
			.max(50)
			.refine((ids) => new Set(ids).size === ids.length),
	}),
} as const;
export const prepareVariantReviewInputSchema = z.discriminatedUnion("kind", [
	variantOperationParameters["review.job-evidence"].extend({ kind: z.literal("review.job-evidence") }),
	variantOperationParameters["review.tailoring"].extend({ kind: z.literal("review.tailoring") }),
	variantOperationParameters["review.translation"].extend({ kind: z.literal("review.translation") }),
	variantOperationParameters["review.summary"].extend({ kind: z.literal("review.summary") }),
]);
const copyFields = { sourceResumeId: id, expectedUpdatedAt: z.iso.datetime(), requestKey: id };
export const createVariantInputSchema = z.discriminatedUnion("variantKind", [
	z.strictObject({ ...copyFields, variantKind: z.literal("job"), jobId: id, jobRevision: id }),
	z.strictObject({ ...copyFields, variantKind: z.literal("language"), targetLocale: documentLocaleSchema }),
]);
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;

// Closed field inventory from resume/data.ts; identity/contact/link/date values stay local.
export const translationSectionSchema = z.enum([
	"summary",
	"experience",
	"education",
	"skills",
	"interests",
	"languages",
	"awards",
	"certifications",
	"projects",
	"publications",
	"volunteer",
]);
export const translationTargetSchema = z.union([
	z.strictObject({ sectionId: z.literal("basics"), field: z.literal("headline") }),
	z.strictObject({ sectionId: translationSectionSchema, field: z.literal("title") }),
	z.strictObject({ sectionId: z.literal("summary"), field: z.literal("content") }),
	z.strictObject({
		sectionId: z.literal("experience"),
		itemId: id,
		roleId: id.optional(),
		field: z.enum(["position", "description"]),
	}),
	z.strictObject({ sectionId: z.literal("experience"), itemId: id, field: z.literal("company") }),
	z.strictObject({
		sectionId: z.literal("education"),
		itemId: id,
		field: z.enum(["school", "degree", "area", "description"]),
	}),
	z.strictObject({ sectionId: z.literal("skills"), itemId: id, field: z.enum(["name", "proficiency"]) }),
	z.strictObject({
		sectionId: z.enum(["skills", "interests"]),
		itemId: id,
		field: z.literal("keywords"),
		index: z.number().int().nonnegative().max(500),
	}),
	z.strictObject({ sectionId: z.literal("interests"), itemId: id, field: z.literal("name") }),
	z.strictObject({ sectionId: z.literal("awards"), itemId: id, field: z.enum(["title", "awarder", "description"]) }),
	z.strictObject({
		sectionId: z.literal("certifications"),
		itemId: id,
		field: z.enum(["title", "issuer", "description"]),
	}),
	z.strictObject({ sectionId: z.literal("projects"), itemId: id, field: z.enum(["name", "description"]) }),
	z.strictObject({
		sectionId: z.literal("publications"),
		itemId: id,
		field: z.enum(["title", "publisher", "description"]),
	}),
	z.strictObject({ sectionId: z.literal("volunteer"), itemId: id, field: z.enum(["organization", "description"]) }),
	z.strictObject({ sectionId: z.literal("languages"), itemId: id, field: z.enum(["language", "fluency"]) }),
]);
export type TranslationTarget = z.infer<typeof translationTargetSchema>;

export const variantTerminologySchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		terms: z
			.array(
				z.strictObject({
					id,
					sourceRevision: z.string().min(1).max(200),
					target: translationTargetSchema,
					source: z.string().min(1).max(4000),
					value: z.string().min(1).max(4000),
					status: z.enum(["pending", "confirmed"]),
					author: z.enum(["source", "user"]),
				}),
			)
			.max(500),
	})
	.refine(
		(value) => new Set(value.terms.map((term) => term.id)).size === value.terms.length,
		"Duplicate terminology IDs",
	);
export type VariantTerminology = z.infer<typeof variantTerminologySchema>;

export const variantViewSchema = z.strictObject({
	resumeId: id,
	baseResumeId: id,
	variantKind: z.enum(["base", "job", "language"]),
	sourceResumeId: id.nullable(),
	sourceRevision: z.string().min(1).max(200),
	documentLocale: z.string().min(1).max(100),
	targetLocale: documentLocaleSchema.nullable(),
	reviewState: z.enum(["pending", "accepted"]),
	updatedAt: z.iso.datetime(),
});
export const variantFreshnessSchema = variantViewSchema.extend({
	state: z.enum(["current", "stale", "unavailable"]),
	sourceChanged: z.boolean(),
	staleFactIds: z.array(id).max(500),
});
export type VariantView = z.infer<typeof variantViewSchema>;
export type VariantFreshness = z.infer<typeof variantFreshnessSchema>;

const reviewEnvelope = { schemaVersion: z.literal(1), sourceRevision: sourceRevisionSchema };
export const variantReviewResultSchema = z.discriminatedUnion("kind", [
	z.strictObject({ ...reviewEnvelope, kind: z.literal("review.job-evidence"), output: jobEvidenceSchema }),
	z.strictObject({ ...reviewEnvelope, kind: z.literal("review.tailoring"), output: tailoringOutputSchema }),
	z.strictObject({ ...reviewEnvelope, kind: z.literal("review.translation"), output: translationOutputSchema }),
	z.strictObject({ ...reviewEnvelope, kind: z.literal("review.summary"), output: summaryOutputSchema }),
]);
export type VariantReviewResult = z.infer<typeof variantReviewResultSchema>;
const subjects = z
	.array(id)
	.min(1)
	.max(100)
	.refine((ids) => new Set(ids).size === ids.length);
export const variantDecisionInputSchema = z
	.strictObject({
		operationId: id,
		requestKey: id,
		expectedUpdatedAt: z.iso.datetime(),
		expectedDecisionId: id.nullable(),
		subjectIds: subjects,
		decision: z.enum(["accept", "accept_edited", "reject", "undo"]),
		editedText: z
			.string()
			.trim()
			.min(1)
			.max(4000)
			.refine((value) => !/<[^>]*>/u.test(value))
			.optional(),
		undoDecisionId: id.optional(),
	})
	.refine(
		(input) =>
			(input.decision === "accept_edited"
				? input.subjectIds.length === 1 && input.editedText !== undefined
				: input.editedText === undefined) &&
			(input.decision === "undo" ? input.undoDecisionId !== undefined : input.undoDecisionId === undefined),
		"Invalid decision fields",
	);
export type VariantDecisionInput = z.infer<typeof variantDecisionInputSchema>;
export const variantDecisionViewSchema = reviewDecisionViewSchema;
export type VariantDecisionView = z.infer<typeof variantDecisionViewSchema>;
const provenanceSnapshotSchema = z.strictObject({
	acceptedSourceRevision: z.string().nullable(),
	terminology: variantTerminologySchema,
	acceptedFactRevisions: z.array(z.strictObject({ factId: id, revision: z.number().int().nonnegative() })).max(500),
});
const savedSnapshotSchema = z.strictObject({ data: resumeDataSchema, provenance: provenanceSnapshotSchema.nullable() });
export const variantDecisionPayloadSchema = z.strictObject({
	schemaVersion: z.literal(1),
	kind: variantOperationKindSchema,
	terms: variantTerminologySchema,
	segments: z.record(
		z.string(),
		z.strictObject({
			text: z.string().max(4000),
			status: z.enum(["pending", "accepted", "rejected"]),
			author: z.enum(["model", "user"]),
		}),
	),
	before: savedSnapshotSchema.nullable(),
	after: savedSnapshotSchema.nullable(),
});
export type VariantDecisionPayload = z.infer<typeof variantDecisionPayloadSchema>;
export const variantReviewViewSchema = z.strictObject({
	beforeSummary: z.string().max(32000),
	answeredQuestionIds: z.array(id).max(100),
	dismissedQuestionIds: z.array(id).max(100),
	result: variantReviewResultSchema,
	statuses: variantDecisionViewSchema.shape.statuses,
	terms: variantTerminologySchema,
	segments: variantDecisionPayloadSchema.shape.segments,
	sourceSegments: z.array(z.strictObject({ id, text: z.string().max(4000) })).max(49),
	updatedAt: z.iso.datetime(),
	latestDecisionId: id.nullable(),
	stale: z.boolean(),
	undoable: z.array(z.strictObject({ decisionId: id, subjectIds: subjects })),
});
