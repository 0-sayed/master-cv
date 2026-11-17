import type { TasksVerification } from "./contracts/verifier/schema";
import { expect, it } from "vite-plus/test";
import { rejectionTargets, voteRejections, mergeScopedJudgment } from "./rejection-vote";
import { required } from "./required";

const judgment = (reject = false): TasksVerification => ({
	schemaVersion: 1,
	verdicts: [
		{
			claimId: "flagged",
			verdict: reject ? "unsupported" : "supported",
			evidenceIds: ["cv-1"],
			reason: "Evidence assessed.",
		},
		{ claimId: "accepted", verdict: "supported", evidenceIds: ["cv-1"], reason: "Already accepted." },
	],
	absence: [],
	premises: [],
	retention: null,
	coverage: { status: "complete", reason: "Complete." },
	quality: { status: "appropriate", reason: "Readable.", mqm: null },
});
it("does not request new judgments for accepted claims", () => {
	expect(rejectionTargets(judgment())).toEqual([]);
	expect(voteRejections(judgment(), []).judgments).toHaveLength(1);
});
it("accepts a rejected claim only when both fresh judgments accept it", () => {
	const voted = voteRejections(judgment(true), [judgment(), judgment()]);
	expect(voted.verdict.verdicts[0]?.verdict).toBe("supported");
	expect(voted.targets[0]?.rejectVotes).toBe(1);
	expect(voted.agreement).toBe(false);
});
it("preserves planted defects when at least two judgments reject", () => {
	for (const repeats of [
		[judgment(true), judgment()],
		[judgment(), judgment(true)],
		[judgment(true), judgment(true)],
	]) {
		expect(voteRejections(judgment(true), repeats).verdict.verdicts[0]?.verdict).toBe("unsupported");
	}
});
it("never replaces accepted claims with fresh judgments", () => {
	const changed = judgment();
	required(changed.verdicts[1]).verdict = "contradicted";
	expect(voteRejections(judgment(true), [changed, changed]).verdict.verdicts[1]?.verdict).toBe("supported");
});
it("votes separately on absence, premise, coverage and retention failures", () => {
	const bad = judgment();
	bad.absence = [{ id: "missing", verdict: "present" }];
	bad.premises = [{ id: "q", verdict: "unsupported", reason: "Invented premise." }];
	bad.retention = { status: "lost", evidenceIds: ["cv-1"], reason: "Lost." };
	bad.coverage.status = "uncovered";
	const good = structuredClone(bad);
	required(good.absence[0]).verdict = "confirmed_absent";
	required(good.premises[0]).verdict = "no_candidate_premise";
	required(good.retention).status = "retained";
	good.coverage.status = "complete";
	expect(rejectionTargets(bad)).toHaveLength(4);
	const result = voteRejections(bad, [good, good]);
	expect(result.targets.every((t) => t.rejectVotes === 1)).toBe(true);
	expect(result.verdict).toEqual(good);
});
it("decides on two agreeing valid judgments and treats faults as abstentions", () => {
	expect(voteRejections(judgment(true), [judgment(true)])).toMatchObject({ complete: true });
	expect(voteRejections(judgment(true), [null, judgment(true)])).toMatchObject({ complete: true });
	expect(voteRejections(judgment(true), [judgment(), null])).toMatchObject({ complete: false });
	expect(voteRejections(judgment(true), [null, null])).toMatchObject({ complete: false });
	expect(voteRejections(judgment(true), [null, null]).targets[0]?.rejectVotes).toBe(1);
	expect(() => voteRejections(judgment(true), [null, null, null])).toThrow("INCOMPLETE_REJECTION_VOTE");
});

it("rejects duplicate and invented identifiers in scoped judgments", () => {
	const initial = judgment(true);
	const duplicate = judgment();
	duplicate.verdicts.push(structuredClone(required(duplicate.verdicts[0])));
	expect(() => mergeScopedJudgment(initial, duplicate, rejectionTargets(initial))).toThrow("VERIFIER_VOTE_INVENTORY");
	const unknown = judgment();
	required(unknown.verdicts[1]).claimId = "invented";
	expect(() => mergeScopedJudgment(initial, unknown, rejectionTargets(initial))).toThrow("VERIFIER_VOTE_INVENTORY");
});
