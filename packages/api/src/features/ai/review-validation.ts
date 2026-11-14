import type { ReviewSourceSnapshot } from "./review-sources";
import type { ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { blockText, replaceBlockText } from "@reactive-resume/resume/proposals";
import { validateReviewEvidence } from "@reactive-resume/resume/review-evidence";
import { reviewResultSchema } from "@reactive-resume/schema/resume/ai-review";
import { readLegacyDates } from "@reactive-resume/schema/resume/dates";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { assertHardFacts, factualEvidence, normalizeFact } from "./hard-facts";
import { sameReviewSource } from "./review-sources";

const normalize = normalizeFact;

export function validateReviewResult(snapshot: ReviewSourceSnapshot, output: ReviewResult): ReviewResult {
	const result = reviewResultSchema.parse(output);
	if (!sameReviewSource(snapshot.source, result.sourceRevision)) throw new Error("AI_SOURCE_CHANGED");
	const validation = validateReviewEvidence(result, snapshot.evidence);
	if (!validation.ok) throw new Error(`AI_${validation.reason}`);
	const evidence = new Map(snapshot.evidence.map((entry) => [entry.id, entry]));
	const quotesFor = (ids: string[]) => ids.map((id) => evidence.get(id)?.quote ?? "").join(" ");
	if (result.kind === "wording") {
		for (const proposal of result.proposals) {
			const after = blockText(proposal.after);
			if (/<[^>]*>/u.test(after) || proposal.after !== replaceBlockText(proposal.before, after))
				throw new Error("AI_INVALID_MARKUP");
			assertHardFacts(blockText(proposal.before), after, quotesFor(proposal.evidenceIds));
			for (const claim of proposal.claims) {
				if (claim.evidenceIds.some((id) => !proposal.evidenceIds.includes(id))) throw new Error("AI_INVALID_EVIDENCE");
				assertHardFacts(claim.text, claim.text, quotesFor(claim.evidenceIds));
			}
		}
	} else {
		for (const candidate of result.candidates) {
			if (
				candidate.evidenceIds.some(
					(id) =>
						!snapshot.selections.some(
							(selection) =>
								"id" in selection &&
								selection.id === id &&
								selection.kind === "unconfirmed_source" &&
								selection.section === candidate.section,
						),
				)
			)
				throw new Error("AI_SOURCE_BINDING");
			const quote = normalize(factualEvidence(quotesFor(candidate.evidenceIds)));
			if (candidate.rawDateText && !quote.includes(normalize(candidate.rawDateText)))
				throw new Error("AI_UNSUPPORTED_DATE");
			if (candidate.value === null) continue;
			if (typeof candidate.value === "string") {
				if (!quote.includes(normalize(candidate.value)) || /<[^>]*>/u.test(candidate.value))
					throw new Error("AI_UNSUPPORTED_CLAIM");
			} else if (candidate.field === "dates" && typeof candidate.value === "object") {
				if (/(?:هـ|هجري|hijri|summer|winter|تقريب)/iu.test(quote)) throw new Error("AI_AMBIGUOUS_DATE");
				const dates = candidate.value as { start: string | null; end: string | null; present: boolean };
				if (!candidate.rawDateText) throw new Error("AI_UNSUPPORTED_DATE");
				// The parser reads a period, while a literal CV span may start with "from".
				const parsed = readLegacyDates(normalizeNumericDigits(candidate.rawDateText).replace(/^(?:from|من)\s+/iu, ""), {
					locale: /\p{Script=Arabic}/u.test(candidate.rawDateText) ? "ar-SA" : "en-US",
					single: candidate.section === "certifications",
				});
				if (parsed.raw || parsed.start !== dates.start || parsed.end !== dates.end || parsed.present !== dates.present)
					throw new Error("AI_UNSUPPORTED_DATE");
				if (dates.present && !/(?:present|current|حالي|الآن)/iu.test(quote)) throw new Error("AI_UNSUPPORTED_DATE");
			} else throw new Error("AI_UNSUPPORTED_CLAIM");
		}
	}
	return result;
}
