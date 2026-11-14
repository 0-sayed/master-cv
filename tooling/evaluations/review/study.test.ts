import { expect, it } from "vite-plus/test";
import { loadModels, parseOptions } from "./config";
import { cases } from "./corpus";
import { frozenStudy } from "./freeze";
import history from "./freeze-history.json";
import { required } from "./required";
import { runBenchmark } from "./runner";
import {
	arabicApproval,
	fixtureHash,
	smokeCases,
	validateSmoke,
	controls,
	recordedControls,
	requireFullModels,
	validateResume,
	caseVersions,
	studyHash,
} from "./study";

it("rejects legacy core resume identity after the payload preservation change", () => {
	// A real pre-fix manifest hash: the payload rules were absent from the study identity.
	const legacyHash = "a73212e849290b6f11fbae6d84288451188852fd9d6294127a76ca7b14b0827e";
	const manifest = {
		hash: legacyHash,
		mode: "fake",
		phase: "full",
		budgetUsd: 5,
		priorSpendMicros: 0,
		calibration: [],
	};
	const historicalFreeze = JSON.stringify(frozenStudy);
	const currentHash = studyHash(loadModels(), cases, 3);
	expect(() => validateResume(manifest, { ...manifest, hash: currentHash })).toThrow("RESUME_MANIFEST_MISMATCH");
	expect(() => validateResume(manifest, { ...manifest })).not.toThrow();
	expect(JSON.stringify(frozenStudy)).toBe(historicalFreeze);
});

// Existing tuning sources only. Partition metadata exercises holdout-only routing
// in unit tests without selecting around sealed failures or changing paid smoke.
const unitCases = cases
	.filter((c) => !c.holdout && !c.exploratory)
	.flatMap((c) => [c, { ...c, id: `unit-partition-${c.id}`, holdout: true }]);
