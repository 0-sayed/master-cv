import type { JudgeCanaryReceipt } from "./canaries";
import type { TasksVerification } from "./contracts/verifier/schema";
import { beforeAll, expect, it } from "vite-plus/test";
import {
	assertJudgeCanaries,
	judgeCanaryCalibration,
	planJudgeCanaries,
	runJudgeCanaries,
	scoreJudgeCanary,
} from "./canaries";
import { loadModels } from "./config";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { voteRejections } from "./rejection-vote";
import { required } from "./required";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const options = { models, cases: [], runs: 1, fake: true, budgetUsd: 13, openaiBudgetUsd: 40 };

it("refuses a receipt that turns a faulty initial judgment into a valid final verdict", () => {
	const receipt = structuredClone(good);
	const row = required(receipt.results.find((r) => r.defect === "gold"));
	const first = required(row.judgments?.[0]);
	first.fault = "AI_VERIFICATION_INCOMPLETE";
	row.voteFault = null;
	expect(() => assertJudgeCanaries(receipt, { studyHash: "study", models, mode: "fake" })).toThrow("JUDGE_CANARY_GATE");
});
let good: JudgeCanaryReceipt;
beforeAll(async () => {
	good = required(await runJudgeCanaries({ phase: "smoke", studyHash: "study", options }));
});
const plan = planJudgeCanaries(models);
it("catches invented SAP experience framed as a relevance bridge after two valid agreeing judgments", () => {
	const probe = required(
		plan.find((p) => p.c.category === "cover-letter" && p.c.language === "en" && p.defect === "job-only-keyword"),
	);
	expect(JSON.stringify(probe.output)).toContain("My experience using SAP at work matches the duties in your posting.");
	const row = required(good.results.find((r) => r.key === probe.key));
	expect(row.judgments).toHaveLength(2);
	expect(row.rejectionVote?.targets.some((t) => t.rejectVotes === 2)).toBe(true);
	expect(scoreJudgeCanary(probe, row).caught).toBe(true);
});
function changed(category: string, defect: string) {
	const receipt = structuredClone(good);
	const probe = required(plan.find((p) => p.c.category === category && p.c.language === "en" && p.defect === defect));
	const row = required(receipt.results.find((r) => r.key === probe.key));
	return { receipt, probe, row, verdict: row.verdict as TasksVerification };
}
const rescore = (receipt: JudgeCanaryReceipt) =>
	runJudgeCanaries({
		phase: "smoke",
		studyHash: "study",
		previous: { ...receipt, results: receipt.results.map((r) => ({ ...r, verifierFaultRetries: 1 })) },
		options: {
			...options,
			fakeTransport: () => {
				throw new Error("OFFLINE_DISPATCH_FORBIDDEN");
			},
		},
	});

