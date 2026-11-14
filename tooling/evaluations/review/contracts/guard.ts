import type { Claim, CvFact, GuardPolicy, GuardResult, TaskCase } from "./types";
import {
	assertHardFacts,
	factualEvidence,
	HARD_FACTS_VERSION,
	normalizeFact,
	unsupportedEvidenceClaims,
} from "@reactive-resume/api/features/ai/hard-facts";

export const tasksGuardVersion = `tasks-guard-v3-cited-duty-bridge:${HARD_FACTS_VERSION}`;
/** Authored glossary only; its source must occur in the cited CV evidence. Never use job text as a glossary. */
export type TranslationEntityAlias = { source: string; target: string };

const toolAliases: TranslationEntityAlias[] = [
	{ source: "excel", target: "Excel" },
	{ source: "sap", target: "SAP" },
	{ source: "إكسل", target: "Excel" },
	{ source: "اكسيل", target: "Excel" },
	{ source: "إكسيل", target: "Excel" },
	{ source: "ساب", target: "SAP" },
];
const tokens = (text: string) =>
	normalizeFact(text).match(/[\p{L}\p{N}_]+(?:[./+:#-][\p{L}\p{N}_]+)*(?:\+{1,2}|#)?/gu) ?? [];
const contains = (text: string, value: string) => {
	const haystack = tokens(text);
	const needle = tokens(value);
	return needle.length > 0 && haystack.some((_, i) => needle.every((token, j) => haystack[i + j] === token));
};
function replaceEntity(text: string, source: string, target: string): string {
	const escaped = normalizeFact(source).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"), () => target);
}
function canonical(text: string, aliases: readonly TranslationEntityAlias[] = toolAliases): string {
	const normalized = text
		.replace(/[\u0660-\u0669\u06F0-\u06F9]+/gu, normalizeFact)
		.normalize("NFKC")
		.replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
		.replace(/[أإآٱ]/gu, "ا")
		// An application's basis is not a singular completed work request (طلب).
		.replace(/(?<!\p{L})(اساس)\s+هذا\s+الطلب(?!\p{L})/gu, "$1 طلبي")
		// Relative ما before a nominal predicate and embedded "what my role was"
		// are not negative assertions. Only disambiguate that particle; all entities,
		// quantities, responsibility and CV-only citation checks still apply.
		.replace(/(?<!\p{L})ما(?=\s+[^.!?؟،,;؛\n]+?\s+(?:هو|هي)\s)/gu, "الذي")
		.replace(/(?<!\p{L})([وف]?)ما(?=\s+كان\s+[\p{Script=Arabic}]+ي\s+في(?:ه|ها)(?!\p{L}))/gu, "$1الذي")
		// Finite forms of تولّى share the jussive يتولّ (لم يتولّ). This is
		// grammatical normalization, not permission to strengthen responsibility.
		.replace(/(?<!\p{L})([وف]?)(?:تولى|توليت|تولت|تتول)(?!\p{L})/gu, "$1يتول");
	return aliases.reduce((value, alias) => replaceEntity(value, alias.source, alias.target), normalized);
}
/** Language-independent literals only. Meaning, responsibility and translated prose require the tasks verifier. */
function translationEntities(text: string): string[] {
	const normalized = normalizeFact(canonical(text));
	return [
		...(normalized.match(/[+-]?\d+(?:[.,:/-]\d+)*(?:\s*[%٪])?/gu) ?? []),
		...(normalized.match(/\[[a-z]+_\d+\]|__[a-z]+_\d+__/gu) ?? []),
		...tokens(normalized).filter((token) => /[._/+:#]/u.test(token) && /\p{L}/u.test(token)),
		...(normalized.match(
			/(?<!\p{L})(?:excel|sap|oracle|powerbi|tableau|workday|salesforce|jira|docker|kubernetes|github|gitlab|postgresql)(?!\p{L})/gu,
		) ?? []),
		...(normalized.match(/(?<!\p{L})(?:ه|هجري|هجرية|hijri|ah)(?!\p{L})/gu) ?? []).map(() => "calendar:hijri"),
		...(normalized.match(/(?<!\p{L})(?:ميلادي|ميلادية|gregorian|ad)(?!\p{L})/gu) ?? []).map(() => "calendar:gregorian"),
	];
}
function assertTranslationEntities(
	facts: readonly CvFact[],
	after: string,
	retain: boolean,
	aliases: readonly TranslationEntityAlias[],
): void {
	const before = facts.map((fact) => factualEvidence(fact.text)).join("\n");
	// Glossaries translate supplied entities; unrelated entries cannot authorize a new one.
	const suppliedAliases = aliases.filter((alias) => contains(before, alias.source));
	const sourceEntities = translationEntities(before);
	const proposedEntities = translationEntities(after);
	if (proposedEntities.some((entity) => !sourceEntities.includes(entity))) throw new Error("AI_UNSUPPORTED_CLAIM");
	if (retain && sourceEntities.some((entity) => !proposedEntities.includes(entity))) throw new Error("AI_LOST_FACT");
	for (const fact of facts)
		for (const entity of fact.protected ?? []) {
			if (!contains(factualEvidence(fact.text), entity.text)) throw new Error("AI_INVALID_EVIDENCE");
			const alternatives = [
				entity.text,
				...suppliedAliases
					.filter((alias) => contains(entity.text, alias.source) && contains(alias.source, entity.text))
					.map((alias) => alias.target),
			];
			if (retain && !alternatives.some((value) => contains(canonical(after), canonical(value))))
				throw new Error("AI_LOST_FACT");
		}
}

/**
 * Only these non-assertive bridge grammars separate a job-duty reference from candidate evidence.
 * Arbitrary prose, including possessive skill claims, still goes through the CV-only guard.
 * The English pairs are authored grammatical equivalents, not aliases learned from job text.
 */
function candidateText(c: TaskCase, claim: Claim): string {
	const match = claim.text.match(
		/^(?:This experience relates to the ([^.!?؟\n]+) duties described in your posting\.|وترتبط هذه الخبرة بمهام ([^.!?؟\n]+) الواردة في إعلانكم\.)$/u,
	);
	if (!match && claim.jobSpanIds === undefined) return claim.text;
	if (!match || (c.category !== "cover-letter" && c.category !== "tailoring") || claim.kind !== "fact")
		throw new Error("AI_UNSUPPORTED_CLAIM");
	const ids = claim.jobSpanIds;
	if (!ids?.length || new Set(ids).size !== ids.length) throw new Error("AI_INVALID_EVIDENCE");
	const spans = ids.map((id) => {
		const matches = c.jobAd?.segments.filter((span) => span.id === id) ?? [];
		const span = matches[0];
		if (matches.length !== 1 || !span || c.cv.some((fact) => fact.id === id)) throw new Error("AI_INVALID_EVIDENCE");
		return factualEvidence(span.text);
	});
	const duty = match[1] ?? match[2] ?? "";
	// The duty slot is a reference, not a place to embed a relative candidate assertion.
	if (
		/\b(?:i|me|my|mine|we|our|ours|candidate|applicant|who|which|that)\b|(?:خبرتي|مهاراتي|مسؤولياتي|انا|أنا|نحن|لدي|عندي|التي|الذي|الذين)/iu.test(
			duty,
		)
	)
		throw new Error("AI_UNSUPPORTED_CLAIM");
	const wording = (text: string) =>
		canonical(text)
			.replace(/\brecord organisation\b/giu, "organize records")
			.replace(/\brequest follow-up\b/giu, "follow up requests");
	if (!spans.some((span) => contains(wording(span), wording(duty)))) throw new Error("AI_UNSUPPORTED_CLAIM");
	// Job wording is removed from the candidate check, never added to its evidence.
	return match[1] ? "This experience." : "هذه الخبرة.";
}

/** Deterministic pre-verifier gate. Candidate claims cite CV ids only; verifier owns relational semantics. */
export function guardTaskClaims(
	c: TaskCase,
	claims: readonly Claim[],
	policy: GuardPolicy,
	translationAliases: readonly TranslationEntityAlias[] = [],
): GuardResult {
	const details: string[] = [];
	let firstError: string | null = null;
	const failed = (id: string, error: unknown) => {
		const message = error instanceof Error ? error.message : "AI_GUARD_FAILED";
		firstError ??= message;
		details.push(`${id}:${message}`);
	};
	if (
		(!policy.subsetEntities && policy.entityChecker !== "translation") ||
		(policy.subsetEntities && policy.entityChecker === "translation")
	)
		return { pass: false, error: "AI_INVALID_GUARD_POLICY", details: ["AI_INVALID_GUARD_POLICY"] };
	const cited = new Map<string, CvFact>();
	const candidateTexts: string[] = [];
	for (const claim of claims) {
		try {
			if (!claim.evidenceIds.length) throw new Error("AI_INVALID_EVIDENCE");
			const facts = claim.evidenceIds.map((id) => {
				const matching = c.cv.filter((fact) => fact.id === id);
				const fact = matching[0];
				if (matching.length !== 1 || !fact) throw new Error("AI_INVALID_EVIDENCE");
				return fact;
			});
			for (const fact of facts) cited.set(fact.id, fact);
			const text = candidateText(c, claim);
			candidateTexts.push(text);
			if (policy.entityChecker === "translation") {
				assertTranslationEntities(facts, text, false, translationAliases);
			} else {
				const source = canonical(facts.map((fact) => fact.text).join("\n"));
				const after = canonical(text);
				// Empty before disables only the production guard's retention checks. Check polarity separately.
				if (unsupportedEvidenceClaims(source, after, source).length) throw new Error("AI_UNSUPPORTED_CLAIM");
				assertHardFacts("", after, source);
			}
		} catch (error) {
			failed(claim.id, error);
		}
	}
	if (policy.lostFact && !details.length && claims.length) {
		try {
			const facts = [...cited.values()];
			const after = candidateTexts.join("\n");
			if (policy.entityChecker === "translation") assertTranslationEntities(facts, after, true, translationAliases);
			else {
				const source = canonical(facts.map((fact) => fact.text).join("\n"));
				assertHardFacts(source, canonical(after), source);
			}
		} catch (error) {
			failed("retention", error);
		}
	}
	return { pass: details.length === 0, error: firstError, details };
}
