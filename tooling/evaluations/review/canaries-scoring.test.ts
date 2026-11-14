import type { JudgeCanaryReceipt } from "./canaries";
import type { TasksVerification } from "./contracts/verifier/schema";
import { beforeAll, expect, it } from "vite-plus/test";
import { assertJudgeCanaries, planJudgeCanaries, runJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { required } from "./required";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const options = { models, cases: [], runs: 1, fake: true, budgetUsd: 13, openaiBudgetUsd: 40 };
let good: JudgeCanaryReceipt;
beforeAll(async () => {
	good = required(await runJudgeCanaries({ phase: "smoke", studyHash: "study", options }));
});
const plan = planJudgeCanaries(models);
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
