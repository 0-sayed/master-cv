import type { TaskCase } from "../types";
import type { InterviewPrepOutput } from "./contract";
import { tasksVerifierSchema } from "../verifier/schema";

export const MIN_SAFE_INTERVIEW_QUESTIONS = 5;
export const OUTSIDE_INTERVIEW_QUESTIONS_ID = "outside-questions";
/** Assess the delivered subset. Rejected questions remain measured proposals in the receipt. */
export function interviewQuestionAssessment(c: TaskCase, output: InterviewPrepOutput, raw: unknown) {
	const parsed = tasksVerifierSchema.safeParse(raw);
	const questionLanguage = (text: string) => {
		const ar = (text.match(/\p{Script=Arabic}/gu) ?? []).length;
		const latin = (text.match(/[A-Za-z]/gu) ?? []).length;
		return c.language === "en" ? latin > ar : ar > latin;
	};
	const languageAccepted = output.questions.every((q) => questionLanguage(q.text));
	const questions = output.questions.map((q) => {
		const premise = parsed.success ? parsed.data.premises.find((p) => p.id === `question:${q.id}`) : undefined;
		const claims = parsed.success
			? parsed.data.verdicts.filter((v) => v.claimId.startsWith(`question:${q.id}:premise:`))
			: [];
		const safe =
			Boolean(premise && ["supported", "no_candidate_premise"].includes(premise.verdict)) &&
			claims.length === q.premises.length &&
			claims.every((v) => v.verdict === "supported");
		return {
			id: q.id,
			safe,
			languageAccepted: questionLanguage(q.text),
			reason: premise?.reason ?? "MISSING_PREMISE_VERDICT",
		};
	});
	const safeQuestionIds = questions.filter((q) => q.safe && q.languageAccepted).map((q) => q.id);
	const outside = parsed.success
		? parsed.data.premises.find((p) => p.id === OUTSIDE_INTERVIEW_QUESTIONS_ID)
		: undefined;
	// Empty notes contain no assertions. Nonempty notes need an independent structured verdict.
	const outsideAccepted = output.notes.length === 0 || outside?.verdict === "no_candidate_premise";
	const coverageAccepted =
		parsed.success &&
		outsideAccepted &&
		(parsed.data.coverage.status === "complete" ||
			(parsed.data.coverage.status === "uncovered" && questions.some((q) => !q.safe)));
	return {
		questions,
		safeQuestionIds,
		languageAccepted,
		accepted: coverageAccepted && safeQuestionIds.length >= MIN_SAFE_INTERVIEW_QUESTIONS,
	};
}
