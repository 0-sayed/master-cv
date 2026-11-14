import { z } from "zod";
import { masterFactInputSchema } from "@reactive-resume/schema/career-master";
import { reviewCandidateSchema, splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { reviewHandlers } from "./production";

// Historical v3 extraction validation, including refinements that JSON Schema
// cannot express. This is audit-only: it never normalizes or accepts an output.
const legacyCandidate = z
	.strictObject({
		...reviewCandidateSchema.shape,
		entityId: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.refine(
				(value) => !["__proto__", "prototype", "constructor"].includes(value) && !/[./\\]/u.test(value),
				"Invalid target identifier",
			),
		field: z.string().trim().min(1).max(200),
		value: z.unknown(),
	})
	.superRefine((candidate, ctx) => {
		const knownField = masterFactInputSchema.options.some(
			(option) => option.shape.section.value === candidate.section && option.shape.field.value === candidate.field,
		);
		const fact = masterFactInputSchema.safeParse({
			section: candidate.section,
			entityId: candidate.entityId,
			field: candidate.field,
			value: candidate.value,
			source: { kind: "manual", id: "", quote: "" },
		});
		if (!knownField || candidate.value === undefined || (candidate.value !== null && !fact.success))
			ctx.addIssue({ code: "custom", message: "Invalid extraction field/value" });
	});
const legacyExtraction = z.strictObject({
	candidates: z.array(legacyCandidate).max(100),
	questions: z
		.array(
			z.strictObject({
				id: z.string().min(1).max(200),
				passageId: z.string().min(1).max(200).nullable(),
				prompt: z
					.string()
					.trim()
					.min(1)
					.max(4000)
					.refine((s) => !/<[^>]*>/u.test(s), "Plain text required"),
				evidenceIds: z.array(z.string().min(1).max(200)).min(1).max(50),
			}),
		)
		.max(20),
});

export function auditInvalidOutput(kind: "wording" | "extraction", text: string, evidenceIds = ["selected"]) {
	let output: unknown;
	try {
		output = JSON.parse(text);
	} catch {
		return {
			issues: [{ path: [] as PropertyKey[], message: "Invalid JSON", code: "parse" }],
			failureClass: "model-error" as const,
		};
	}
	const schema =
		kind === "extraction"
			? legacyExtraction
			: reviewHandlers["review.wording"].output.superRefine((output, ctx) => {
					const proposals = z
						.array(
							z.object({
								claims: z.array(z.object({ text: z.string(), evidenceIds: z.array(z.string()) })),
								evidenceIds: z.array(z.string()),
							}),
						)
						.parse(output.proposals);
					for (const [i, p] of proposals.entries()) {
						if (p.claims.some((c) => splitReviewClaims(c.text, c.evidenceIds).length > 1))
							ctx.addIssue({ code: "custom", path: ["proposals", i], message: "Uncited proposed text" });
						if (
							p.evidenceIds.some((id) => !evidenceIds.includes(id)) ||
							p.claims.some((c) => c.evidenceIds.some((id) => !p.evidenceIds.includes(id) || !evidenceIds.includes(id)))
						)
							ctx.addIssue({ code: "custom", path: ["proposals", i], message: "Unknown claim citation" });
					}
				});
	const parsed = schema.safeParse(output);
	const issues = parsed.success ? [] : parsed.error.issues.map(({ path, message, code }) => ({ path, message, code }));
	if (kind === "extraction")
		return { issues, failureClass: issues.length ? ("prompt-extraction-contract" as const) : ("none" as const) };
	const structure = z
		.object({
			proposals: z.array(
				z.object({
					text: z.string(),
					evidenceIds: z.array(z.string()),
					claims: z.array(z.object({ id: z.string(), text: z.string(), evidenceIds: z.array(z.string()) })),
				}),
			),
		})
		.safeParse(output);
	const boundaryOnly =
		issues.length > 0 &&
		issues.every((i) => i.message === "Uncited proposed text") &&
		structure.success &&
		structure.data.proposals.every(
			(p) =>
				new Set(p.claims.map((c) => c.id)).size === p.claims.length &&
				p.claims
					.map((c) => c.text)
					.join(" ")
					.replace(/\s+/gu, " ")
					.trim() === p.text.replace(/\s+/gu, " ").trim() &&
				p.evidenceIds.every((id) => evidenceIds.includes(id)) &&
				p.claims.every((c) => c.evidenceIds.every((id) => evidenceIds.includes(id) && p.evidenceIds.includes(id))),
		) &&
		structure.data.proposals.some((p) => p.claims.some((c) => splitReviewClaims(c.text, c.evidenceIds).length > 1));
	return {
		issues,
		failureClass: boundaryOnly
			? ("prompt-claim-boundaries" as const)
			: issues.length
				? ("model-error" as const)
				: ("none" as const),
	};
}
