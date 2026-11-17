import type { JudgeCanaryReceipt } from "../../canaries";
import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { planJudgeCanaries, scoreJudgeCanary } from "../../canaries";
import { loadModels } from "../../config";
import { required } from "../../required";
import { benchmarkInput, benchmarkVerifierSpec } from "../../verifier";
import { tasksVerifier } from "./verifier";

const saved = JSON.parse(readFileSync(new URL("./fixtures/judge-calibration.json", import.meta.url), "utf8")) as {
	results: JudgeCanaryReceipt["results"];
};
const plan = planJudgeCanaries(loadModels(new URL("../../models-tasks.json", import.meta.url).pathname));
const rowFor = (key: string) => required(saved.results.find((row) => row.key === key));
const honest = required(plan.find((probe) => probe.c.id === "judge-canary-cover-letter-en" && probe.defect === "gold"));

it("distinguishes a relevance bridge from a claim of prior job duties in judge instructions", () => {
	const prompt = benchmarkVerifierSpec(honest.c).systemPrompt;
	expect(prompt).toContain("A relevance bridge does not assert prior performance of every advertised duty.");
	expect(prompt).toContain("Reject any added candidate skill, metric, or past responsibility without CV evidence.");
	const payload = JSON.stringify(benchmarkInput(honest.c, honest.output));
	expect(payload).toContain("jobSpanIds");
	expect(payload).toContain("job-duty");
});

it("shows exact readable claim IDs without priming the saved invented alias", () => {
	const attack = required(
		plan.find((probe) => probe.c.id === "judge-canary-cover-letter-en" && probe.defect === "invented-metric"),
	);
	const payload = benchmarkInput(attack.c, attack.output);
	const metadata = required(
		payload.selections.find((selection) => "id" in selection && selection.id === "task-verification-response"),
	);
	expect(metadata.text).toContain('"id":"canary-defect"');
	expect(metadata.text).not.toContain("\\u0063");
	expect(benchmarkVerifierSpec(attack.c).systemPrompt).not.toContain("canary-detect");
});

it("accepts the honestly labeled saved bridge while preserving the original false-reject evidence", () => {
	const original = rowFor(honest.key);
	expect(scoreJudgeCanary(honest, original)).toMatchObject({ falseReject: true, guardRejected: false, fault: null });
	const corrected = structuredClone(original);
	const verdict = corrected.verdict as {
		verdicts: { claimId: string; verdict: string; reason: string }[];
		coverage: { status: string; reason: string };
	};
	const bridge = required(verdict.verdicts.find((claim) => claim.claimId === "experience-role-connection"));
	bridge.verdict = "supported";
	bridge.reason =
		"Documented record and report work is relevant to the cited duties; no past request-follow-up responsibility is asserted.";
	verdict.coverage = {
		status: "complete",
		reason: "Both work facts and the non-assertive duty reference were checked.",
	};
	expect(scoreJudgeCanary(honest, corrected)).toMatchObject({
		falseReject: false,
		pipelineFalseReject: false,
		guardRejected: false,
		fault: null,
	});
	// This is a retrospective human-labeled policy regression, not a new measured model verdict.
	expect(scoreJudgeCanary(honest, original).falseReject).toBe(true);
});

it("catches every planted defect using the saved paid verdicts and deterministic guard", () => {
	const attacks = plan.filter((probe) => !probe.expectedAccepted);
	expect(attacks).toHaveLength(54);
	for (const probe of attacks) expect(scoreJudgeCanary(probe, rowFor(probe.key)).pipelineCaught, probe.key).toBe(true);
});

it("retains all legacy faults and flags missing translation quality in saved receipts", () => {
	const faults = plan.map((probe) => scoreJudgeCanary(probe, rowFor(probe.key)).fault).filter(Boolean);
	expect(faults).toHaveLength(34);
	expect(faults.filter((fault) => fault === "VERIFIER_MQM_REQUIRED")).toHaveLength(11);
	expect(faults.filter((fault) => fault === "AI_VERIFICATION_RETENTION_SCOPE")).toHaveLength(9);
	expect(faults.filter((fault) => fault === "VERIFIER_UNKNOWN_CLAIM")).toHaveLength(8);
	expect(faults.filter((fault) => fault === "AI_VERIFICATION_INCOMPLETE")).toHaveLength(6);
});

it("states closed production inventories and boolean retention explicitly in judge instructions", () => {
	for (const category of ["summary", "job-evidence", "tailoring", "translation"]) {
		const probe = required(plan.find((probe) => probe.c.category === category && probe.expectedAccepted));
		const prompt = benchmarkVerifierSpec(probe.c).systemPrompt;
		expect(prompt).toContain("variant-verification-task");
		expect(prompt).toContain("Copy claims[].id verbatim into verdicts[].claimId");
		expect(prompt).toContain("retention=false requires retention=null");
		expect(prompt).toContain("Copy premises[].id verbatim into premises[].id");
		expect(
			tasksVerifier.auditFault(probe.c, probe.output, tasksVerifier.fakeVerdict(probe.c, probe.output)),
		).toBeNull();
	}
});
