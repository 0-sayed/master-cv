import { z } from "zod";
import { canonicalVerifierVerdict } from "../../verifier-protocol";

const identifier = z.string().min(1).max(500);
const reason = z.string().trim().min(1).max(600);
export const mqmErrorsSchema = z
	.array(
		z.strictObject({
			sourceId: identifier,
			start: z.number().int().min(0),
			end: z.number().int().min(1),
			severity: z.enum(["major", "minor"]),
			category: z.enum(["accuracy", "fluency", "terminology", "locale", "style"]),
		}),
	)
	.max(50);

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
		mqm: mqmErrorsSchema.nullable().default(null),
	}),
});
export const tasksVerifierWireSchema = tasksVerifierSchema.extend({
	quality: tasksVerifierSchema.shape.quality.extend({ mqm: mqmErrorsSchema.nullable() }),
});
export type TasksVerification = z.infer<typeof tasksVerifierSchema>;

export function productionVerdict(raw: unknown): unknown {
	if (!raw || typeof raw !== "object" || !("quality" in raw)) return raw;
	const value = raw as { quality: Record<string, unknown> };
	const { mqm: _mqm, ...quality } = value.quality;
	return { ...canonicalVerifierVerdict(raw), quality };
}

export function translationQualityFault(output: Record<string, unknown>, raw: unknown): string | null {
	const parsed = tasksVerifierSchema.safeParse(raw);
	if (!parsed.success) return "VERIFIER_MQM_REQUIRED";
	let errors = parsed.data.quality.mqm;
	if (!errors) {
		try {
			errors = mqmErrorsSchema.parse(JSON.parse(parsed.data.quality.reason).mqm);
		} catch {
			return "VERIFIER_MQM_REQUIRED";
		}
	}
	const segments = output.segments as { sourceId: string; text: string }[];
	if (
		new Set(errors.map((e) => JSON.stringify(e))).size !== errors.length ||
		errors.some((e) => {
			const segment = segments.find((s) => s.sourceId === e.sourceId);
			return !segment || e.start >= e.end || e.end > segment.text.length;
		})
	)
		return "VERIFIER_MQM_INVALID";
	return null;
}
