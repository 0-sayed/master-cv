import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries, planJudgeCanaries, scoreJudgeCanary } from "./canaries";
import { loadModels } from "./config";
import { tasksVerifier } from "./contracts/verifier/verifier";
import recorded from "./recorded-verifier-protocol.json";
import { required } from "./required";
import { canonicalVerifierVerdict, degenerateVerifierContent, VERIFIER_WHITESPACE_STOPS } from "./verifier-protocol";

const c = required(loadJudgeCanaries().find((c) => c.id === recorded.caseId));
it("accepts identical repeated absence IDs without erasing the recorded metric rejection", () => {
	const canonical = canonicalVerifierVerdict(recorded.verdict);
	expect(canonical.absence).toHaveLength(1);
	expect(canonical.verdicts[0]?.verdict).toBe("partially");
	expect(tasksVerifier.auditFault(c, recorded.output, canonical)).toBeNull();
	expect(tasksVerifier.assess(c, recorded.output, canonical).accepted).toBe(false);
	expect(recorded.verdict.absence).toHaveLength(2);
});
it("keeps missing IDs and conflicting duplicate verdicts as protocol faults", () => {
	const missing = structuredClone(recorded.verdict);
	missing.absence = [];
	expect(tasksVerifier.auditFault(c, recorded.output, canonicalVerifierVerdict(missing))).toBe(
		"AI_VERIFICATION_INCOMPLETE",
	);
	const conflicting = structuredClone(recorded.verdict);
	required(conflicting.absence[1]).verdict = "present";
	expect(tasksVerifier.auditFault(c, recorded.output, canonicalVerifierVerdict(conflicting))).toBe(
		"AI_VERIFICATION_INCOMPLETE",
	);
});
it("detects partial JSON with a whitespace tail and empty stop output", () => {
	expect(degenerateVerifierContent('{"verdicts":' + " ".repeat(16025))).toBe(true);
	expect(degenerateVerifierContent(" ".repeat(20127))).toBe(true);
	expect(degenerateVerifierContent("")).toBe(true);
	expect(degenerateVerifierContent(JSON.stringify(recorded.verdict))).toBe(false);
	expect(VERIFIER_WHITESPACE_STOPS).toContain(" ".repeat(64));
});

it("counts the recorded metric rejection only after exact duplicate normalization", () => {
	const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
	const probe = required(
		planJudgeCanaries(models).find((p) => p.c.id === recorded.caseId && p.defect === recorded.defect),
	);
	const row = {
		key: probe.key,
		caseId: c.id,
		category: c.category,
		language: c.language,
		defect: probe.defect,
		judge: { model: probe.model.model, provider: probe.model.provider, reasoning: probe.model.reasoning },
		outcome: "valid",
		provider: "Together",
		verdict: canonicalVerifierVerdict(recorded.verdict),
		openRouterMicros: 0,
		openaiMicros: 0,
	};
	expect(scoreJudgeCanary(probe, row)).toMatchObject({ caught: true, pipelineCaught: true, fault: null });
});
