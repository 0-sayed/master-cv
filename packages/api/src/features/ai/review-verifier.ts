import type { ModelPayload } from "./payload";
import { z } from "zod";
import { reviewClaimsSchema } from "@reactive-resume/schema/resume/ai-review";
import { claimKinds } from "./hard-facts";
import { buildModelPayload } from "./payload";

export const VERIFIER_VERSION = "t006-verifier-v4";
const identifier = z.string().min(1).max(500);
export const reviewVerifierSchema = z.strictObject({
	schemaVersion: z.literal(3),
	responseAssessment: z.strictObject({
		status: z.enum(["appropriate", "no_change_needed", "inappropriate", "unclear"]),
		reason: z.string().trim().min(1).max(600),
	}),
	factRetention: z.strictObject({
		status: z.enum(["retained", "lost", "unclear", "not_applicable"]),
		evidenceIds: z.array(identifier).max(50),
		reason: z.string().trim().min(1).max(600),
	}),
	verdicts: z
		.array(
			z.strictObject({
				claimId: identifier,
				verdict: z.enum(["supported", "partially", "unsupported", "contradicted"]),
				evidenceIds: z.array(identifier).min(1).max(50),
				reason: z.string().trim().min(1).max(600),
			}),
		)
		.max(200),
});
export type ReviewVerification = z.infer<typeof reviewVerifierSchema>;
export function hasReviewEdits(output: Record<string, unknown>): boolean {
	return (
		(Array.isArray(output.proposals) && output.proposals.length > 0) ||
		(Array.isArray(output.candidates) &&
			output.candidates.some((c) => c && typeof c === "object" && "value" in c && c.value !== null))
	);
}
const claimsInput = z.object({
	proposals: z.array(z.object({ id: identifier, claims: reviewClaimsSchema })).optional(),
	candidates: z
		.array(
			z.object({
				id: identifier,
				section: identifier,
				field: identifier,
				value: z.unknown(),
				rawDateText: z.string().nullable(),
				evidenceIds: z.array(identifier),
			}),
		)
		.optional(),
});
export function verificationClaims(output: Record<string, unknown>) {
	const parsed = claimsInput.parse(output);
	const questions = z
		.array(z.object({ id: identifier, prompt: z.string(), evidenceIds: z.array(identifier) }))
		.parse(output.questions ?? []);
	const claims =
		parsed.proposals?.flatMap((p) =>
			p.claims.map((c) => ({ claimId: `${p.id}/${c.id}`, text: c.text, evidenceIds: c.evidenceIds })),
		) ??
		(parsed.candidates ?? [])
			.filter((c) => c.value !== null)
			.map((c) => ({
				claimId: c.id,
				text: JSON.stringify({ section: c.section, field: c.field, value: c.value, rawDateText: c.rawDateText }),
				evidenceIds: c.evidenceIds,
			}));
	return [
		...claims,
		...questions.map((q) => ({ claimId: `question:${q.id}`, text: q.prompt, evidenceIds: q.evidenceIds })),
	];
}
export function buildVerificationPayload(payload: ModelPayload, output: Record<string, unknown>): ModelPayload {
	const minimize = (text: string) =>
		text.trim()
			? (buildModelPayload({
					selections: [{ id: "response", kind: "model_proposed", section: "summary", text }],
					contactValues: [],
				}).selections[0]?.text ?? "")
			: "";
	const minimizeValue = (value: unknown): unknown => {
		if (typeof value === "string") return minimize(value);
		if (Array.isArray(value)) return value.map(minimizeValue);
		if (value && typeof value === "object")
			return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, minimizeValue(v)]));
		return value;
	};
	const claims = verificationClaims(output).map((c) => {
		const minimized = buildModelPayload({
			selections: [{ id: "claim", kind: "model_proposed", section: "summary", text: c.text }],
			contactValues: [],
		});
		return {
			...c,
			text: minimized.selections[0]?.text ?? "",
			claimKinds: c.claimId.startsWith("question:") ? ["question-premises"] : claimKinds(c.text),
		};
	});
	// Source text was minimized by T005 already. Identifiers are structure, never redact them as phone numbers.
	return {
		selections: [
			...payload.selections.filter((s) => "id" in s && s.id !== "intent"),
			{
				id: "verification-task",
				kind: "model_proposed",
				section: "summary",
				text: JSON.stringify({
					intent: payload.selections.filter((s) => "id" in s && s.id === "intent").map((s) => s.text),
					operation: "candidates" in output ? "extraction" : "wording",
					retentionApplicable: hasReviewEdits(output),
				}),
			},
			{
				id: "verification-response",
				kind: "model_proposed",
				section: "summary",
				text: JSON.stringify({
					proposals: Array.isArray(output.proposals)
						? output.proposals.map((p) => ({
								id: p.id,
								passageId: p.passageId,
								text: minimize(String(p.text ?? "")),
								reason: minimize(String(p.reason ?? "")),
								evidenceIds: p.evidenceIds,
							}))
						: [],
					candidates: Array.isArray(output.candidates)
						? output.candidates.map((c) => ({
								id: c.id,
								entityId: c.entityId,
								section: c.section,
								field: c.field,
								value: minimizeValue(c.value),
								rawDateText: c.rawDateText == null ? c.rawDateText : minimize(String(c.rawDateText)),
								evidenceIds: c.evidenceIds,
							}))
						: [],
					questions: Array.isArray(output.questions)
						? output.questions.map((q) => ({ ...q, prompt: minimize(String(q.prompt)) }))
						: [],
					notes: Array.isArray(output.notes) ? output.notes.map((n) => minimize(String(n))) : [],
				}),
			},
			{ id: "verification-claims", kind: "model_proposed", section: "summary", text: JSON.stringify(claims) },
		],
	};
}
export function assertVerification(output: Record<string, unknown>, raw: unknown): void {
	const result = reviewVerifierSchema.parse(raw);
	const claims = verificationClaims(output);
	// Response appropriateness is advisory quality, never permission to publish facts.
	if (
		result.factRetention.status !== "retained" &&
		(hasReviewEdits(output) || result.factRetention.status !== "not_applicable")
	)
		throw new Error("AI_FACT_RETENTION_FAILED");
	const allowedIds = new Set(claims.flatMap((c) => c.evidenceIds));
	if (result.factRetention.evidenceIds.some((id) => !allowedIds.has(id))) throw new Error("AI_VERIFICATION_CITATION");
	if (
		new Set(claims.map((c) => c.claimId)).size !== claims.length ||
		new Set(result.verdicts.map((v) => v.claimId)).size !== result.verdicts.length ||
		result.verdicts.length !== claims.length
	)
		throw new Error("AI_VERIFICATION_INCOMPLETE");
	for (const c of claims) {
		const v = result.verdicts.find((v) => v.claimId === c.claimId);
		if (!v || v.evidenceIds.some((id) => !c.evidenceIds.includes(id))) throw new Error("AI_VERIFICATION_CITATION");
		// Partial support leaves an unverified portion. Do not publish it as a safe proposal.
		if (v.verdict !== "supported") throw new Error("AI_VERIFICATION_FAILED");
	}
}
