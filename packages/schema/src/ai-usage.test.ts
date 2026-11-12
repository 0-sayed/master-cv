import { expect, it } from "vite-plus/test";
import { startUsageViewSchema, resumeCreationKindSchema } from "./ai-usage";

it("preserves once-only Start limits and consistent available operations", () => {
	const usage = {
		plan: "start",
		operations: { limit: 5, used: 3, reserved: 1, remaining: 1 },
		baseCvs: { limit: 1, used: 2 },
	};
	expect(startUsageViewSchema.parse(usage)).toEqual(usage);
	expect(
		startUsageViewSchema.safeParse({ ...usage, operations: { limit: 5, used: 5, reserved: 1, remaining: 0 } }).success,
	).toBe(false);
	expect(resumeCreationKindSchema.safeParse({ variantKind: "language" }).success).toBe(false);
	expect(resumeCreationKindSchema.parse({ variantKind: "job", baseResumeId: "root" })).toEqual({
		variantKind: "job",
		baseResumeId: "root",
	});
});
