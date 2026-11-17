import { expect, it } from "vite-plus/test";
import { planJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { tasksVerifier } from "./contracts/verifier/verifier";
import recorded from "./fixtures/recorded-coverage-faults.json";
import { required } from "./required";
import { rawVerifierProtocolRates } from "./verifier-protocol";

it("keeps missing claim, premise and retention verdicts as protocol faults in recorded responses", () => {
	const plan = planJudgeCanaries(loadModels(new URL("./models-tasks.json", import.meta.url).pathname));
	for (const entry of recorded) {
		const p = required(plan.find((p) => p.c.id === entry.caseId && p.defect === entry.defect));
		expect(tasksVerifier.auditFault(p.c, p.output, entry.verdict)).toBe(entry.expectedFault);
	}
});

it("reports every protocol response once across resumed history by category and language", () => {
	const bad = { key: "a", outcome: "invalid", fault: "INVALID_VERIFIER_OUTPUT" };
	const good = { key: "b", outcome: "valid", fault: null };
	const j = { ...good, attempts: [bad, good] };
	const rate = rawVerifierProtocolRates([
		{ category: "summary", language: "ar", attempts: [{ judgments: [j] }], judgments: [j] },
		{ category: "summary", language: "en", judgments: [{ key: "c", outcome: "valid", fault: null }] },
	]);
	expect(rate.judgmentRequests).toBe(3);
	expect(rate.rawProtocolFaults).toBe(1);
	expect(rate.rawPerCallFaultRate).toBe(1 / 3);
	expect(rate.byCategoryLanguage.find((g) => g.language === "ar")?.rawPerCallFaultRate).toBe(0.5);
});
