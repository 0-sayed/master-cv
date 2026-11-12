import { z } from "zod";

const count = z.number().int().nonnegative();
export const resumeCreationKindSchema = z.discriminatedUnion("variantKind", [
	z.strictObject({ variantKind: z.literal("base") }),
	z.strictObject({ variantKind: z.enum(["language", "job"]), baseResumeId: z.string().min(1).max(200) }),
]);
export type ResumeCreationKind = z.infer<typeof resumeCreationKindSchema>;
export const startUsageViewSchema = z.strictObject({
	plan: z.literal("start"),
	operations: z
		.strictObject({ limit: z.literal(5), used: count, reserved: count, remaining: count })
		.refine((v) => v.used + v.reserved + v.remaining === 5),
	baseCvs: z.strictObject({ limit: z.literal(1), used: count }),
});
export type StartUsageView = z.infer<typeof startUsageViewSchema>;
