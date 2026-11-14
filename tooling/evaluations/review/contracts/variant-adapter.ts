import type { TaskCase, TaskContract } from "./types";
import type { VariantSnapshot } from "@reactive-resume/api/features/ai/variant-types";
import {
	variantOperationContracts,
	buildVariantWriterPayload,
} from "@reactive-resume/api/features/ai/variant-contracts";
import { minimizedVariantText, validateVariantOutput } from "@reactive-resume/api/features/ai/variant-validation";
import {
	assertVariantVerification,
	variantVerificationInventory,
} from "@reactive-resume/api/features/ai/variant-verifier";

function isVariantCategory(category: string): category is VariantSnapshot["category"] {
	return Object.hasOwn(variantOperationContracts, `review.${category}`);
}
/** Fixture source IDs are explicit synthetic source state, never inferred from gold or verdicts. */
export function variantSnapshot(c: TaskCase): VariantSnapshot {
	if (!isVariantCategory(c.category)) throw new Error("VARIANT_CATEGORY_REQUIRED");
	const input = c as TaskCase &
		Pick<VariantSnapshot, "variant" | "direction" | "translationAliases"> & { sourceRevision?: string };
	if (c.category === "tailoring" && !input.variant) throw new Error("TAILORING_VARIANT_REQUIRED");
	if (c.category === "translation" && (!input.direction || !input.sourceRevision))
		throw new Error("TRANSLATION_CONTEXT_REQUIRED");
	const names = [
		...new Set(c.cv.flatMap((f) => f.protected?.filter((p) => p.kind === "name").map((p) => p.text) ?? [])),
	].sort((a, b) => b.length - a.length || a.localeCompare(b));
	const minimize = (text: string) =>
		minimizedVariantText(names.reduce((text, name, index) => text.replaceAll(name, `[NAME_${index + 1}]`), text));
	const variant = input.variant
		? {
				...input.variant,
				fields: input.variant.fields.map((field) => ({
					...field,
					text: field.text.replace(
						/^(\s*)([\s\S]*?)(\s*)$/u,
						(_, leading: string, body: string, trailing: string) => leading + minimize(body) + trailing,
					),
				})),
			}
		: undefined;
	return {
		category: c.category,
		resumeId: variant?.resumeId ?? `synthetic-${c.id}`,
		sourceRevision: variant?.baseRevision ?? input.sourceRevision ?? "synthetic-v1",
		cv: c.cv.map(({ id, section, text }) => ({ id, section, text: minimize(text) })),
		jobAd: c.jobAd ? { segments: c.jobAd.segments.map((span) => ({ ...span, text: minimize(span.text) })) } : null,
		...(variant ? { variant } : {}),
		...(input.direction ? { direction: input.direction } : {}),
		...(input.translationAliases ? { translationAliases: input.translationAliases } : {}),
	};
}
export function alignVariantContract<O>(historical: TaskContract<TaskCase, O>): TaskContract<TaskCase, O> {
	if (!isVariantCategory(historical.category)) throw new Error("VARIANT_CATEGORY_REQUIRED");
	const contract = variantOperationContracts[`review.${historical.category}`];
	return {
		...historical,
		promptVersion: contract.promptVersion,
		schemaVersion: contract.schemaVersion,
		systemPrompt: contract.systemPrompt,
		buildInput: (c) => buildVariantWriterPayload(variantSnapshot(c)),
		claims: (c, output) => variantVerificationInventory(variantSnapshot(c), output).claims,
		score: (c, output, verdict) => {
			const previous = historical.score(c, output, verdict);
			try {
				validateVariantOutput(variantSnapshot(c), output);
				if (verdict !== null) assertVariantVerification(variantSnapshot(c), output, verdict);
				// Job assessment rules supplement the production validator's evidence checks.
				if (historical.category === "job-evidence") return previous;
				return { ...previous, safetyDeterministic: { pass: true, reasons: [] }, unsupportedClaims: [], lostFacts: [] };
			} catch (error) {
				const reason = error instanceof Error ? error.message : "AI_INVALID_RESULT";
				return { ...previous, safetyDeterministic: { pass: false, reasons: [reason] }, unsupportedClaims: [reason] };
			}
		},
	};
}
