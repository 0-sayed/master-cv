import type { TaskCase } from "./contracts/types";
import type { BenchmarkArtifact } from "./runner";
import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { getTaskContract } from "./contracts";
import { guardTaskClaims } from "./contracts/guard";
import { interviewQuestionAssessment } from "./contracts/interview-prep/question-assessment";
import recorded from "./contracts/verifier/fixtures/recorded-smoke.json";
import { artifactComplete } from "./decision-table";
import { smokeCellReport, sessionRouterCostMicros } from "./instrument";
import { criticalSafetyFailure, scoreBenchmark } from "./metrics";
import { required } from "./required";
import { bindSmokeCohort, selectedSmoke } from "./smoke-cohort";
import { studyHash } from "./study";
import { loadStudyCases, smokeCases, assessSmoke } from "./study";
import { benchmarkInput, verifierAuditFault } from "./verifier";

const artifact = { ...recorded.artifact, stopReason: null } as unknown as BenchmarkArtifact;
const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const cases = smokeCases(loadStudyCases("tasks-v1"), models);
const response = (call: BenchmarkArtifact["calls"][number]) => JSON.parse(required(call.output));
const fixture = (id: string) => required(cases.find((c) => c.id === id)) as TaskCase;

it("accepts recorded date, relative-particle and approved-document paraphrases", () => {
	for (const call of artifact.calls.filter((c) => c.category === "cover-letter")) {
		const c = fixture(call.caseId);
		const contract = getTaskContract(c.category);
		const claims = contract.claims(c, response(call));
		const guard = guardTaskClaims(c, claims, contract.guardPolicy);
		expect(guard.details, `${call.reasoning}/${c.language}`).toEqual(
			call.reasoning === "none" && c.language === "en" ? ["c3:AI_UNSUPPORTED_CLAIM"] : [],
		);
	}
});
it("still rejects changed dates and uncited job titles in recorded letters", () => {
	const call = required(
		artifact.calls.find((c) => c.category === "cover-letter" && c.reasoning === "medium" && c.language === "ar"),
	);
	const c = fixture(call.caseId);
	const contract = getTaskContract(c.category);
	const claim = required(contract.claims(c, response(call))[0]);
	expect(guardTaskClaims(c, [{ ...claim, text: claim.text.replace("2013", "2012") }], contract.guardPolicy).pass).toBe(
		false,
	);
});
it("supplies positive absence subjects and the trusted tailoring structure to the judge", () => {
	const job = required(artifact.calls.find((c) => c.category === "job-evidence"));
	expect(JSON.stringify(benchmarkInput(fixture(job.caseId), response(job)))).toContain("positiveSubject");
	const tailor = required(artifact.calls.find((c) => c.category === "tailoring" && c.language === "mixed"));
	expect(JSON.stringify(benchmarkInput(fixture(tailor.caseId), response(tailor)))).toContain("trustedVariant");
});
it("gives the same bounded absence meaning to the recorded Arabic answer pair", () => {
	const pair = ["none", "low"].map((reasoning) =>
		required(
			artifact.calls.find((c) => c.category === "job-evidence" && c.language === "ar" && c.reasoning === reasoning),
		),
	);
	const outputs = pair.map(response);
	expect(outputs[0].requirements[1]).toEqual(outputs[1].requirements[1]);
	expect(
		pair.map((c) => required((c.verifierVerdict as { absence: { verdict: string }[] }).absence[0]).verdict),
	).toEqual(["unclear", "confirmed_absent"]);
	for (const call of pair) {
		const c = fixture(call.caseId);
		const scored = getTaskContract("job-evidence").score(c, response(call), null);
		expect(scored.safetyDeterministic.pass).toBe(true);
		expect(scored.quality.value).toBe(1);
		const request = JSON.stringify(benchmarkInput(c, response(call)));
		expect(request).toContain("positiveSubject");
		expect(request).toContain("absence:req-2");
	}
});
it("scores interview questions independently and enforces the requested language", () => {
	const mixed = required(
		artifact.calls.find((c) => c.category === "interview-prep" && c.reasoning === "medium" && c.language === "mixed"),
	);
	const result = interviewQuestionAssessment(fixture(mixed.caseId), response(mixed), mixed.verifierVerdict);
	expect(result.safeQuestionIds).toHaveLength(5);
	expect(result.accepted).toBe(true);
	for (const call of artifact.calls.filter(
		(c) => c.category === "interview-prep" && c.language === "en" && c.reasoning !== "medium",
	)) {
		expect(
			interviewQuestionAssessment(fixture(call.caseId), response(call), call.verifierVerdict).languageAccepted,
		).toBe(false);
	}
});
it("flags missing translation quality instead of silently ranking by cost", () => {
	const call = required(artifact.calls.find((c) => c.category === "translation"));
	expect(verifierAuditFault(fixture(call.caseId), response(call), call.verifierVerdict)).toBe("VERIFIER_MQM_REQUIRED");
});

