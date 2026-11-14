import { z } from "zod";
import { proposalTargetSchema } from "./resume/ai-review";
import { jobEvidenceSchema } from "./resume/variant-outputs";

export const JOB_TEXT_LIMIT = 32000;
const id = z.string().trim().min(1).max(200);
export const jobSpanSchema = z
	.strictObject({
		id,
		start: z.number().int().nonnegative(),
		end: z.number().int().positive(),
		quote: z.string().min(1).max(JOB_TEXT_LIMIT),
	})
	.refine((span) => span.end > span.start && span.end - span.start === span.quote.length, "Invalid UTF-16 span");
export type JobSpan = z.infer<typeof jobSpanSchema>;

export const saveJobTargetInputSchema = z
	.strictObject({
		jobId: id.optional(),
		expectedRevision: id.optional(),
		role: z.string().trim().min(1).max(200),
		employer: z.string().trim().max(200).default(""),
		text: z
			.string()
			.min(1)
			.max(JOB_TEXT_LIMIT)
			.refine((text) => text.trim().length > 0, "Job text required"),
	})
	.refine(
		(input) => Boolean(input.jobId) === Boolean(input.expectedRevision),
		"Job and expected revision must be paired",
	);
export type SaveJobTargetInput = z.infer<typeof saveJobTargetInputSchema>;

export const analysisIdentitySchema = z.strictObject({
	resumeId: id,
	resumeRevision: id,
	contentHash: id,
	jobId: id,
	jobRevision: id,
	rubricVersion: id,
	normalizationVersion: id,
});
export type AnalysisIdentity = z.infer<typeof analysisIdentitySchema>;

export const selectResumeJobInputSchema = z.strictObject({
	resumeId: id,
	expectedUpdatedAt: z.iso.datetime(),
	jobId: id,
	jobRevision: id,
	expectedSelectionRevision: z.iso.datetime().nullable().optional(),
});
export type SelectResumeJobInput = z.infer<typeof selectResumeJobInputSchema>;

export const saveAndSelectResumeJobInputSchema = z.strictObject({
	...selectResumeJobInputSchema.omit({ jobId: true, jobRevision: true }).shape,
	role: saveJobTargetInputSchema.shape.role,
	employer: saveJobTargetInputSchema.shape.employer,
	text: saveJobTargetInputSchema.shape.text,
});
export type SaveAndSelectResumeJobInput = z.infer<typeof saveAndSelectResumeJobInputSchema>;

export const jobTermAnalysisInputSchema = z
	.strictObject({
		identity: analysisIdentitySchema,
		jobText: z.string().max(JOB_TEXT_LIMIT),
		passages: z
			.array(z.strictObject({ id, target: proposalTargetSchema, text: z.string().max(JOB_TEXT_LIMIT) }))
			.max(500),
	})
	.refine(
		(input) =>
			new Set(input.passages.map((p) => p.id)).size === input.passages.length &&
			new Set(input.passages.map((p) => JSON.stringify(p.target))).size === input.passages.length,
		"Duplicate passages or targets",
	);
export type JobTermAnalysisInput = z.infer<typeof jobTermAnalysisInputSchema>;

export const evidenceStatusSchema = z.enum(["supported", "partial", "no_evidence", "unclear"]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const jobTermReportSchema = z.strictObject({
	identity: analysisIdentitySchema,
	state: z.enum(["not-checked", "not-checkable", "complete"]),
	denominator: z.number().int().nonnegative(),
	matchedCount: z.number().int().nonnegative(),
	unmatchedCount: z.number().int().nonnegative(),
	selection: z.strictObject({ limit: z.number().int().positive(), truncated: z.boolean() }),
	exclusions: z.array(z.string().max(200)).max(20),
	excludedTerms: z.array(z.string().max(200)).max(32000),
	terms: z
		.array(
			z.strictObject({
				term: z.string().min(1).max(200),
				matched: z.boolean(),
				surfaceForms: z.array(z.string().max(JOB_TEXT_LIMIT)).max(32000),
				jobSpans: z.array(jobSpanSchema).max(32000),
				cvSpans: z.array(jobSpanSchema.safeExtend({ passageId: id, target: proposalTargetSchema })).max(32000),
			}),
		)
		.max(35),
});
export type JobTermReport = z.infer<typeof jobTermReportSchema>;

export const jobTargetRevisionSchema = z.strictObject({
	userId: id,
	jobId: id,
	revision: id,
	role: z.string(),
	employer: z.string(),
	text: z.string().max(JOB_TEXT_LIMIT),
	digest: id,
	createdAt: z.iso.datetime(),
});
export const selectedResumeJobSchema = z.strictObject({
	resumeId: id,
	jobId: id,
	jobRevision: id,
	revision: z.iso.datetime(),
});
export const jobEvidenceViewSchema = z.strictObject({
	selection: selectedResumeJobSchema.nullable(),
	job: jobTargetRevisionSchema.nullable(),
	literal: jobTermReportSchema.nullable(),
	semantic: z.discriminatedUnion("state", [
		z.strictObject({ state: z.literal("not-checked") }),
		z.strictObject({ state: z.enum(["pending", "waiting-review", "failed", "stale"]), operationId: id }),
		z.strictObject({
			state: z.literal("complete"),
			operationId: id,
			identity: analysisIdentitySchema,
			findings: jobEvidenceSchema,
		}),
	]),
});
