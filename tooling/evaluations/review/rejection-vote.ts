import { tasksVerifierSchema, type TasksVerification } from "./contracts/verifier/schema";
import { required } from "./required";

export const REJECTION_VOTE_POLICY = "reject-two-valid-of-three-v2";
export const REJECTION_JUDGMENTS = 3;
export type RejectionTarget = { kind: "claim" | "absence" | "premise" | "coverage" | "retention"; id: string };
function value(v: TasksVerification, t: RejectionTarget) {
	switch (t.kind) {
		case "claim":
			return v.verdicts.find((x) => x.claimId === t.id);
		case "absence":
			return v.absence.find((x) => x.id === t.id);
		case "premise":
			return v.premises.find((x) => x.id === t.id);
		case "coverage":
			return v.coverage;
		case "retention":
			return v.retention;
	}
}
function rejects(v: TasksVerification | null, t: RejectionTarget) {
	const item = v && value(v, t);
	if (!item) return true;
	switch (t.kind) {
		case "claim":
			return !("verdict" in item) || item.verdict !== "supported";
		case "absence":
			return !("verdict" in item) || item.verdict !== "confirmed_absent";
		case "premise":
			return !("verdict" in item) || !["supported", "no_candidate_premise"].includes(item.verdict);
		case "coverage":
			return !("status" in item) || item.status !== "complete";
		case "retention":
			return !("status" in item) || item.status !== "retained";
	}
}
export function rejectionTargets(raw: unknown): RejectionTarget[] {
	const parsed = tasksVerifierSchema.safeParse(raw);
	if (!parsed.success) return [];
	const v = parsed.data;
	return [
		...v.verdicts.map((x) => ({ kind: "claim" as const, id: x.claimId })),
		...v.absence.map((x) => ({ kind: "absence" as const, id: x.id })),
		...v.premises.map((x) => ({ kind: "premise" as const, id: x.id })),
		{ kind: "coverage" as const, id: "coverage" },
		...(v.retention ? [{ kind: "retention" as const, id: "retention" }] : []),
	].filter((t) => rejects(v, t));
}
function replace(result: TasksVerification, from: TasksVerification, t: RejectionTarget) {
	switch (t.kind) {
		case "claim":
			result.verdicts = result.verdicts.map((x) =>
				x.claimId === t.id ? structuredClone(required(from.verdicts.find((y) => y.claimId === t.id))) : x,
			);
			break;
		case "absence":
			result.absence = result.absence.map((x) =>
				x.id === t.id ? structuredClone(required(from.absence.find((y) => y.id === t.id))) : x,
			);
			break;
		case "premise":
			result.premises = result.premises.map((x) =>
				x.id === t.id ? structuredClone(required(from.premises.find((y) => y.id === t.id))) : x,
			);
			break;
		case "coverage":
			result.coverage = structuredClone(from.coverage);
			break;
		case "retention":
			result.retention = structuredClone(from.retention);
			break;
	}
}
/** Scope contains IDs, never a previous judgment or its reasons. Accepted fields stay locked offline. */
export function mergeScopedJudgment(initial: unknown, raw: unknown, targets: RejectionTarget[]) {
	const result = structuredClone(tasksVerifierSchema.parse(initial));
	const scoped = tasksVerifierSchema.parse(raw);
	const inventories = [
		[result.verdicts.map((v) => v.claimId), scoped.verdicts.map((v) => v.claimId)],
		[result.absence.map((v) => v.id), scoped.absence.map((v) => v.id)],
		[result.premises.map((v) => v.id), scoped.premises.map((v) => v.id)],
	];
	for (const [known, ids] of inventories) {
		if (!known || !ids || new Set(ids).size !== ids.length || ids.some((id) => !known.includes(id)))
			throw new Error("VERIFIER_VOTE_INVENTORY");
	}

	for (const t of targets) {
		if (!value(scoped, t)) throw new Error("VERIFIER_MISSING_VOTE_TARGET");
		replace(result, scoped, t);
	}
	return result;
}
export function scopedJudgment(raw: unknown, targets: RejectionTarget[]) {
	const v = structuredClone(tasksVerifierSchema.parse(raw));
	v.verdicts = v.verdicts.filter((x) => targets.some((t) => t.kind === "claim" && t.id === x.claimId));
	v.absence = v.absence.filter((x) => targets.some((t) => t.kind === "absence" && t.id === x.id));
	v.premises = v.premises.filter((x) => targets.some((t) => t.kind === "premise" && t.id === x.id));
	if (!targets.some((t) => t.kind === "retention")) v.retention = null;
	if (!targets.some((t) => t.kind === "coverage"))
		v.coverage = { status: "complete", reason: "Outside the independent assessment scope." };
	return v;
}
export function voteRejections(initial: unknown, repeats: unknown[]) {
	const original = tasksVerifierSchema.parse(initial);
	const requested = rejectionTargets(original);
	if (repeats.length > REJECTION_JUDGMENTS - 1 || (!requested.length && repeats.length))
		throw new Error("INCOMPLETE_REJECTION_VOTE");
	const parsed = repeats.map((raw) => tasksVerifierSchema.safeParse(raw).data ?? null);
	const verdict = structuredClone(original);
	const targets = requested.map((t) => {
		const valid = [original, ...parsed].filter((v): v is TasksVerification => v !== null && Boolean(value(v, t)));
		const votes = valid.map((v) => rejects(v, t));
		const rejectVotes = votes.filter(Boolean).length;
		const acceptVotes = votes.length - rejectVotes;
		const complete = rejectVotes >= 2 || acceptVotes >= 2;
		if (acceptVotes >= 2) replace(verdict, required(valid.find((v) => !rejects(v, t))), t);
		return {
			...t,
			rejectVotes,
			acceptVotes,
			validJudgments: valid.length,
			complete,
			rejected: rejectVotes >= 2,
			agreement: votes.every((v) => v === votes[0]),
		};
	});
	return {
		policy: REJECTION_VOTE_POLICY,
		verdict,
		judgments: [initial, ...repeats],
		targets,
		complete: targets.every((t) => t.complete),
		agreement: targets.length ? targets.every((t) => t.agreement) : null,
	};
}
export type RejectionVote = ReturnType<typeof voteRejections>;
