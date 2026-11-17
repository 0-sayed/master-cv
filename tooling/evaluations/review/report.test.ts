import { expect, it } from "vite-plus/test";
import { runJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { renderReport, identityMapping } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { controls } from "./study";
it("embeds an offline report without executing hostile output or loading external assets", async () => {
	const a = await runBenchmark({
		models: loadModels(undefined, undefined, false).slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	const judge = required(
		await runJudgeCanaries({
			phase: "smoke",
			studyHash: "study",
			options: {
				models: loadModels(new URL("./models-tasks.json", import.meta.url).pathname),
				cases: [],
				runs: 1,
				budgetUsd: 13,
				fake: true,
			},
		}),
	);
	judge.honestFalseRejects = 99; // Reports recompute raw verdicts rather than trusting counters.
	a.study = {
		phase: "smoke",
		hash: "study",
		gitCommit: "fixture",
		controls: controls([]),
		calibration: [],
		judgeCanaries: judge,
	};
	required(a.calls[0]).output = "</script><img src=x onerror=alert(1)>";
	const html = await renderReport(a);
	const publicData = JSON.parse(html.match(/id="report-data">([^<]*)<\/script>/u)?.[1] ?? "null");
	expect(publicData).not.toHaveProperty("languageScores");
	expect(publicData.judgeCanaryCalibration).toMatchObject({
		honestFalseRejects: 0,
		allowedHonestFalseRejects: 3,
		honestProbes: 18,
		honestFalseRejectRate: 0,
		rawHonestFalseRejectRate: 0,
		finalHonestFalseRejectRate: 0,
		recall: 1,
	});
	expect(html).toContain("Honest false rejects: 0 / 3 allowed");
	expect(html).toContain('id="judge-protocol-faults"');
	expect(html).toContain('id="credit-interruptions"');
	expect(publicData.judgeCanaryCalibration.byCategoryLanguage).toHaveLength(18);
	expect(publicData.judgeCanaryJudgments).toHaveLength(72);
	expect(publicData.rawVerifierProtocol.knownVerifierLimitation).toBe(true);
	expect(publicData.judgeCanaryCalibration.rawVerifierProtocol.judgmentRequests).toBe(126);
	expect(
		publicData.judgeCanaryJudgments.filter((r: { judgments: unknown[] }) => r.judgments.length === 2),
	).toHaveLength(54);
	expect(html).toContain("Raw honest false-reject rate");
	expect(html).toContain("Judgment agreement by category/language");
	expect(html).toContain("Known verifier limitation");
	a.study.phase = "full";
	const fullHtml = await renderReport(a);
	expect(fullHtml).toContain('id="judge-canary-cell-rates"');
	expect(fullHtml).toContain('id="verifier-protocol-rates"');
	expect(fullHtml).toContain("Full reports reuse smoke calibration.");
	expect(fullHtml).toContain("Honest protocol faults:");
	expect(fullHtml).toContain("Planted probes not caught:");
	expect(fullHtml).toContain("16,384 (one content truncation retry: 20,480");
	expect(html.includes("</script><img")).toBe(false);
	expect(/<script[^>]+src=|<link[^>]+href=/u.test(html)).toBe(false);
	expect(html.includes("data:font/")).toBe(true);
	expect(html.includes('id="blind"')).toBe(true);
	expect(html.includes('id="task-decisions"')).toBe(true);
	expect(html.includes("USD / 1,000 operations")).toBe(true);
	expect(html.includes("Verifier rejected")).toBe(true);
	expect(html.includes("False rejects")).toBe(true);
	expect(html.includes('id="approval-download"')).toBe(true);
	expect(html.includes("Gold facts and acceptable outputs reviewed")).toBe(true);
});

it("marks a budget-stopped study incomplete and blocks recommendations", async () => {
	const a = await runBenchmark({
		models: loadModels().slice(0, 2),
		cases: cases.slice(0, 1),
		runs: 10,
		budgetUsd: 0.000001,
		fake: true,
	});
	// Qualifying mode alone must never allow partial coverage to recommend a model.
	a.mode = "live";
	const data = identityMapping(a);
	expect(data.complete).toBe(false);
	expect(data.recommendationAllowed).toBe(false);
	expect(data.incomplete).toHaveLength(20);
	expect(data.worstCaseUsd).toBeGreaterThan(a.budgetUsd);
	const html = await renderReport(a);
	expect(html).toContain("INCOMPLETE");
});
