import z from "zod";
import { masterFactInputSchema } from "../career-master";
import { resumeDataSchema } from "./data";
export const importReviewInputSchema = z.strictObject({
	flowId: z.uuid(),
	name: z.string().trim().min(1).max(100),
	data: resumeDataSchema,
	expectedProfileRevision: z.number().int().nonnegative(),
	acceptedFacts: z
		.array(
			z.strictObject({
				fact: masterFactInputSchema,
				decision: z.discriminatedUnion("kind", [
					z.strictObject({ kind: z.literal("new") }),
					z.strictObject({
						kind: z.literal("existing"),
						id: z.string().min(1),
						expectedRevision: z.number().int().positive(),
						expectedDraftRevision: z.number().int().nonnegative(),
					}),
				]),
			}),
		)
		.max(500),
});
export type ImportReviewInput = z.infer<typeof importReviewInputSchema>;
