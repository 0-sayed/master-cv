import { z } from "zod";

const identifier = z.string().trim().min(1).max(200);
const claimFields = {
	id: identifier,
	text: z.string().trim().min(1).max(2000),
	evidenceIds: z.array(identifier).min(1).max(50),
	kind: z.literal("fact"),
};
const claimSchema = z.union([
	z.strictObject(claimFields),
	z.strictObject({ ...claimFields, jobSpanIds: z.array(identifier).min(1).max(50) }),
]);
export const coverLetterOutputSchema = z.strictObject({
	paragraphs: z
		.array(
			z.strictObject({
				text: z.string().trim().min(1).max(8000),
				claims: z.array(claimSchema).max(30),
			}),
		)
		.min(1)
		.max(4),
	notes: z.array(z.string().trim().min(1).max(600)).max(5),
});
export type CoverLetterOutput = z.infer<typeof coverLetterOutputSchema>;

export const letterGenerationInputSchema = z.strictObject({
	letterId: identifier,
	expectedLetterRevision: z.number().int().positive(),
	resumeId: identifier,
	expectedUpdatedAt: z.iso.datetime(),
	jobId: identifier,
	jobRevision: identifier,
	expectedSelectionRevision: z.iso.datetime(),
	documentLocale: z.enum(["ar-SA", "en-US"]),
	length: z.enum(["short", "normal"]),
});
export type LetterGenerationInput = z.infer<typeof letterGenerationInputSchema>;

export const letterReviewDecisionInputSchema = z.strictObject({
	letterId: identifier,
	operationId: identifier,
	expectedRevision: z.number().int().positive(),
	decision: z.enum(["accept", "reject"]),
	requestKey: identifier,
});
export type LetterReviewDecisionInput = z.infer<typeof letterReviewDecisionInputSchema>;
