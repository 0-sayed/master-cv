import { z } from "zod";

const identifier = z.string().min(1).max(500);
const reason = z.string().trim().min(1).max(600);

/** T007/T008 draft. Required nullable retention keeps the wire schema OpenAI-strict compatible. */
export const tasksVerifierSchema = z.strictObject({
	schemaVersion: z.literal(1),
	verdicts: z
		.array(
			z.strictObject({
				claimId: identifier,
				verdict: z.enum(["supported", "partially", "unsupported", "contradicted"]),
				evidenceIds: z.array(identifier).min(1).max(50),
				reason,
			}),
		)
		.max(200),
	retention: z
		.strictObject({
			status: z.enum(["retained", "lost", "unclear"]),
			evidenceIds: z.array(identifier).min(1).max(50),
			reason,
		})
		.nullable(),
	/** Absence is checked against the whole CV pool, without inventing a positive citation. */
	absence: z
		.array(z.strictObject({ id: identifier, verdict: z.enum(["confirmed_absent", "present", "unclear"]) }))
		.max(200),
	coverage: z.strictObject({ status: z.enum(["complete", "uncovered", "unclear"]), reason }),
	/** One full-question check even when the writer supplies no premises/claims. */
	premises: z
		.array(
			z.strictObject({
				id: identifier,
				verdict: z.enum(["supported", "no_candidate_premise", "unsupported", "contradicted", "unclear"]),
				reason,
			}),
		)
		.max(200),
	quality: z.strictObject({
		status: z.enum(["appropriate", "no_change_needed", "inappropriate", "unclear"]),
		reason,
	}),
});
export type TasksVerification = z.infer<typeof tasksVerifierSchema>;