it("does not call unrelated absence or quality diagnostics an honest safety rejection", async () => {
	const { receipt, verdict } = changed("summary", "gold");
	verdict.absence = [{ id: "unrequested", verdict: "present" }];
	verdict.quality.status = "inappropriate";
	expect((await rescore(receipt))?.honestFalseRejects).toBe(0);
	// Protocol defects still block qualification; semantic scores cannot waive them.
	expect(() => assertJudgeCanaries(receipt, { models, mode: "fake", studyHash: "study" })).toThrow("JUDGE_CANARY_GATE");
});
it("ignores retention outside the task scope when counting honest safety rejections", async () => {
	const { receipt, verdict } = changed("summary", "gold");
	verdict.retention = { status: "unclear", evidenceIds: ["cv-1"], reason: "Not applicable." };
	expect((await rescore(receipt))?.honestFalseRejects).toBe(0);
});
it("counts an exact planted-claim rejection even if an unrelated audit field is invalid", async () => {
	const { receipt, verdict } = changed("summary", "invented-metric");
	verdict.coverage.status = "complete";
	verdict.absence = [{ id: "unrequested", verdict: "unclear" }];
	expect((await rescore(receipt))?.verifierRecall).toBe(1);
});
it("counts an unsafe whole response despite a mistyped claim ID, preserving its protocol fault", async () => {
	const { receipt, verdict } = changed("summary", "invented-metric");
	required(verdict.verdicts.at(-1)).claimId = "wrong-id";
	expect((await rescore(receipt))?.verifierRecall).toBe(1);
});
it("does not count rejection of an unrelated claim as detecting the planted claim", async () => {
	const { receipt, probe, row } = changed("summary", "invented-metric");
	const verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output) as TasksVerification;
	required(verdict.verdicts[0]).verdict = "unsupported";
	row.verdict = verdict;
	expect((await rescore(receipt))?.verifierRecall).toBe(53 / 54);
});
it("does not count an unrelated absence or out-of-scope retention rejection as detecting a defect", async () => {
	const { receipt, probe, row } = changed("summary", "invented-metric");
	const verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output) as TasksVerification;
	verdict.absence = [{ id: "unrequested", verdict: "present" }];
	verdict.retention = { status: "lost", evidenceIds: ["cv-1"], reason: "Not applicable." };
	row.verdict = verdict;
	expect((await rescore(receipt))?.verifierRecall).toBe(53 / 54);
});
it("keeps scoped retention, absence, response coverage and question premises as safety failures", async () => {
	for (const kind of ["retention", "absence", "coverage", "premises"] as const) {
		const category = {
			retention: "translation",
			absence: "job-evidence",
			coverage: "summary",
			premises: "interview-prep",
		}[kind];
		const { receipt, verdict } = changed(category, "gold");
		if (kind === "retention") required(verdict.retention).status = "unclear";
		if (kind === "absence") required(verdict.absence[0]).verdict = "present";
		if (kind === "coverage") verdict.coverage.status = "uncovered";
		if (kind === "premises") required(verdict.premises[0]).verdict = "unsupported";
		expect((await rescore(receipt))?.honestFalseRejects, kind).toBe(1);
	}
});
it("reports unavailable verification separately from an honest safety false rejection", async () => {
	const { receipt, row } = changed("summary", "gold");
	row.outcome = "truncated";
	expect((await rescore(receipt))?.honestFalseRejects).toBe(0);
	expect(() => assertJudgeCanaries(receipt, { models, mode: "fake", studyHash: "study" })).toThrow("JUDGE_CANARY_GATE");
});

it("does not guess a defective claim from a mistyped ID or a safe question premise", async () => {
	const { receipt, probe, row } = changed("summary", "invented-metric");
	const verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output) as TasksVerification;
	verdict.verdicts.push({
		claimId: "canary-detect",
		verdict: "unsupported",
		evidenceIds: ["cv-1"],
		reason: "Wrong ID.",
	});
	row.verdict = verdict;
	expect((await rescore(receipt))?.verifierRecall).toBe(53 / 54);
	const interview = changed("interview-prep", "invented-metric");
	const safe = tasksVerifier.fakeVerdict(
		{ ...interview.probe.c, gold: interview.probe.output },
		interview.probe.output,
	) as TasksVerification;
	for (const premise of safe.premises) premise.verdict = "no_candidate_premise";
	interview.row.verdict = safe;
	expect((await rescore(interview.receipt))?.verifierRecall).toBe(53 / 54);
});

