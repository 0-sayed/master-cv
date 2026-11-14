import type { ReviewState } from "./review-draft";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { produce } from "immer";
import { hashReviewTarget } from "@reactive-resume/resume/review-evidence";
import { reviewCandidateSchema } from "@reactive-resume/schema/resume/ai-review";
import { parseResumeDataForWrite } from "@reactive-resume/schema/resume/write";
import { addBuiltinSection, getEntries, resolveSection } from "../editor/write/model";

export const importDraftGeneration = (data: ResumeData) =>
	hashReviewTarget(
		JSON.stringify(data, (_key, value: unknown) =>
			value && typeof value === "object" && !Array.isArray(value)
				? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
				: value,
		),
	);
/** Explicit local selection only. T004 still owns final confirmation and master/CV creation. */
export function applyImportReviewCandidate(state: ReviewState, candidateId: string, entryId: string): ReviewState {
	const review = state.aiReview;
	if (
		!review ||
		review.result?.kind !== "extraction" ||
		review.draftGeneration !== importDraftGeneration(state.data) ||
		review.source.kind !== "import" ||
		review.source.id !== review.result.sourceRevision.id ||
		review.source.revision !== review.result.sourceRevision.revision
	)
		throw new Error("AI_IMPORT_STALE");
	const candidate = reviewCandidateSchema.parse(
		review.result.candidates.find((candidate) => candidate.id === candidateId),
	);
	if (candidate.value === null) throw new Error("AI_IMPORT_UNKNOWN");
	if (review.appliedCandidateIds.includes(candidateId)) throw new Error("AI_IMPORT_ALREADY_APPLIED");
	if (
		state.reused.some(
			(fact) =>
				fact.confirmation === "confirmed" &&
				fact.structured?.section === candidate.section &&
				fact.structured.entityId === entryId &&
				fact.structured.field === candidate.field,
		)
	)
		throw new Error("AI_IMPORT_CONFIRMED_MASTER");
	let targetId = entryId;
	const data = produce(state.data, (draft) => {
		if (entryId === "new") {
			const created = addBuiltinSection(draft, candidate.section);
			if (!created) throw new Error("AI_IMPORT_TARGET_UNAVAILABLE");
			targetId = created;
		}
		const section = resolveSection(draft, candidate.section);
		const entry = section && getEntries(draft, section).find((entry) => entry.id === targetId);
		if (!entry) throw new Error("AI_IMPORT_TARGET_UNAVAILABLE");
		const value =
			candidate.field === "dates" && candidate.rawDateText && typeof candidate.value === "object"
				? { ...candidate.value, raw: candidate.rawDateText }
				: candidate.value;
		(entry as unknown as Record<string, unknown>)[candidate.field] = value;
	});
	const next = parseResumeDataForWrite(data);
	const entityKey = `${candidate.section}:${targetId}`;
	const { submission: _submission, ...rest } = state;
	return {
		...rest,
		data: next,
		confirmationFlow: crypto.randomUUID(),
		confirmed: Object.fromEntries(Object.entries(state.confirmed).filter(([key]) => !key.startsWith(`${entityKey}:`))),
		reviewed: Object.fromEntries(
			Object.entries(state.reviewed).filter(([key]) => key !== entityKey && key !== `${entityKey}:${candidate.field}`),
		),
		aiReview: {
			...review,
			draftGeneration: importDraftGeneration(next),
			appliedCandidateIds: [...review.appliedCandidateIds, candidateId],
		},
	};
}
