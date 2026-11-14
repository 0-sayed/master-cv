import type { Evaluation } from "../corpus";
import type { ReasoningEffort } from "../production";
import type { ModelPayload } from "@reactive-resume/api/features/ai/payload";
import type { z } from "zod";

export type TaskCategory = "summary" | "job-evidence" | "tailoring" | "translation" | "cover-letter" | "interview-prep";

/** Source spelling to preserve; translation glossaries and local placeholders are separate concerns. */
type Protected = {
	kind: "name" | "employer" | "title" | "date" | "number" | "skill" | "degree" | "certification" | "language";
	text: string;
};

export type CvFact = { id: string; section: string; text: string; protected?: Protected[] };

export type TaskCase = {
	id: string;
	category: TaskCategory;
	language: "ar" | "en" | "mixed";
	holdout: boolean;
	exploratory: false;
	kind: "task";
	requiresQuestion: boolean;
	sector: string;
	/** Author declaration, retained in owner review and fixture identity; never candidate evidence. */
	provenance?: { synthetic: true; authoredBy: "codex lane"; declaration: string };
	cv: CvFact[];
	/** Untrusted job requirements, never candidate evidence. */
	jobAd: { segments: { id: string; text: string }[] } | null;
	gold: unknown;
	mutants: { id: string; output: unknown; expect: "unsafe" | "honest" }[];
};

export type Claim = {
	id: string;
	text: string;
	/** Candidate evidence only. Job spans are never admitted to this pool. */
	evidenceIds: string[];
	/** Separate citations for a non-assertive job-duty bridge, in letter/tailoring only. */
	jobSpanIds?: string[];
	kind: "fact" | "premise" | "translation";
};
export type GuardPolicy = { lostFact: boolean; subsetEntities: boolean; entityChecker?: "translation" };
export type GuardResult = { pass: boolean; error: string | null; details: string[] };
export type VerifierTaskContext = {
	taskInstruction: string;
	retention: "applicable" | "not_applicable";
	absenceChecks: { id: string; claim: string }[];
};

export type TaskScore = {
	/** Required by the existing journal's ReviewCaseScore envelope. */
	caseId: string;
	structuralFailure: boolean;
	missingQuestion: boolean;
	emptyAnswer: boolean;
	safetyDeterministic: { pass: boolean; reasons: string[] };
	quality: { metric: string; value: number | null; pass: boolean | null };
	lostFacts: string[];
	unsupportedClaims: string[];
};

export interface TaskContract<C extends TaskCase, O> {
	category: C["category"];
	promptVersion: string;
	systemPrompt: string;
	outputSchema: z.ZodType<O>;
	schemaVersion: string;
	guardPolicy: GuardPolicy;
	visibleCap(effort: ReasoningEffort): number;
	verifierCap: number;
	deadlineMs: number;
	buildInput(c: C): ModelPayload;
	claims(c: C, output: O): Claim[];
	verifierContext(c: C, output: O): VerifierTaskContext;
	/** The versioned tasks verifier (Task 1c) must parse a verdict before it is trusted. */
	score(c: C, output: O, verdict: unknown | null): TaskScore;
}

/** Preserve task diagnostics without inventing a core ReviewResult or an independent verifier verdict. */
export function toEvaluation(score: TaskScore): Evaluation & { taskScore: TaskScore } {
	return {
		schemaValid: !score.structuralFailure,
		structuralFailure: score.structuralFailure,
		guardAccepted: !score.structuralFailure && score.safetyDeterministic.pass,
		guardError: score.safetyDeterministic.pass ? null : (score.safetyDeterministic.reasons[0] ?? null),
		missingQuestion: score.missingQuestion,
		emptyAnswer: score.emptyAnswer,
		usefulnessMiss: score.quality.pass === false,
		score: {
			caseId: score.caseId,
			unsupportedClaims: [...score.unsupportedClaims],
			invalidEvidenceIds: [],
			lostFacts: [...score.lostFacts],
			unresolvedUnknowns: [],
		},
		result: null,
		taskScore: score,
	};
}
