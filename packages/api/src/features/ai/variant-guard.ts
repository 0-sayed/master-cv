import type { Claim, CvFact, GuardPolicy, GuardResult, GuardContext } from "./variant-types";
import {
	assertHardFacts,
	evidenceExplanation,
	factualEvidence,
	HARD_FACTS_VERSION,
	normalizeFact,
	unsupportedEvidenceClaims,
} from "./hard-facts";

export const tasksGuardVersion = `tasks-guard-v5-shared-factual-paraphrases:${HARD_FACTS_VERSION}`;

/** Absence describes the supplied document, never the person's ability. */
export function boundedEvidenceAbsence(text: string): boolean {
	const normalized = normalizeFact(text);
	const scope = /\b(?:(?:this|the|supplied|the supplied)\s+)?(?:cv|resume)\b|(?:هذه\s+)?السيرة(?:\s+الذاتية)?/u;
	const absence =
		/\b(?:is|was)\s+not\s+(?:documented|recorded|shown|used)\b|\bno\s+(?:(?:supporting|matching|relevant)\s+)?evidence\b|\b(?:does\s+not|doesn't)\s+(?:show|provide|contain|document)\b|\bno\b.*\b(?:documented|recorded|shown)\b|لا\s+(?:يوجد|توجد|يظهر|تظهر|تتضمن|تقدم|توثق|تذكر)|لم\s+(?:تذكر|يستخدم|استخدم)/u;
	const inability =
		/\b(?:cannot|can't|unable|unskilled|lacks?)\b|(?:المرشح|المتقدم|انت)\s+(?:لا\s+(?:يجيد|يعرف|يمتلك)|يفتقر)/u;
	return (
		!inability.test(normalized) &&
		normalized.split(/[!?؟\n]/u).some((passage) => scope.test(passage) && absence.test(passage))
	);
}

/** Remove explicit disclaimers only, leaving predictions in every other clause visible. */
export function assessmentText(text: string): string {
	return text
		.split(/(?<=[.;؛!?؟])\s*/u)
		.filter((clause) => {
			const normalized = normalizeFact(clause);
			return !/^(?:لا تتضمن تقديرا لاحتمال التوظيف او نتيجة توظيفية[.!؟]?|(?:this (?:assessment|practice)|these questions) (?:does|do) not (?:estimate|predict) (?:hiring|employment) (?:probability|chances?)[.!]?)$/u.test(
				normalized,
			);
		})
		.join(" ");
}

/** Retention checks candidate assertions after independently validating any cited duty bridge. */
export function assertPatchRetention(
	context: GuardContext,
	before: string,
	claims: readonly Claim[],
	evidence: string,
) {
	assertHardFacts(
		canonical(before),
		canonical(claims.map((claim) => candidateText(context, claim)).join("\n")),
		canonical(evidence),
	);
}
/** Authored glossary only; its source must occur in the cited CV evidence. Never use job text as a glossary. */
export type TranslationEntityAlias = { source: string; target: string };

const toolAliases: TranslationEntityAlias[] = [
	{ source: "excel", target: "Excel" },
	{ source: "sap", target: "SAP" },
	{ source: "word", target: "Word" },
	{ source: "وورد", target: "Word" },
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
		.replace(/(?<!\p{L})(منسق|مساعد|مشرف|مهندس|محاسب|فني|مدير|معلم|ممرض|استشاري|مطور|اخصائي)ا(?!\p{L})/gu, "$1")
		.replace(/(?<!\p{L})و(?=(?:اكسل|اكسيل|ساب|وورد|Word)(?!\p{L}))/gu, "")
		// An application's basis is not a singular completed work request (طلب).
		.replace(/(?<!\p{L})(اساس)\s+هذا\s+الطلب(?!\p{L})/gu, "$1 طلبي")
		// Relative ما before a nominal predicate and embedded "what my role was"
		// are not negative assertions. Only disambiguate that particle; all entities,
		// quantities, responsibility and CV-only citation checks still apply.
		.replace(/(?<!\p{L})ما(?=\s+[^.!?؟،,;؛\n]+?\s+(?:هو|هي)\s)/gu, "الذي")
		.replace(/(?<!\p{L})([وف]?)ما(?=\s+كان\s+[\p{Script=Arabic}]+ي\s+في(?:ه|ها)(?!\p{L}))/gu, "$1الذي")
		.replace(/(?<!\p{L})ما(?=\s+يحتاج(?!\p{L}))/gu, "الذي")
		.replace(
			/((?:ال)?(?:ملاحظات(?:\s+الاجتماع)?|مستندات|وثائق|سجلات))\s+(?:ال)?معتمدة(?!\s+(?:دولي|عالمي|رسمي|مهني))/gu,
			"$1 الموافق عليها",
		)
		// Normalize interval endpoints only when the source explicitly says the role began.
		.replace(/((?:انتقلت|بدات|اصبحت)(?:\s+[^.!?؟\n]+?)?)\s+في\s+(?:عام\s+)?(?=\d{4})/gu, "$1 من ")
		.replace(/\bin\s+(\d{4})(?=,?\s+I\s+(?:became|started|began)\b)/giu, "from $1")
		.replace(/\b(?:through\s+the\s+end\s+of|until\s+the\s+end\s+of|to\s+the\s+end\s+of)\s+(?=\d{4})/giu, "until ")
		.replace(/(?<!\p{L})(من|حتى|الى)\s+(?:نهاية\s+)?(?:عام\s+)?(?=\d{4})/gu, "$1 ")
		.replace(/(?<!\p{L})ومن(?=\s+\d{4})/gu, "من")
		.replace(/(?<!\p{L})بين\s+(?:عامي\s+)?(\d{4})\s+و\s*(?:نهاية\s+)?(\d{4})(?!\d)/gu, "من $1 حتى $2")
		.replace(/\bbetween\s+(\d{4})\s+and\s+(\d{4})\b/giu, "from $1 until $2")
		// Finite forms of تولّى share the jussive يتولّ (لم يتولّ). This is
		// grammatical normalization, not permission to strengthen responsibility.
		.replace(/(?<!\p{L})([وف]?)(?:تولى|توليت|تولت|تتول)(?!\p{L})/gu, "$1يتول");
	return aliases.reduce((value, alias) => replaceEntity(value, alias.source, alias.target), normalized);
}
/** Language-independent literals only. Meaning, responsibility and translated prose require the tasks verifier. */
function translationEntities(text: string): string[] {
	const normalized = normalizeFact(canonical(text.replace(/(?<![\p{L}\p{N}_])و(?=[A-Za-z])/gu, "")));
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
function applicationContext(c: GuardContext, text: string): string {
	if (c.category !== "cover-letter") return text;
	const job = c.jobAd?.segments.map((span) => factualEvidence(span.text)).join("\n") ?? "";
	const target = (role: string, employer: string) => {
		if (!contains(canonical(job), canonical(role)) || !contains(canonical(job), canonical(employer)))
			throw new Error("AI_UNSUPPORTED_CLAIM");
	};
	return text
		.replace(/^I am interested in the (.+?) role at (.+?),\s*/u, (_all, role: string, employer: string) => {
			target(role, employer);
			return "";
		})
		.replace(
			/(?:,?\s+and\s+)?would welcome the opportunity to discuss how this experience relates to the (.+?) position at (.+?)\.$/u,
			(_all, role: string, employer: string) => {
				target(role, employer);
				return ".";
			},
		)
		.replace(
			/^(?:أتقدم|اتقدم) إلى وظيفة (.+?) لدى (.+?)[،,]\s*(?:وأرى|وارى) أن\s*/u,
			(_all, role: string, employer: string) => {
				target(role, employer);
				return "";
			},
		)
		.replace(/^تستفيد وظيفة (.+?) في (.+?) من خبرتي\s+/u, (_all, role: string, employer: string) => {
			target(role, employer);
			return "خبرتي ";
		});
}

function candidateText(c: GuardContext, claim: Claim): string {
	const match = claim.text.match(
		/^(?:This experience relates to the ([^.!?؟\n]+) duties described in your posting\.|وترتبط هذه الخبرة بمهام ([^.!?؟\n]+) الواردة في إعلانكم\.|هذا يرتبط بمهام ([^.!?؟\n]+) المذكورة في إعلانكم\.)$/u,
	);
	if (!match && claim.jobSpanIds === undefined)
		return c.category === "job-evidence" ? evidenceExplanation(claim.text) : applicationContext(c, claim.text);
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
	const duty = match[1] ?? match[2] ?? match[3] ?? "";
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
	c: GuardContext,
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
				const source = facts.map((fact) => canonical(fact.text)).join("\n");
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
				const source = facts.map((fact) => canonical(fact.text)).join("\n");
				assertHardFacts(source, canonical(after), source);
			}
		} catch (error) {
			failed("retention", error);
		}
	}
	return { pass: details.length === 0, error: firstError, details };
}