const binding = { studyHash: "study", models, mode: "fake" as const };
for (const count of [3, 4]) {
	it(`${count === 3 ? "allows" : "blocks"} ${count} honest false rejects with perfect defect recall`, () => {
		const receipt = structuredClone(good);
		for (const probe of plan.filter((p) => p.expectedAccepted).slice(0, count)) {
			const row = required(receipt.results.find((r) => r.key === probe.key));
			const verdict = row.verdict as TasksVerification;
			verdict.coverage.status = "uncovered";
			const first = required(row.judgments?.[0]);
			row.judgments = [0, 1, 2].map((index) => ({
				...structuredClone(first),
				key: first.key + (index ? `:judge:${index + 1}` : ""),
				verdict: structuredClone(verdict),
				normalizedVerdict: structuredClone(verdict),
				accepted: false,
			}));
			row.rejectionVote = voteRejections(verdict, [verdict, verdict]);
			row.verdict = row.rejectionVote.verdict;
		}
		const calibration = judgeCanaryCalibration(receipt, plan);
		expect(calibration.honestFalseRejectRate).toBe(count / 18);
		expect(calibration.byCategoryLanguage.filter((cell) => cell.honestFalseRejectRate === 1)).toHaveLength(count);
		if (count === 3) expect(() => assertJudgeCanaries(receipt, binding)).not.toThrow();
		else expect(() => assertJudgeCanaries(receipt, binding)).toThrow("JUDGE_CANARY_GATE");
	});
}
it("blocks a missed planted defect even with no honest false rejects", () => {
	const receipt = structuredClone(good);
	const probe = required(
		plan.find(
			(p) =>
				!p.expectedAccepted &&
				!scoreJudgeCanary(p, required(receipt.results.find((r) => r.key === p.key))).guardRejected,
		),
	);
	const verdict = required(receipt.results.find((r) => r.key === probe.key)).verdict as TasksVerification;
	for (const claim of verdict.verdicts) claim.verdict = "supported";
	for (const premise of verdict.premises) premise.verdict = "no_candidate_premise";
	if (verdict.retention) verdict.retention.status = "retained";
	verdict.coverage.status = "complete";
	for (const absence of verdict.absence) absence.verdict = "confirmed_absent";
	expect(scoreJudgeCanary(probe, required(receipt.results.find((r) => r.key === probe.key))).pipelineCaught).toBe(
		false,
	);
	expect(() => assertJudgeCanaries(receipt, binding)).toThrow("JUDGE_CANARY_GATE");
});

it("qualifies exhausted protocol faults separately from valid planted misses", () => {
	const receipt = structuredClone(good);
	const probes = plan.filter((p) => !p.expectedAccepted).slice(0, 2);
	for (const probe of probes) {
		const row = required(receipt.results.find((r) => r.key === probe.key));
		row.voteFault = "VERIFIER_DEGENERATE_OUTPUT";
		required(row.judgments?.[0]).fault = "VERIFIER_DEGENERATE_OUTPUT";
		required(row.judgments?.[0]).outcome = "invalid";
		row.verifierFaultRetries = 1;
	}
	const calibration = judgeCanaryCalibration(receipt, plan);
	expect(calibration.recall).toBe(1);
	expect(calibration.defectValidVerdicts).toBe(52);
	expect(calibration.defectNotCaught).toBe(0);
	expect(calibration.protocolFaultProbes).toHaveLength(2);
	expect(() => assertJudgeCanaries(receipt, binding)).not.toThrow();
	const tooMany = structuredClone(receipt);
	for (const probe of plan.filter((p) => !p.expectedAccepted).slice(0, 8)) {
		const row = required(tooMany.results.find((r) => r.key === probe.key));
		row.voteFault = "VERIFIER_DEGENERATE_OUTPUT";
		required(row.judgments?.[0]).fault = "VERIFIER_DEGENERATE_OUTPUT";
		required(row.judgments?.[0]).outcome = "invalid";
		row.verifierFaultRetries = 1;
	}
	expect(() => assertJudgeCanaries(tooMany, binding)).toThrow("JUDGE_CANARY_GATE");
});

it("does not disguise a valid accepted defect as an exhausted protocol fault", () => {
	const receipt = structuredClone(good);
	const probe = required(
		plan.find(
			(p) =>
				!p.expectedAccepted &&
				!scoreJudgeCanary(p, required(receipt.results.find((r) => r.key === p.key))).guardRejected,
		),
	);
	const row = required(receipt.results.find((r) => r.key === probe.key));
	const verdict = tasksVerifier.fakeVerdict({ ...probe.c, gold: probe.output }, probe.output) as TasksVerification;
	const first = required(row.judgments?.[0]);
	row.verdict = verdict;
	row.judgments = [{ ...first, verdict, normalizedVerdict: verdict, outcome: "valid", fault: null }];
	row.rejectionVote = null;
	row.voteFault = null;
	expect(scoreJudgeCanary(probe, row)).toMatchObject({ fault: null, pipelineCaught: false });
	expect(() => assertJudgeCanaries(receipt, binding)).toThrow("JUDGE_CANARY_GATE");
	row.voteFault = "VERIFIER_DEGENERATE_OUTPUT";
	row.verifierFaultRetries = 1;
	expect(() => assertJudgeCanaries(receipt, binding)).toThrow("JUDGE_CANARY_GATE");
});
