import type { ReviewEvidence, ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { unsupportedEvidenceClaims } from "@reactive-resume/api/features/ai/hard-facts";
import { blockText } from "@reactive-resume/resume/proposals";

/** Labels belong to the synthetic fixture author. This scorer does not infer general semantic truth. */
export type ReviewCase = {
	id: string;
	language: "ar" | "en" | "mixed";
	input: string;
	sources: ReviewEvidence[];
	supportedClaims: string[];
	forbiddenClaims: string[];
	forbiddenPatterns?: string[];
	requiredFacts: string[];
	factAlternatives?: Record<string, string[]>;
	unknownFields: { section: string; entityId: string; field: string }[];
	citations: { subjectId: string; allowedEvidenceIds: string[] }[];
};
export type ReviewCaseScore = {
	caseId: string;
	unsupportedClaims: string[];
	invalidEvidenceIds: string[];
	lostFacts: string[];
	unresolvedUnknowns: string[];
};
export type ReviewRun = {
	caseId: string;
	result: ReviewResult;
	score: ReviewCaseScore;
	runIndex: number;
	inputDigest: string;
	sourceDigest: string;
	language: ReviewCase["language"];
	promptVersion: string;
	schemaVersion: string;
	modelVersion: string;
	routeVersion: string;
	latencyMs: number;
	calls: number;
	costMicros: number;
	humanRubric: { factual: boolean; useful: boolean; correctionCount: number; reviewer: string } | null;
};
export type ReviewEvaluationSummary = {
	runs: number;
	cases: number;
	disagreement: { caseId: string; distinctOutputs: number }[];
	unsupportedClaims: number;
	citationErrors: number;
	incompleteHumanReview: number;
	calls: number;
	costMicros: number;
	latencyMs: number;
};
const canonical = (value: unknown): string =>
	JSON.stringify(value, (_key, entry: unknown) =>
		entry && typeof entry === "object" && !Array.isArray(entry)
			? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
			: entry,
	);
const normalizeLabel = (text: string) =>
	text
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[٠-٩۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)))
		.replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
		.replace(/[أإآٱ]/gu, "ا")
		.replace(/\s+/gu, " ");
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const factTokens = (text: string) => {
	const normalized = normalizeLabel(text)
		.replace(/[ىی]/gu, "ي")
		.replace(/ک/gu, "ك")
		.replace(/ة/gu, "ه")
		// A month name plus year is an explicit date, not a semantic paraphrase.
		.replace(
			/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{4})\b/gu,
			(_match, month: string, year: string) =>
				`${year}-${String(months.indexOf(month.slice(0, 3)) + 1).padStart(2, "0")}`,
		);
	// Separate attached year markers (1443هـ), but never split arbitrary words.
	return (normalized.match(/\p{L}+|\p{N}+/gu) ?? []).map((w) =>
		/\p{Script=Arabic}/u.test(w) ? w : w.replace(/ies$/u, "y").replace(/s$/u, ""),
	);
};
const withoutArticle = (word: string) => word.replace(/^(?:[وفبلك]?ال|لل)(?=.{2})/u, "");
function matchesToken(actual: string | undefined, wanted: string): boolean {
	if (actual === undefined) return false;
	if (actual === wanted) return true;
	// Negators remain mandatory whole tokens; only conjunctions may attach to them.
	if (["لم", "لا", "ما", "not", "never", "no"].includes(wanted))
		return actual === `و${wanted}` || actual === `ف${wanted}`;
	const core = withoutArticle(wanted);
	const conjunction = actual.replace(/^[وف]/u, "");
	const forms = [actual, conjunction, actual.replace(/^[بلك]/u, ""), conjunction.replace(/^[بلك]/u, "")];
	return forms.some((form) => form === core || withoutArticle(form) === core);
}
export function factPosition(text: string, fact: string): number {
	const actual = factTokens(text);
	const wanted = factTokens(fact);
	return wanted.length ? actual.findIndex((_, i) => wanted.every((word, j) => matchesToken(actual[i + j], word))) : -1;
}
function matchesFact(text: string, fact: string): boolean {
	return factPosition(text, fact) >= 0;
}
function reviewText(actual: ReviewResult): string {
	return actual.kind === "wording"
		? actual.proposals.map((proposal) => blockText(proposal.after)).join("\n")
		: actual.candidates
				.map(
					(candidate) =>
						(typeof candidate.value === "string" ? candidate.value : JSON.stringify(candidate.value)) +
						(candidate.rawDateText ?? ""),
				)
				.join("\n");
}
export function lexicalLostFacts(
	expected: Pick<ReviewCase, "requiredFacts" | "factAlternatives">,
	actual: ReviewResult,
): string[] {
	const subjects = actual.kind === "wording" ? actual.proposals : actual.candidates;
	const text = reviewText(actual);
	return (subjects.some((s) => !("value" in s) || s.value !== null) ? expected.requiredFacts : []).filter(
		(claim) => ![claim, ...(expected.factAlternatives?.[claim] ?? [])].some((fact) => matchesFact(text, fact)),
	);
}
export function scoreReviewCase(expected: ReviewCase, actual: ReviewResult): ReviewCaseScore {
	const subjects = actual.kind === "wording" ? actual.proposals : actual.candidates;
	const text = reviewText(actual);
	const sources = new Map(expected.sources.map((source) => [source.id, source]));
	const invalid = new Set<string>();
	for (const evidence of actual.evidence)
		if (canonical(evidence) !== canonical(sources.get(evidence.id))) invalid.add(evidence.id);
	for (const subject of [...subjects, ...actual.questions]) {
		const label = expected.citations.find((citation) => citation.subjectId === subject.id);
		for (const id of subject.evidenceIds)
			if (!sources.has(id) || (label && !label.allowedEvidenceIds.includes(id))) invalid.add(id);
	}
	return {
		caseId: expected.id,
		unsupportedClaims: [
			...unsupportedEvidenceClaims(expected.input, text, expected.sources.map((s) => s.quote).join("\n")).filter(
				(diagnostic) => diagnostic !== "unverified-negation",
			),
			...expected.forbiddenClaims.filter((claim) => matchesFact(text, claim)),
			...(expected.forbiddenPatterns ?? [])
				.filter((pattern) => new RegExp(pattern, "iu").test(normalizeLabel(text)))
				.map((pattern) => `pattern:${pattern}`),
		],
		invalidEvidenceIds: [...invalid],
		lostFacts: lexicalLostFacts(expected, actual),
		unresolvedUnknowns: expected.unknownFields
			.filter(
				(unknown) =>
					actual.kind !== "extraction" ||
					!actual.candidates.some(
						(candidate) =>
							candidate.section === unknown.section &&
							candidate.entityId === unknown.entityId &&
							candidate.field === unknown.field &&
							candidate.value !== null,
					),
			)
			.map((unknown) => `${unknown.section}:${unknown.entityId}:${unknown.field}`),
	};
}
export function summarizeReviewRuns(runs: readonly ReviewRun[]): ReviewEvaluationSummary {
	const byCase = new Map<string, { caseId: string; outputs: Set<string> }>();
	for (const run of runs) {
		const key = canonical([run.caseId, run.inputDigest, run.sourceDigest]);
		const group = byCase.get(key) ?? { caseId: run.caseId, outputs: new Set<string>() };
		group.outputs.add(canonical(run.result));
		byCase.set(key, group);
	}
	return {
		runs: runs.length,
		cases: new Set(runs.map((run) => run.caseId)).size,
		disagreement: [...byCase.values()]
			.filter(({ outputs }) => outputs.size > 1)
			.map(({ caseId, outputs }) => ({ caseId, distinctOutputs: outputs.size })),
		unsupportedClaims: runs.reduce((sum, run) => sum + run.score.unsupportedClaims.length, 0),
		citationErrors: runs.reduce((sum, run) => sum + run.score.invalidEvidenceIds.length, 0),
		incompleteHumanReview: runs.filter((run) => run.humanRubric === null).length,
		calls: runs.reduce((sum, run) => sum + run.calls, 0),
		costMicros: runs.reduce((sum, run) => sum + run.costMicros, 0),
		latencyMs: runs.reduce((sum, run) => sum + run.latencyMs, 0),
	};
}
