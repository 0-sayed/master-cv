/** A content rejection allows one fresh generation, within the original operation budget. */
export const CONTENT_RETRY_STEP = "regenerate";

const contentRejections = new Set([
	"AI_GUARD_FAILED",
	"AI_LOST_FACT",
	"AI_UNSUPPORTED_CLAIM",
	"AI_CONTRADICTION",
	"AI_UNVERIFIED_NEGATION",
	"AI_INVALID_EVIDENCE",
	"AI_INVALID_MARKUP",
	"AI_SOURCE_BINDING",
	"AI_UNSUPPORTED_DATE",
	"AI_AMBIGUOUS_DATE",
	"AI_DUPLICATE_EVIDENCE",
	"AI_DUPLICATE_SUBJECT",
	"AI_MISSING_EVIDENCE",
	"AI_VERIFICATION_FAILED",
	"AI_FACT_RETENTION_FAILED",
	"LETTER_VERIFICATION_REJECTED",
]);

export function isContentRejection(error: unknown): boolean {
	return error instanceof Error && contentRejections.has(error.message);
}

/** Fence recovery and delivery to the generation that owns the latest verification. */
export function currentContentAttempts<T extends { ordinal: number; stepId: string }>(attempts: T[]): T[] {
	const ordered = attempts.toSorted((a, b) => a.ordinal - b.ordinal);
	const retry = ordered.findIndex((attempt) => attempt.stepId === CONTENT_RETRY_STEP);
	return retry < 0 ? ordered : ordered.slice(retry);
}
