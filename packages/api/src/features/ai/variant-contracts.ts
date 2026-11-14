import type { ModelPayload } from "./payload";
import type { VariantSnapshot } from "./variant-types";
import {
	jobEvidenceSchema,
	summaryOutputSchema,
	tailoringOutputSchema,
	translationOutputSchema,
} from "@reactive-resume/schema/resume/variant-outputs";
import { variantOperationParameters } from "@reactive-resume/schema/resume/variants";
import prompts from "./variant-prompts.json";

export const variantOperationContracts = {
	"review.job-evidence": {
		category: "job-evidence",
		parameters: variantOperationParameters["review.job-evidence"],
		output: jobEvidenceSchema,
		systemPrompt: prompts["job-evidence"],
		promptVersion: "job-evidence-v3-source-boundary",
		schemaVersion: "job-evidence-v2",
	},
	"review.tailoring": {
		category: "tailoring",
		parameters: variantOperationParameters["review.tailoring"],
		output: tailoringOutputSchema,
		systemPrompt: prompts.tailoring,
		promptVersion: "tailoring-v3-source-boundary",
		schemaVersion: "tailoring-v2",
	},
	"review.translation": {
		category: "translation",
		parameters: variantOperationParameters["review.translation"],
		output: translationOutputSchema,
		systemPrompt: prompts.translation,
		promptVersion: "translation-v3-source-boundary",
		schemaVersion: "translation-v2",
	},
	"review.summary": {
		category: "summary",
		parameters: variantOperationParameters["review.summary"],
		output: summaryOutputSchema,
		systemPrompt: prompts.summary,
		promptVersion: "summary-v3-source-boundary",
		schemaVersion: "summary-v2",
	},
} as const;

/** Snapshot prose is minimized before this boundary; structural identifiers are never redacted. */
export function buildVariantWriterPayload(snapshot: VariantSnapshot): ModelPayload {
	if (snapshot.cv.length > 49 || snapshot.cv.some((fact) => fact.text.length > 4000)) throw new Error("AI_INPUT_LIMIT");
	const { cv, jobAd, ...task } = snapshot;
	const payload: ModelPayload = {
		selections: [
			{ id: "variant-task", kind: "user_supplied", section: "summary", text: JSON.stringify(task) },
			{ id: "variant-cv-evidence", kind: "confirmed_content", section: "summary", text: JSON.stringify(cv) },
			{
				id: "variant-job-context",
				kind: "user_supplied",
				section: "summary",
				text: JSON.stringify({ trust: "untrusted", segments: jobAd?.segments ?? [] }),
			},
		],
	};
	if ([...JSON.stringify(payload)].length > 32000) throw new Error("AI_INPUT_LIMIT");
	return payload;
}
