import { z } from "zod";
import { proposalTargetSchema } from "./ai-review";

const jobevidenceIdentifier = z.string().trim().min(1).max(200);
/** Required fields and closed objects work across the installed strict-schema routes. */
export const jobEvidenceSchema = z.strictObject({
	requirements: z
		.array(
			z.strictObject({
				id: jobevidenceIdentifier,
				spanIds: z.array(jobevidenceIdentifier).max(50),
				importance: z.enum(["essential", "preferred", "unstated"]),
				verdict: z.enum(["supported", "partial", "no_evidence", "unclear"]),
				evidenceIds: z.array(jobevidenceIdentifier).max(50),
				explanation: z.string().trim().min(1).max(2000),
			}),
		)
		.max(50),
	notes: z.array(z.string().trim().min(1).max(1000)).max(10),
});
export type JobEvidenceOutput = z.infer<typeof jobEvidenceSchema>;

const summaryId = z.string().trim().min(1).max(200);
export const summaryOutputSchema = z.strictObject({
	summary: z.strictObject({
		text: z.string().max(4000),
		claims: z
			.array(
				z.strictObject({
					id: summaryId,
					text: z.string().trim().min(1).max(4000),
					evidenceIds: z.array(summaryId).min(1).max(50),
					kind: z.literal("fact"),
				}),
			)
			.max(20),
	}),
	questions: z
		.array(
			z.strictObject({
				id: summaryId,
				prompt: z.string().trim().min(1).max(600),
				evidenceIds: z.array(summaryId).max(50),
			}),
		)
		.max(5),
	notes: z.array(z.string().trim().min(1).max(600)).max(5),
});
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

const tailoringId = z.string().trim().min(1).max(200);
const tailoringText = z
	.string()
	.trim()
	.min(1)
	.max(4000)
	.refine((s) => !/<[^>]*>/u.test(s), "Plain tailoringText required");
const tailoringEvidenceids = z
	.array(tailoringId)
	.min(1)
	.max(50)
	.refine((ids) => new Set(ids).size === ids.length);
const tailoringClaimfields = {
	id: tailoringId,
	text: tailoringText,
	evidenceIds: tailoringEvidenceids,
	kind: z.literal("fact"),
};
const tailoringClaimschema = z.union([
	z.strictObject(tailoringClaimfields),
	z.strictObject({ ...tailoringClaimfields, jobSpanIds: tailoringEvidenceids }),
]);
const tailoringFieldaddress = {
	sectionId: proposalTargetSchema.shape.sectionId,
	itemId: proposalTargetSchema.shape.itemId.unwrap().nullable(),
	roleId: proposalTargetSchema.shape.roleId.unwrap().nullable(),
	field: proposalTargetSchema.shape.field,
};
const tailoringOrderschema = z.strictObject({
	sectionId: proposalTargetSchema.shape.sectionId,
	itemIds: z.array(tailoringId).max(100),
});
export const tailoringSnapshotSchema = z.strictObject({
	resumeId: tailoringId,
	baseRevision: tailoringId,
	fields: z
		.array(
			z.strictObject({
				...tailoringFieldaddress,
				text: z.string().min(1).max(4000),
				evidenceIds: tailoringEvidenceids,
			}),
		)
		.max(50),
	order: z.array(tailoringOrderschema).max(50),
});
export const tailoringOutputSchema = z.strictObject({
	resumeId: tailoringId,
	baseRevision: tailoringId,
	patches: z
		.array(
			z.strictObject({
				id: tailoringId,
				target: z.strictObject({ resumeId: tailoringId, baseRevision: tailoringId, ...tailoringFieldaddress }),
				before: z.string().max(4000),
				after: tailoringText,
				why: tailoringText,
				evidenceIds: tailoringEvidenceids,
				claims: z.array(tailoringClaimschema).min(1).max(100),
			}),
		)
		.max(50),
	order: z.array(tailoringOrderschema).max(50),
	notes: z.array(tailoringText).max(20),
});
export type TailoringOutput = z.infer<typeof tailoringOutputSchema>;

const translationId = z.string().trim().min(1).max(200);
const translationText = z.string().trim().min(1).max(4000);
const translationDirection = z.enum(["ar-en", "en-ar"]);
export const translationOutputSchema = z.strictObject({
	direction: translationDirection,
	sourceRevision: translationId,
	segments: z
		.array(
			z.strictObject({
				sourceId: translationId,
				text: translationText,
				claims: z
					.array(
						z.strictObject({
							id: translationId,
							text: translationText,
							evidenceIds: z.array(translationId).min(1).max(50),
							kind: z.literal("translation"),
						}),
					)
					.max(50),
			}),
		)
		.max(49),
	notes: z.array(translationText).max(5),
});
export type TranslationOutput = z.infer<typeof translationOutputSchema>;
