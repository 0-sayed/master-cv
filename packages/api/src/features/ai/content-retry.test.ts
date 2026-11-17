import { expect, it } from "vite-plus/test";
import { currentContentAttempts, isContentRejection } from "./content-retry";

it.each(["AI_GUARD_FAILED", "AI_LOST_FACT", "AI_VERIFICATION_FAILED", "AI_FACT_RETENTION_FAILED"])(
	"allows a fresh generation for content rejection %s",
	(code) => expect(isContentRejection(new Error(code))).toBe(true),
);

it.each([
	"AI_SOURCE_CHANGED",
	"AI_EVIDENCE_COLLISION",
	"AI_INPUT_LIMIT",
	"AI_INVALID_GUARD_POLICY",
	"AI_NOT_ENABLED",
	"AI_VERIFIER_UNAVAILABLE",
	"AI_VERIFICATION_INCOMPLETE",
	"AI_VERIFICATION_CITATION",
	"AI_VERIFICATION_RETENTION_SCOPE",
	"AI_CANCELLED",
])("does not regenerate for input, account or verifier protocol failure %s", (code) => {
	expect(isContentRejection(new Error(code))).toBe(false);
});

it("selects the second generation and its verdict by ordinal during recovery", () => {
	const original = [
		{ ordinal: 1, stepId: "generate" },
		{ ordinal: 2, stepId: "verify" },
	];
	const retried = [
		{ ordinal: 3, stepId: "regenerate" },
		{ ordinal: 4, stepId: "verify" },
	];
	expect(currentContentAttempts([...retried.toReversed(), ...original.toReversed()])).toEqual(retried);
	expect(currentContentAttempts(original.toReversed())).toEqual(original);
});
