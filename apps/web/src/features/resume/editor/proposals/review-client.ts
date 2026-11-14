import type { ReviewDecisionInput, ReviewDecisionView } from "@reactive-resume/schema/resume/ai-review";
import { savePendingChanges, useResumeStore } from "@/features/resume/builder/draft";
import { client } from "@/libs/orpc/client";

type Dependencies = {
	flush: (id: string) => boolean | Promise<boolean>;
	current: () => { id: string; revision: string; generation: number } | null;
	rpc: (input: ReviewDecisionInput) => Promise<ReviewDecisionView>;
	replace: (response: ReviewDecisionView, generation: number) => boolean;
};
export function createReviewDecisionSubmitter(dependencies: Dependencies) {
	return async (input: ReviewDecisionInput): Promise<ReviewDecisionView> => {
		const initial = dependencies.current();
		if (!initial || !(await dependencies.flush(initial.id))) throw new Error("AI_REVIEW_SAVE_REQUIRED");
		const current = dependencies.current();
		if (!current || current.id !== initial.id) throw new Error("AI_REVIEW_SAVE_REQUIRED");
		// Caller retains this exact request across a lost response. A new attempt after edits needs a new key.
		if (current.revision !== input.expectedUpdatedAt) throw new Error("AI_REVIEW_SOURCE_CHANGED");
		const response = await dependencies.rpc(input);
		if (response.resumeId !== current.id || !dependencies.replace(response, current.generation))
			throw new Error("AI_REVIEW_LOCAL_CONFLICT");
		return response;
	};
}
export const submitReviewDecision = createReviewDecisionSubmitter({
	flush: savePendingChanges,
	current: () => {
		const state = useResumeStore.getState();
		return state.resume && state.acknowledgedUpdatedAt
			? { id: state.resume.id, revision: state.acknowledgedUpdatedAt.toISOString(), generation: state.editGeneration }
			: null;
	},
	rpc: (input) => client.ai.review.decide(input),
	replace: (response, generation) => {
		const state = useResumeStore.getState();
		return Boolean(
			state.resume &&
			state.resume.id === response.resumeId &&
			state.replaceResumeFromServer(
				{ ...state.resume, data: response.data, updatedAt: new Date(response.updatedAt) },
				generation,
			),
		);
	},
});