it("records separate production prompt/schema versions and hashes for the manifest", () => {
	const first = caseVersions(cases)[0];
	expect(first).toMatchObject({
		caseId: cases[0]?.id,
		promptVersion: expect.stringMatching(/t006-(?:extraction|wording)-v5/u),
		schemaVersion: "t006-review-v3",
	});
	expect(first?.promptHash).toHaveLength(64);
	expect(first?.schemaHash).toHaveLength(64);
	expect(first?.fixtureHash).toHaveLength(64);
});
it("rejects resume with changed smoke calibration or carried spending", () => {
	const original = {
		hash: "experiment",
		mode: "fake",
		phase: "full",
		budgetUsd: 5,
		priorSpendMicros: 100,
		calibration: [{ model: "m", provider: "azure", reasoning: "none", inputTokens: 100, outputTokens: 50, samples: 3 }],
	};
	expect(() => validateResume(original, { ...original })).not.toThrow();
	expect(() => validateResume(original, { ...original, priorSpendMicros: 0 })).toThrow("RESUME_MANIFEST_MISMATCH");
	expect(() => validateResume(original, { ...original, calibration: [] })).toThrow("RESUME_MANIFEST_MISMATCH");
});
it("uses four categories across three languages for smoke and three runs by default", () => {
	expect(parseOptions([]).runs).toBe(3);
	expect(new Set(smokeCases(cases).map((c) => c.language)).size).toBe(3);
	expect(smokeCases(cases)).toHaveLength(12);
	expect(() => requireFullModels(loadModels().slice(0, 1))).toThrow("TERRA_REQUIRED");
});
it("requires hash-bound source and gold approval for every Arabic fixture", () => {
	expect(() => arabicApproval(null, cases)).toThrow("ARABIC_REVIEW_REQUIRED");
	const entries = cases
		.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)))
		.map((c) => ({ id: c.id, hash: fixtureHash(c), sourceReviewed: true, goldReviewed: true }));
	const approval = { version: 1, reviewer: "owner", reviewedAt: new Date().toISOString(), fixtures: entries };
	expect(arabicApproval(approval, cases)).toBe("owner");
	expect(() => arabicApproval({ ...approval, fixtures: entries.slice(1) }, cases)).toThrow("ARABIC_REVIEW_INCOMPLETE");
});
it("smoke requires provider, usage, no truncation and bounded tokens", async () => {
	const models = loadModels();
	const corpus = smokeCases(unitCases, models);
	const run = await runBenchmark({
		phase: "smoke",
		models,
		cases: corpus,
		runs: 1,
		fake: true,
		budgetUsd: 5,
	});
	expect(run.calls).toHaveLength(models.length * 12);
	expect(validateSmoke(run, models, corpus).length).toBe(models.length);
	const changed = { ...run, calls: run.calls.map((c) => ({ ...c, actualProvider: "azure" })) };
	expect(() => validateSmoke(changed, models, corpus)).toThrow("PROVIDER_MISMATCH");
	expect(() => validateSmoke({ ...run, calls: run.calls.slice(1) }, models, corpus)).toThrow("SMOKE_VARIANT_FAILED");
	for (const invalid of [
		{ ...run, calls: run.calls.map(({ verifierUsage: _usage, ...c }) => c) },
		{ ...run, calls: run.calls.map((c) => ({ ...c, outputTokens: c.outputTokenCap + 1 })) },
		{ ...run, calls: run.calls.map((c) => ({ ...c, costMicros: null })) },
		{ ...run, calls: run.calls.map((c) => ({ ...c, costMicros: c.reservedMicros + 1 })) },
	])
		expect(() => validateSmoke(invalid, models, corpus)).toThrow("SMOKE_VARIANT_FAILED");
	const qualityOnly = {
		...run,
		calls: run.calls.map((c) => ({
			...c,
			usefulnessMiss: true,
			guardAccepted: false,
			verifierAccepted: false,
			factRetention: "lost" as const,
			estimatedOutputTokens: 1,
		})),
	};
	expect(validateSmoke(qualityOnly, models, corpus)).toHaveLength(models.length);
});
it("requires every independent unit gold and attack to pass the actual guard controls", () => {
	const result = controls(unitCases);
	expect(result.checked).toBeGreaterThanOrEqual(unitCases.length);
	expect(result.failures).toEqual([]);
	expect(result.pass).toBe(true);
	expect(result.knownLimitations).toHaveLength(0);
	expect(result.honestFalseRejects).toBeDefined();
});
it("retains the authorized label correction and prior receipt binding in the freeze history", () => {
	const receipt = required(history.find((row) => row.name === "guard-controls-final.json"));
	const prior = required(history.find((row) => row.name === "guard-controls-before-round5.json"));
	expect(receipt.labelCorrection).toMatchObject({
		ids: ["r2-h11-wording", "r2-h11-injection"],
		fields: ["safeText", "acceptableOutputs"],
		productionGuardChanged: false,
		priorReceiptSha256: prior.sha256,
		reason:
			"Gold strengthened an assisting responsibility into ownership; preserve the source responsibility strength.",
	});
	expect(recordedControls()).toMatchObject({ checked: 126, pass: true, failures: [] });
});
it("preserves the non-quality amendment chain without loading historical seals", () => {
	const receipt = required(history.find((row) => row.name === "guard-controls-before-round5.json"));
	const prior = required(history.find((row) => row.name === "guard-controls-class-resolution.json"));
	const priorFreeze = required(history.find((row) => row.name === "freeze-class-resolution-before-calibration.json"));
	const nextFreeze = required(history.find((row) => row.name === "freeze-before-round5.json"));
	expect(receipt.studyOnlyAmendment).toMatchObject({
		sealedRescanned: false,
		priorReceiptSha256: prior.sha256,
		scanFreezeHash: priorFreeze.studyHash,
		changedFiles: ["tooling/evaluations/review/budget.ts", "tooling/evaluations/review/cli.ts"],
	});
	expect(prior.freezeHash).toBe(priorFreeze.studyHash);
	expect(nextFreeze.holdoutHash).toBe(priorFreeze.holdoutHash);
	expect(nextFreeze.holdoutPassagesHash).toBe(priorFreeze.holdoutPassagesHash);
});

it("fails loudly rather than excluding an unsupported effort", async () => {
	const models = loadModels(undefined, [
		"openai/gpt-6-luna",
		"openai/gpt-6.1-terra",
		"deepseek/deepseek-v4.1-flash-1017",
	]);
	const corpus = smokeCases(unitCases, models);
	const run = await runBenchmark({ phase: "smoke", models, cases: corpus, runs: 1, fake: true, budgetUsd: 5 });
	const changed = {
		...run,
		calls: run.calls.map((c) =>
			c.model === "openai/gpt-6-luna" && c.reasoning === "medium"
				? { ...c, outcome: "unsupported", actualProvider: null, costMicros: 0 }
				: c,
		),
	};
	expect(() => validateSmoke(changed, models, corpus)).toThrow(
		"openai/gpt-6-luna@medium/openai: PINNED_PROVIDER_REJECTED_VARIANT",
	);
	const mismatch = {
		...changed,
		calls: changed.calls.map((c) =>
			c.model === "openai/gpt-6-luna" && c.reasoning === "medium" ? { ...c, actualProvider: "azure" } : c,
		),
	};
	expect(() => validateSmoke(mismatch, models, corpus)).toThrow("PROVIDER_MISMATCH");
});
