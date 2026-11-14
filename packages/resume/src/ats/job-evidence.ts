import type { JobSpan, JobTermAnalysisInput, JobTermReport } from "@reactive-resume/schema/job-evidence";
import type { ProposalTarget } from "@reactive-resume/schema/resume/ai-review";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { jobTermAnalysisInputSchema } from "@reactive-resume/schema/job-evidence";
import { decodeHtmlEntities } from "@reactive-resume/utils/string";
import { surfaceFormsOf } from "../ats-pdf/jd/aliases";
import { matchJobDescription } from "../ats-pdf/jd/match";
import { MAX_NGRAM_LENGTH } from "../ats-pdf/jd/ngrams";
import { stemFreeText } from "../ats-pdf/jd/stem";
import { matchingWindows } from "../ats-pdf/jd/tokenize";
import { hashReviewTarget } from "../review-evidence";
import { isRenderedSection, walkSections } from "./walk";

export const JOB_NORMALIZATION_VERSION = "matching-v2";
export const JOB_RUBRIC_VERSION = "literal-v1";
const TERM_LIMIT = 35;
const plain = (value: string) => decodeHtmlEntities(value.replace(/<[^>]*>/gu, " ")).trim();

export function analyzeJobTerms(raw: JobTermAnalysisInput): JobTermReport {
	const input = jobTermAnalysisInputSchema.parse(raw);
	if (
		input.identity.normalizationVersion !== JOB_NORMALIZATION_VERSION ||
		input.identity.rubricVersion !== JOB_RUBRIC_VERSION
	)
		throw new Error("JOB_POLICY_CHANGED");
	const resumeText = input.passages.map((passage) => passage.text).join("\n");
	const options = { jobDescription: input.jobText, resumeText };
	const report = matchJobDescription(options);
	const all = matchJobDescription({ ...options, maxTerms: Number.MAX_SAFE_INTEGER });
	const jobWindows = matchingWindows(input.jobText, MAX_NGRAM_LENGTH);
	const cvWindows = input.passages.map((passage) => ({
		passage,
		windows: matchingWindows(passage.text, MAX_NGRAM_LENGTH),
	}));
	const terms = report.terms.map((term, index) => {
		const forms = new Set(surfaceFormsOf(term.term));
		const stem = term.term.split(" ").map(stemFreeText).join(" ");
		const matches = (value: string) => forms.has(value) || value.split(" ").map(stemFreeText).join(" ") === stem;
		const spans = (windows: typeof jobWindows, prefix: string): JobSpan[] =>
			windows
				.filter((window) => matches(window.text))
				.map((window, n) => ({
					id: `${prefix}-${index}-${n}`,
					start: window.start,
					end: window.end,
					quote: window.quote,
				}));
		const jobSpans = spans(jobWindows, "job");
		const cvSpans = cvWindows.flatMap(({ passage, windows }) =>
			spans(windows, passage.id).map((span) => ({ ...span, passageId: passage.id, target: passage.target })),
		);
		return {
			term: term.term,
			matched: term.resumeCount > 0,
			surfaceForms: [...new Set(jobSpans.map((span) => span.quote))],
			jobSpans,
			cvSpans,
		};
	});
	const excludedTerms = all.terms
		.filter((term) => !terms.some((selected) => selected.term === term.term))
		.map((term) => term.term);
	return {
		identity: input.identity,
		state: !input.jobText.trim() ? "not-checked" : !terms.length ? "not-checkable" : "complete",
		denominator: terms.length,
		matchedCount: report.matchedCount,
		unmatchedCount: terms.length - report.matchedCount,
		terms,
		selection: { limit: TERM_LIMIT, truncated: excludedTerms.length > 0 },
		excludedTerms,
		exclusions: [
			"text-occurrence-not-ability",
			"hidden-terms-affect-presentation-only",
			...(excludedTerms.length ? ["ranked-selection-not-all-requirements"] : []),
			...(terms.some((term) => !term.jobSpans.length || (term.matched && !term.cvSpans.length))
				? ["source-span-unavailable"]
				: []),
		],
	};
}

/** Visible field inventory only: never contacts, links, references or hidden/unplaced content. */
export function buildJobPassages(data: ResumeData): JobTermAnalysisInput["passages"] {
	const passages: JobTermAnalysisInput["passages"] = [];
	const add = (target: ProposalTarget, value: unknown) => {
		if (typeof value !== "string") return;
		const text = plain(value);
		if (!text) return;
		passages.push({
			id: `cv-${hashReviewTarget(JSON.stringify([target.sectionId, target.itemId ?? null, target.roleId ?? null, target.field]))}`,
			target,
			text,
		});
	};
	add({ sectionId: "basics", field: "headline" }, data.basics.headline);
	for (const section of walkSections(data).filter(isRenderedSection)) {
		if (["references", "profiles", "cover-letter"].includes(section.type)) continue;
		if (section.id === "summary") {
			add({ sectionId: "summary", field: "content" }, data.summary.content);
			continue;
		}
		for (const item of section.items) {
			const itemId = item.value.id;
			if (typeof itemId !== "string") continue;
			for (const field of [
				"title",
				"name",
				"company",
				"organization",
				"awarder",
				"issuer",
				"publisher",
				"school",
				"degree",
				"area",
				"position",
				"description",
				"language",
				"fluency",
				"proficiency",
			])
				add({ sectionId: section.id, itemId, field }, item.value[field]);
			if (Array.isArray(item.value.keywords))
				add({ sectionId: section.id, itemId, field: "keywords" }, item.value.keywords.join(", "));
			if (Array.isArray(item.value.roles))
				for (const role of item.value.roles) {
					if (!role || typeof role !== "object" || !("id" in role) || typeof role.id !== "string") continue;
					for (const field of ["position", "description"] as const)
						if (field in role) add({ sectionId: section.id, itemId, roleId: role.id, field }, role[field]);
				}
		}
	}
	return passages;
}
