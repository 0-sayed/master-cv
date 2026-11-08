import type { QualificationPolicy } from "./types";

export function qualificationPolicy(env: Record<string, string | undefined>): QualificationPolicy {
	const policy = env.DOCUMENT_QUALIFICATION_POLICY ?? "strict v1";
	if (policy !== "strict v1" && policy !== "fact-level v2" && policy !== "fact-level v2.1")
		throw new Error(`Unknown qualification policy: ${policy}`);
	return policy;
}

/** Dev-only qualification switches. A held-out evaluation must never silently run as another suite. */
export function qualificationSuite(
	env: Record<string, string | undefined>,
):
	| "smoke"
	| "pilot"
	| "matrix"
	| "dev-holdout-2"
	| "holdout-3"
	| "dev-holdout-3"
	| "holdout-4"
	| "dev-holdout-4"
	| "holdout-5"
	| "dev-holdout-5"
	| "holdout-6" {
	if (env.DOCUMENT_HOLDOUT_2 === "1")
		throw new Error("Retired DOCUMENT_HOLDOUT_2: use DOCUMENT_DEV_HOLDOUT_2 with an explicit fixture manifest");
	const selected = [
		["DOCUMENT_PILOT", "pilot"],
		["DOCUMENT_MATRIX", "matrix"],
		["DOCUMENT_DEV_HOLDOUT_2", "dev-holdout-2"],
		["DOCUMENT_HOLDOUT_3", "holdout-3"],
		["DOCUMENT_DEV_HOLDOUT_3", "dev-holdout-3"],
		["DOCUMENT_HOLDOUT_4", "holdout-4"],
		["DOCUMENT_DEV_HOLDOUT_4", "dev-holdout-4"],
		["DOCUMENT_HOLDOUT_5", "holdout-5"],
		["DOCUMENT_DEV_HOLDOUT_5", "dev-holdout-5"],
		["DOCUMENT_HOLDOUT_6", "holdout-6"],
	] as const;
	const enabled = selected.filter(([flag]) => env[flag] === "1");
	if (enabled.length > 1) throw new Error("Select only one suite for document qualification");
	return enabled[0]?.[1] ?? "smoke";
}
