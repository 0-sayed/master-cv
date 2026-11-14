import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { renderReport, identityMapping } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";
it("embeds an offline report without executing hostile output or loading external assets", async () => {
	const a = await runBenchmark({
		models: loadModels(undefined, undefined, false).slice(0, 1),
		cases: cases.slice(0, 1),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	required(a.calls[0]).output = "</script><img src=x onerror=alert(1)>";
	const html = await renderReport(a);
	const publicData = JSON.parse(html.match(/id="report-data">([^<]*)<\/script>/u)?.[1] ?? "null");
	expect(publicData).not.toHaveProperty("languageScores");
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
