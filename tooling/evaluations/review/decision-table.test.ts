import type { OwnerRating } from "./decision-table";
import type { BenchmarkArtifact, BenchmarkCall } from "./runner";
import { beforeAll, expect, it } from "vite-plus/test";
import { blindCalls, blindReviewComplete } from "./blind";
import { loadModels } from "./config";
import { getTaskContract } from "./contracts";
import { toEvaluation } from "./contracts/types";
import { cases } from "./corpus";
import { buildDecisionTable, buildDecisionEvidence } from "./decision-table";
import { caseClusteredSafety, safetyPass } from "./metrics";
import { identityMapping, renderReport } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { loadStudyCases } from "./study";

let base: BenchmarkArtifact;
beforeAll(async () => {
	base = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		fake: true,
		budgetUsd: 10,
	});
});
// Synthetic labelled evidence exercises rules; never exported as measured data.
function artifact(
	categories = ["wording"],
	variants = 1,
	count = 80,
	study: "core" | "tasks-v1" = "core",
): BenchmarkArtifact {
	const seed = required(base.calls[0]);
	const calls = categories.flatMap((category) =>
		Array.from({ length: variants }, (_, v) =>
			(["ar", "en", "mixed"] as const).flatMap((language) =>
				Array.from({ length: count }, (_, i): BenchmarkCall => ({
					...seed,
					id: `${study}-${category}-${language}-${v}-${i}`,
					key: `${study}-${category}-${language}-${v}-${i}`,
					caseId: `${category}-${language}-${i}`,
					category,
					language,
					runIndex: 0,
					holdout: true,
					exploratory: false,
					model: `model-${v}`,
					reasoning: "none",
					costMicros: 1000 * (v + 1),
					latencyMs: 100 + v,
					schemaValid: true,
					guardAccepted: true,
					verifierAccepted: true,
					safetyAccepted: true,
					factRetention: "retained",
					score: { ...required(seed.score), unsupportedClaims: [], lostFacts: [], invalidEvidenceIds: [] },
					qualityAccepted: true,
					outcome: "valid",
					truncated: false,
					writerTruncated: false,
					promptVersion: study === "core" ? seed.promptVersion : getTaskContract(category as "summary").promptVersion,
					schemaVersion: study === "core" ? seed.schemaVersion : getTaskContract(category as "summary").schemaVersion,
				})),
			),
		).flat(),
	);
	return {
		...base,
		id: study,
		mode: "live",
		calls,
		estimate: { ...base.estimate, calls: calls.length },
		incomplete: [],
		stopReason: null,
	};
}
function table(
	core: BenchmarkArtifact,
	tasks: BenchmarkArtifact = { ...base, calls: [], estimate: { ...base.estimate, calls: 0 } },
	ratings: OwnerRating[] = [],
) {
	return buildDecisionTable({ core, tasks, ratings });
}
it("safety must pass every language slice with case-clustered CI lower bound ≥ threshold", () => {
	const a = artifact();
	expect(table(a)[0]).toMatchObject({ winner: { model: "model-0" }, perLanguage: { ar: { n: 80 } } });
	const small = artifact(["wording"], 1, 4);
	const repeated = small.calls.flatMap((c) =>
		Array.from({ length: 50 }, (_, runIndex) => ({ ...c, runIndex, id: `${c.id}-${runIndex}` })),
	);
	expect(caseClusteredSafety(repeated.filter((c) => c.language === "ar"))).toMatchObject({ n: 4, safetyRate: 1 });
	expect(caseClusteredSafety(repeated).ci95[0]).toBeLessThan(0.95);
	expect(table(small)[0]?.winner).toBe("none");
	required(a.calls.find((c) => c.language === "mixed")).guardAccepted = false;
	expect(table(a)[0]?.winner).toBe("none");
});
it("retained lexical lost-fact checks are advisory, while safety cannot be overridden by cached acceptance", () => {
	const a = artifact();
	const c = required(a.calls[0]);
	required(c.score).lostFacts = ["honest paraphrase"];
	c.lexicalLostFacts = ["honest paraphrase"];
	expect(safetyPass(c)).toBe(true);
	expect(table(a)[0]?.winner).toEqual({ model: "model-0", reasoning: "none" });
	c.verifierAccepted = false;
	expect(safetyPass(c)).toBe(false);
});
it("quality metric per contract defined and compared within stated band", () => {
	const a = artifact(["summary", "translation"], 1, 80, "tasks-v1");
	const evidence = buildDecisionEvidence(a, "tasks-v1");
	expect(evidence.find((e) => e.category === "summary")?.qualityPolicy).toMatchObject({
		metric: "required-key-fact-coverage",
		band: 0.05,
		direction: "higher",
	});
	expect(evidence.find((e) => e.category === "translation")?.qualityPolicy).toMatchObject({
		metric: "mqm-weighted-errors",
		band: 1,
		direction: "lower",
	});
	const r = table({ ...base, calls: [], estimate: { ...base.estimate, calls: 0 } }, a);
	expect(r.every((row) => row.promptVersion && /^[a-f0-9]{64}$/u.test(row.schemaHash))).toBe(true);
});
it("injection failures fold into each task's safety, including new task variants", () => {
	const core = artifact(["wording", "injection"]);
	const tasks = artifact(["summary"], 1, 80, "tasks-v1");
	const injection = required(core.calls.find((c) => c.category === "injection"));
	required(injection.score).unsupportedClaims = ["invented"];
	expect(table(core, tasks).every((r) => r.winner === "none")).toBe(true);
});
it("owner blind rating required for ties; identities hidden until rated", async () => {
	const a = artifact(["wording"], 2);
	a.calls.forEach((c) => {
		c.output = JSON.stringify({ proposals: [{ text: c.model === "model-0" ? "First wording" : "Second wording" }] });
	});
	expect(table(a)[0]?.winner).toBe("owner-rating");
	const blind = blindCalls(a, () => 0);
	const ratings: OwnerRating[] = blind.groups
		.filter((g) => !g.repeat)
		.flatMap((g) =>
			g.outputs.flatMap((o) =>
				["one", "two"].map((reviewer) => ({
					reportId: a.id,
					outputId: o.id,
					reviewer,
					arabic: g.language === "en" ? null : 5,
					fidelity: 5,
					naturalness: 5,
					notes: "",
					unsupportedFact: false,
				})),
			),
		);
	expect(blindReviewComplete(blind.groups, ratings.slice(1))).toBe(false);
	expect(blindReviewComplete(blind.groups, ratings)).toBe(true);
	expect(table(a, undefined, ratings)[0]?.winner).toEqual({ model: "model-0", reasoning: "none" });
	expect(
		table(
			a,
			undefined,
			ratings.map((r) => ({ ...r, reportId: "other" })),
		)[0]?.winner,
	).toBe("owner-rating");
	const html = await renderReport(a);
	const publicData = JSON.parse(required(html.match(/id="report-data">([^<]*)<\/script>/u)?.[1]));
	expect(publicData).not.toHaveProperty("decisionEvidence");
	expect(publicData).not.toHaveProperty("decisionRows");
	expect(JSON.stringify(publicData)).not.toContain('"model-0"');
});
it("blind view renders every contract output with source/job context", () => {
	const all = loadStudyCases("tasks-v1").filter((c) => c.kind === "task");
	for (const category of new Set(all.map((c) => c.category))) {
		const fixture = required(all.find((c) => c.category === category));
		if (fixture.kind !== "task") throw new Error("TASK");
		const a = {
			...base,
			calls: [
				{
					...required(base.calls[0]),
					category,
					output: JSON.stringify(fixture.gold),
					input: JSON.stringify({ cv: fixture.cv, jobAd: fixture.jobAd }),
				},
			],
		};
		const group = required(blindCalls(a).groups[0]);
		expect(group.outputs[0]?.text).not.toContain("[No findings]");
		expect(group.outputs[0]?.text).toContain(
			category === "summary"
				? "summary"
				: category === "tailoring"
					? "patches"
					: category === "translation"
						? "segments"
						: category === "cover-letter"
							? "paragraphs"
							: category === "job-evidence"
								? "requirements"
								: "questions",
		);
		expect(group.input).toContain("cv");
		expect(group.input).toContain("jobAd");
	}
});
it("fake or incomplete evidence never yields a winner", () => {
	const a = artifact();
	for (const invalid of [
		{ ...a, mode: "fake" as const },
		{ ...a, incomplete: [{ model: "m", provider: "p", reasoning: "none", caseId: "c", runIndex: 0 }] },
		{ ...a, calls: a.calls.slice(1) },
		{ ...a, stopReason: "budget" },
		{ ...a, calls: [...a.calls.slice(1), required(a.calls[1])] },
	])
		expect(table(invalid)[0]?.winner).toBe("none");
	const faults = artifact();
	required(faults.calls[0]).verifierFault = "timeout";
	expect(table(faults)[0]?.winner).toBe("none");
	const stale = artifact(["summary"], 1, 80, "tasks-v1");
	stale.calls.forEach((c) => {
		c.promptVersion = "old";
	});
	expect(table({ ...base, calls: [], estimate: { ...base.estimate, calls: 0 } }, stale)[0]?.winner).toBe("none");
	expect(identityMapping({ ...a, mode: "fake" }).recommendationAllowed).toBe(false);
});
it("core 11-variant and tasks 7-variant merge by category", () => {
	const core = artifact(["wording", "extraction", "missing-info", "injection"], 11);
	const tasks = artifact(
		["summary", "job-evidence", "tailoring", "translation", "cover-letter", "interview-prep"],
		7,
		80,
		"tasks-v1",
	);
	const rows = table(core, tasks);
	expect(rows).toHaveLength(10);
	expect(new Set(rows.map((r) => r.category)).size).toBe(10);
	expect(rows.find((r) => r.category === "interview-prep")?.provisional).toBe(true);
});
it("reports actual contract quality without converting missing quality into a pass", async () => {
	const fixtures = loadStudyCases("tasks-v1")
		.filter((c) => c.category === "summary" && c.holdout)
		.slice(0, 1);
	const a = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases: fixtures,
		runs: 1,
		fake: true,
		budgetUsd: 20,
	});
	const e = required(buildDecisionEvidence(a, "tasks-v1")[0]);
	const c = required(e.candidates[0]);
	const call = required(a.calls[0]);
	expect(identityMapping(a).tokenCaps).toHaveProperty("byCategory", [{ category: "summary", writerVisible: [4096] }]);
	const score = (call as BenchmarkCall & { taskScore: { quality: { value: number | null } } }).taskScore;
	expect(c.perLanguage[call.language].quality).toBe(score.quality.value);
	const missing = artifact(["summary"], 1, 80, "tasks-v1");
	expect(buildDecisionEvidence(missing, "tasks-v1")[0]?.candidates[0]?.perLanguage.ar.quality).toBeNull();
});
it("companion reports expose both studies' blind groups but no public decision identities", async () => {
	const core = artifact(["wording"], 1, 4);
	const tasks = artifact(["summary"], 1, 4, "tasks-v1");
	const privateData = identityMapping(core, tasks);
	expect(new Set(privateData.groups.map((g) => g.category))).toEqual(new Set(["wording", "summary"]));
	const html = await renderReport(core, privateData);
	const publicData = JSON.parse(required(html.match(/id="report-data">([^<]*)<\/script>/u)?.[1]));
	expect(publicData).not.toHaveProperty("decisionEvidence");
	expect(publicData.groups.some((g: { category: string }) => g.category === "summary")).toBe(true);
});
it("a human fabrication finding blocks even a single automatic candidate", () => {
	const a = artifact();
	const output = required(required(buildDecisionEvidence(a, "core")[0]).candidates[0]).outputs[0];
	const rating: OwnerRating = {
		...required(output),
		reviewer: "owner",
		arabic: 5,
		fidelity: 5,
		naturalness: 5,
		notes: "unsupported claim",
		unsupportedFact: true,
	};
	expect(table(a, undefined, [rating])[0]?.winner).toBe("none");
});
it("compares contract quality within the declared band without making quality a safety gate", () => {
	const a = artifact(["summary"], 2, 80, "tasks-v1");
	const score = (c: BenchmarkCall, value: number) =>
		Object.assign(
			c,
			toEvaluation({
				caseId: c.caseId,
				structuralFailure: false,
				missingQuestion: false,
				emptyAnswer: false,
				safetyDeterministic: { pass: true, reasons: [] },
				quality: { metric: "required-key-fact-coverage", value, pass: false },
				lostFacts: [],
				unsupportedClaims: [],
			}),
		);
	a.calls.forEach((c) => score(c, c.model === "model-0" ? 0.8 : 0.85));
	expect(table({ ...base, calls: [], estimate: { ...base.estimate, calls: 0 } }, a)[0]?.winner).toBe("owner-rating");
	a.calls.filter((c) => c.model === "model-1").forEach((c) => score(c, 0.86));
	expect(table({ ...base, calls: [], estimate: { ...base.estimate, calls: 0 } }, a)[0]?.winner).toEqual({
		model: "model-0",
		reasoning: "none",
	});
});
it("folds human injection fabrication findings into every matching task", () => {
	const a = artifact(["wording", "injection"]);
	const injection = required(buildDecisionEvidence(a, "core").find((e) => e.category === "injection"));
	const output = required(required(injection.candidates[0]).outputs[0]);
	const rating: OwnerRating = {
		...output,
		reviewer: "owner",
		arabic: 5,
		fidelity: 5,
		naturalness: 5,
		notes: "unsupported",
		unsupportedFact: true,
	};
	expect(table(a, undefined, [rating]).every((r) => r.winner === "none")).toBe(true);
});
