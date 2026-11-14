import type { ReviewEvidence, ReviewProposal, ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { proposalTargetSchema, reviewProposalSchema } from "@reactive-resume/schema/resume/ai-review";
import { parseResumeDataForWrite } from "@reactive-resume/schema/resume/write";
import { applyTo, blockText, canApplyTo, readTarget, replaceBlockText, writeTarget } from "./proposals";

/** An optimistic field fingerprint, never an authorization or evidence authenticity check. */
export function hashReviewTarget(value: string): string {
	let hash = 0xcbf29ce484222325n;
	for (const character of value) {
		hash ^= BigInt(character.codePointAt(0) ?? 0);
		hash = BigInt.asUintN(64, hash * 0x100000001b3n);
	}
	return `${value.length}:${hash.toString(16)}`;
}

export type ReviewValidation = { ok: true } | { ok: false; reason: string; proposalIds: string[] };
const sameSource = (a: ReviewEvidence["source"], b: ReviewEvidence["source"]) =>
	a.kind === b.kind && a.id === b.id && a.revision === b.revision;
const sameTarget = (a: ReviewEvidence["target"], b: ReviewEvidence["target"]) =>
	a?.sectionId === b?.sectionId && a?.itemId === b?.itemId && a?.roleId === b?.roleId && a?.field === b?.field;

export function validateReviewEvidence(result: ReviewResult, sources: readonly ReviewEvidence[]): ReviewValidation {
	const fail = (reason: string, proposalIds: string[] = []): ReviewValidation => ({ ok: false, reason, proposalIds });
	const authoritative = new Map(sources.map((evidence) => [evidence.id, evidence]));
	const supplied = new Map(result.evidence.map((evidence) => [evidence.id, evidence]));
	if (authoritative.size !== sources.length || supplied.size !== result.evidence.length)
		return fail("DUPLICATE_EVIDENCE");
	for (const evidence of result.evidence) {
		const actual = authoritative.get(evidence.id);
		if (
			!actual ||
			!sameSource(actual.source, evidence.source) ||
			actual.quote !== evidence.quote ||
			actual.factId !== evidence.factId ||
			actual.factRevision !== evidence.factRevision ||
			actual.confirmation !== evidence.confirmation ||
			!sameTarget(actual.target, evidence.target)
		)
			return fail("INVALID_EVIDENCE");
	}
	const entries = result.kind === "wording" ? result.proposals : result.candidates;
	if (
		new Set(entries.map((entry) => entry.id)).size !== entries.length ||
		new Set(result.questions.map((question) => question.id)).size !== result.questions.length
	)
		return fail("DUPLICATE_SUBJECT");
	for (const entry of [...entries, ...result.questions]) {
		if (!entry.evidenceIds.length) return fail("MISSING_EVIDENCE", [entry.id]);
		for (const evidenceId of entry.evidenceIds) {
			const evidence = supplied.get(evidenceId);
			if (!evidence) return fail("INVALID_EVIDENCE", [entry.id]);
			if (
				result.kind === "wording" &&
				(evidence.confirmation === "source_unconfirmed" ||
					("target" in entry && evidence.target && !sameTarget(evidence.target, entry.target)))
			)
				return fail("UNSUPPORTED_CLAIM", [entry.id]);
		}
	}
	if (
		result.kind === "wording" &&
		result.proposals.some((proposal) => !sameSource(proposal.base, result.sourceRevision))
	)
		return fail("STALE_SOURCE");
	return { ok: true };
}

function assertTarget(data: ResumeData, proposal: ReviewProposal): string {
	const target = proposalTargetSchema.parse(proposal.target);
	if (target.sectionId !== "summary") {
		const builtin = Object.hasOwn(data.sections, target.sectionId)
			? data.sections[target.sectionId as keyof typeof data.sections]
			: undefined;
		const custom = data.customSections.find((section) => section.id === target.sectionId);
		const type = builtin ? target.sectionId : custom?.type;
		if (
			!type ||
			![
				"experience",
				"education",
				"projects",
				"certifications",
				"volunteer",
				"awards",
				"publications",
				"references",
			].includes(type) ||
			(target.roleId && type !== "experience")
		)
			throw new Error("INVALID_REVIEW_TARGET");
	}
	const value = readTarget(data, target);
	if (value === undefined || hashReviewTarget(value) !== proposal.targetHash || !canApplyTo(value, proposal))
		throw new Error("STALE_REVIEW_TARGET");
	// Model replacements may only change a passage's plain text, retaining its existing wrapper.
	if (proposal.after !== replaceBlockText(proposal.before, blockText(proposal.after)))
		throw new Error("INVALID_REVIEW_MARKUP");
	return value;
}

/** Rebase only across this review's active accepted changes, preserving the original full-field guard. */
export function rebaseReviewProposal(
	data: ResumeData,
	proposal: ReviewProposal,
	acceptedChanges: readonly ReviewProposal[],
): ReviewProposal {
	const current = readTarget(data, proposal.target);
	if (current === undefined) throw new Error("STALE_REVIEW_TARGET");
	let baseline = current;
	for (const change of [...acceptedChanges].reverse()) {
		if (!sameTarget(change.target, proposal.target)) continue;
		const restored = applyTo(baseline, { before: change.after, after: change.before });
		if (restored === undefined) throw new Error("STALE_REVIEW_TARGET");
		baseline = restored;
	}
	if (hashReviewTarget(baseline) !== proposal.targetHash) throw new Error("STALE_REVIEW_TARGET");
	const rebased = { ...proposal, targetHash: hashReviewTarget(current) };
	assertTarget(data, rebased);
	return rebased;
}

export function applyReviewProposals(data: ResumeData, proposals: readonly ReviewProposal[]): ResumeData {
	if (!proposals.length || new Set(proposals.map((proposal) => proposal.id)).size !== proposals.length)
		throw new Error("INVALID_REVIEW_BATCH");
	const grouped = new Map<
		string,
		{
			target: ReviewProposal["target"];
			value: string;
			spans: { start: number; end: number; proposal: ReviewProposal }[];
		}
	>();
	for (const input of proposals) {
		const proposal = reviewProposalSchema.parse(input);
		const value = assertTarget(data, proposal);
		const key = JSON.stringify([
			proposal.target.sectionId,
			proposal.target.itemId,
			proposal.target.roleId,
			proposal.target.field,
		]);
		const group = grouped.get(key) ?? { target: proposal.target, value, spans: [] };
		const start = value.indexOf(proposal.before);
		const end = start + proposal.before.length;
		if (group.spans.some((span) => (start < span.end && end > span.start) || start === span.start))
			throw new Error("OVERLAPPING_REVIEW_PROPOSALS");
		group.spans.push({ start, end, proposal });
		grouped.set(key, group);
	}
	const next = structuredClone(data);
	for (const group of grouped.values()) {
		let value = group.value;
		// Work right-to-left against the original indices, so a replacement cannot create a later match.
		for (const { start, end, proposal } of group.spans.sort((a, b) => b.start - a.start)) {
			if (applyTo(group.value, proposal) === undefined) throw new Error("STALE_REVIEW_TARGET");
			value = value.slice(0, start) + proposal.after + value.slice(end);
		}
		writeTarget(next, group.target, value);
	}
	return parseResumeDataForWrite(next);
}