it("calibrates every billed finalist despite individual smoke rejections", () => {
	const variants = assessSmoke(artifact, models, cases, "tasks-v1");
	expect(variants).toHaveLength(3);
	expect(variants.every((v) => v.status === "accepted" && v.calibration?.samples === 18)).toBe(true);
});
it("reports every shared unusable cell without excluding a finalist", () => {
	const cells = smokeCellReport(artifact.calls);
	expect(cells).toHaveLength(18);
	expect(
		cells
			.filter((c) => c.blocked)
			.map((c) => `${c.category}/${c.language}`)
			.sort(),
	).toEqual(["cover-letter/ar", "cover-letter/mixed", "interview-prep/ar", "interview-prep/mixed"]);
	expect(cells.every((c) => c.variants.length === 3)).toBe(true);
});
it("includes all earlier verifier charges in the recorded forecast", () => {
	expect(artifact.calls.reduce((n, c) => n + sessionRouterCostMicros(c), 0)).toBe(266529);
});
it("does not call punctuation coverage a critical invented assertion", () => {
	const call = required(artifact.calls.find((c) => c.caseId === "summary-tuning-en-reports" && c.reasoning === "none"));
	expect(criticalSafetyFailure(call)).toBe(false);
});

it("keeps failed judge sessions in the safety denominator", () => {
	const rows = scoreBenchmark(artifact.calls).filter((row) => row.dimension === "model");
	expect(rows).toHaveLength(3);
	expect(rows.map((row) => row.safetySamples)).toEqual([18, 18, 18]);
});

it("validates completeness within each planned category grid", () => {
	const calls = artifact.calls.filter(
		(call) => call.category === "summary" || (call.category === "translation" && call.reasoning !== "none"),
	);
	const scoped = { ...artifact, calls, estimate: { ...artifact.estimate, calls: calls.length } };
	expect(artifactComplete(scoped)).toBe(true);
	const missing = calls.filter(
		(call) => !(call.category === "summary" && call.reasoning === "none" && call.language === "ar"),
	);
	expect(artifactComplete({ ...scoped, calls: missing, estimate: { ...scoped.estimate, calls: missing.length } })).toBe(
		false,
	);
});

it("recovers the recorded conditional protocol label without accepting invented source quotes", () => {
	const call = required(
		artifact.calls.find((c) => c.category === "interview-prep" && c.reasoning === "low" && c.language === "ar"),
	);
	expect(verifierAuditFault(fixture(call.caseId), response(call), call.verifierVerdict)).toBeNull();
	expect(
		interviewQuestionAssessment(fixture(call.caseId), response(call), call.verifierVerdict).safeQuestionIds,
	).toHaveLength(5);
});

it("binds an explicit full subset to its three-finalist smoke without discarding prior spend", () => {
	const corpus = loadStudyCases("tasks-v1");
	const hash = studyHash(models, corpus, 3, undefined, "tasks-v1");
	const fullModels = models.filter((model) => model.reasoning !== "none");
	const bound = { ...artifact, study: { ...required(artifact.study), hash } };
	expect(bindSmokeCohort(bound, fullModels, corpus, studyHash(fullModels, corpus, 3, undefined, "tasks-v1"))).toBe(
		hash,
	);
	expect(selectedSmoke(bound, fullModels).calls).toHaveLength(36);
	expect(selectedSmoke(bound, fullModels).reservedUsd).toBe(bound.reservedUsd);
	expect(() =>
		bindSmokeCohort(bound, [{ ...required(fullModels[0]), reasoning: "high" }], corpus, "different"),
	).toThrow("LIVE_SMOKE_MISMATCH");
});
