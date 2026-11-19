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
		.strictObject({ limit: count.nullable(), used: count, reserved: count, remaining: count.nullable() })
		.refine((v) =>
			v.limit === null ? v.remaining === null : v.remaining === Math.max(0, v.limit - v.used - v.reserved),
		),
	baseCvs: z.strictObject({ limit: z.literal(1).nullable(), used: count }),
});
export type StartUsageView = z.infer<typeof startUsageViewSchema>;
