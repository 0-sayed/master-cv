import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { blindCalls } from "./blind";
import { cases } from "./corpus";
import { decideEvidence, type OwnerRating } from "./decision";
import { artifactComplete, mergeDecisionEvidence } from "./decision-table";
import { fixedHonesty } from "./honesty";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { benchmarkCaps, type BenchmarkArtifact, type BenchmarkCall } from "./runner";
import { controls, recordedControls, fixtureHash } from "./study";

export type ReportData = ReturnType<typeof reportData>;
export function identityMapping(
	artifact: BenchmarkArtifact,
	companion?: BenchmarkArtifact,
	ratings: OwnerRating[] = [],
) {
	return reportData(artifact, companion, ratings);
}
function reportData(artifact: BenchmarkArtifact, companion?: BenchmarkArtifact, ratings: OwnerRating[] = []) {
	const complete = artifactComplete(artifact);
	const empty = { ...artifact, calls: [], estimate: { ...artifact.estimate, calls: 0 } };
	const isTasks =
		artifact.study?.name === "tasks-v1" ||
		artifact.calls.some(
			(c) =>
				c.category === "summary" ||
				c.category === "tailoring" ||
				c.category === "cover-letter" ||
				c.category === "interview-prep",
		);
	const decisionEvidence = mergeDecisionEvidence(
		isTasks ? (companion ?? empty) : artifact,
		isTasks ? artifact : (companion ?? empty),
	);
	const combined = companion ? { ...artifact, calls: [...artifact.calls, ...companion.calls] } : artifact;
	return {
		studyStatus: complete ? "COMPLETE" : "INCOMPLETE",
		recommendationAllowed: complete && artifact.mode === "live",
		decisionEvidence,
		decisionRows: decideEvidence(decisionEvidence, ratings),
		incomplete: artifact.incomplete ?? [],
		worstCaseUsd: artifact.estimate.upperBoundUsd + artifact.priorSpendUsd + (artifact.priorOpenaiSpendUsd ?? 0),
		fallback: { model: "openai/gpt-6.1-terra", reasoning: "low" },
		reportId: companion ? `${artifact.id}::${companion.id}` : artifact.id,
		createdAt: artifact.createdAt,
		tokenCaps: {
			byCategory: [...new Set(combined.calls.map((c) => c.category))].map((category) => ({
				category,
				writerVisible: [
					...new Set(
						combined.calls
							.filter((c) => c.category === category)
							.map(
								(c) => (c as BenchmarkCall & { writerVisibleOutputTokens?: number }).writerVisibleOutputTokens ?? null,
							),
					),
				],
			})),
			benchmarkWriterVisible: 2048,
			productionWriterVisible: 1024,
			byEffort: (["none", "low", "medium", "high", "xhigh"] as const).map((reasoning) => ({
				reasoning,
				...benchmarkCaps(reasoning),
			})),
		},
		verifierFaults: artifact.calls
			.filter((c) => c.verifierFault || c.adjudication === "verifier-fault")
			.map((c) => ({
				outputId: `output-${c.id}`,
				caseId: c.caseId,
				model: c.model,
				reasoning: c.reasoning,
				fault: c.verifierFault,
				verdict: c.verifierVerdict,
			})),
		holdoutDisclosure: {
			en: "Holdout disclosure: owner-authorized class-level inspection and a responsibility-inflating gold-label correction occurred. This set is no longer a pristine independent generalization estimate.",
			ar: "إفصاح المجموعة المحجوبة: جرى فحص فئات الأخطاء بتفويض المالك وتصحيح إجابة مرجعية بالغت في المسؤولية. لم تعد هذه المجموعة تقديرا مستقلا خالصا للتعميم.",
		},
		mode: artifact.mode,
		stopReason: artifact.stopReason,
		plannedCalls: artifact.estimate.calls,
		openaiBudgetUsd: artifact.openaiBudgetUsd ?? 0,
		reservedOpenaiUsd: artifact.reservedOpenaiUsd ?? 0,
		budgetUsd: artifact.budgetUsd,
		fixedHonesty: fixedHonesty(),
		reservedUsd: artifact.reservedUsd,
		...blindCalls(combined),
		scores: scoreBenchmark(artifact.calls),
		tuningScores: scoreBenchmark(artifact.calls.filter((c) => !c.holdout)),
		holdoutScores: scoreBenchmark(artifact.calls.filter((c) => c.holdout)),
		productionScores: scoreBenchmark(artifact.calls.filter((c) => c.holdout && !c.exploratory)).filter(
			(g) => g.dimension === "category",
		),
		languageScores: scoreBenchmark(artifact.calls.filter((c) => c.holdout && !c.exploratory)).filter(
			(g) => g.dimension === "category-language",
		),
		control: artifact.study?.controls ??
			recordedControls() ?? { ...controls(cases.filter((c) => !c.holdout)), pass: false },
		controlReview: [] as { id: string; reason: string }[],
		variantStatus: artifact.study?.variantStatus ?? [],
		complete,
		fixtures: cases.map((c) => ({ ...c, hash: fixtureHash(c) })),
	};
}
export async function renderReport(
	artifact: BenchmarkArtifact,
	privateData: ReportData = reportData(artifact),
): Promise<string> {
	const bundled = await build({
		entryPoints: [fileURLToPath(new URL("./report-client.ts", import.meta.url))],
		bundle: true,
		write: false,
		platform: "browser",
		format: "iife",
		target: "es2022",
		minify: true,
	});
	const css = await readFile(new URL("./report.css", import.meta.url), "utf8");
	const shared = await readFile(new URL("../../../packages/ui/src/styles/globals.css", import.meta.url), "utf8");
	const tokens = [...shared.matchAll(/^:root\s*\{([^}]+)\}/gmu)].map((m) => `:root{${m[1]}}`).join("\n");
	const fonts: string[] = [];
	for (const [family, path, format] of [
		[
			"Noto Sans Arabic",
			"../../../apps/web/public/fonts/noto-sans-arabic/2.009/NotoSansArabic-Regular.ttf",
			"truetype",
		],
		["Noto Sans", "../../../apps/web/public/fonts/noto-sans-ui/86aced91de05/NotoSans-Variable.woff2", "woff2"],
	]) {
		const bytes = await readFile(new URL(required(path), import.meta.url));
		fonts.push(
			`@font-face{font-family:'${family}';src:url(data:font/${format};base64,${bytes.toString("base64")}) format('${format}');font-display:swap}`,
		);
	}
	const {
		incomplete: _incomplete,
		fallback: _fallback,
		identities: _identities,
		scores: _scores,
		tuningScores: _tuning,
		holdoutScores: _holdout,
		productionScores: _production,
		languageScores: _language,
		variantStatus: _variants,
		verifierFaults: _faults,
		decisionEvidence: _decisionEvidence,
		decisionRows: _decisionRows,
		...ratingData
	} = privateData;
	const data = JSON.stringify(ratingData)
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
	return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'"><title>A02 · Master CV benchmark</title><style>${tokens}\n${fonts.join("\n")}\n${css}</style></head><body><main><header><div><p>A02 · MASTER CV</p><h1 id="title">Blind model review</h1><p id="holdout-disclosure" role="note">Previously inspected holdout: authorized class-level inspection; no pristine independent generalization estimate.</p></div><button id="locale" type="button">العربية</button></header><p role="status">${privateData.studyStatus} · Worst-case forecast including prior spend: $${privateData.worstCaseUsd.toFixed(6)}</p><p role="note">Luna/Terra measured via OpenAI first-party (BYOK) for the benchmark; production routes via Azure ZDR; quality same model, latency may differ.</p><p id="qualification"></p><nav><button id="fixture-tab" type="button">Review fixtures</button><button id="blind-tab" type="button">Blind rating</button><button id="reveal" type="button">Import identities after ratings</button><input id="identity-upload" type="file" accept="application/json,.json" hidden><button id="scores-tab" type="button" hidden>Scorecard</button></nav><div class="toolbar"><label id="partition-label">Dataset<select id="partition"><option value="tuning">Tuning</option><option value="holdout">Held out</option></select></label><label id="scope-label">Scope<select id="scope"><option value="production">Production handlers</option><option value="exploratory">Exploratory · T007</option></select></label></div><p id="control-summary"></p><p role="status" id="status" aria-live="polite"></p><section id="fixture-review" hidden><h2 id="fixture-title">Source and gold review</h2><label id="fixture-reviewer-label">Arabic reviewer<input id="fixture-reviewer" maxlength="100"></label><label id="fixture-case-label">Fixture<select id="fixture-case"></select></label><p id="fixture-progress"></p><article class="source"><p id="fixture-source" dir="auto"></p><p id="fixture-intent" dir="auto"></p><pre id="fixture-gold" dir="auto"></pre></article><label><input id="source-reviewed" type="checkbox"><span id="source-reviewed-label">Source wording reviewed</span></label><label><input id="gold-reviewed" type="checkbox"><span id="gold-reviewed-label">Gold facts and acceptable outputs reviewed</span></label><div class="toolbar"><button id="fixture-next" type="button">Next fixture</button><button id="approval-download" type="button">Download Arabic approval</button><label class="upload" id="approval-upload-label">Upload Arabic approval<input id="approval-upload" type="file" accept="application/json,.json"></label></div><table id="coverage"></table></section><section id="blind"><div class="toolbar"><label id="reviewer-label">Reviewer <input id="reviewer" maxlength="100" value="owner"></label><label id="language-label">Cases <select id="language"><option value="all">All</option><option value="ar">Arabic</option><option value="en">English</option><option value="mixed">Mixed</option></select></label><label id="case-label">Case / run <select id="case"></select></label></div><p id="progress"></p><article class="source"><h2 id="source-title">Source</h2><p id="source" dir="auto"></p><p id="intent" dir="auto"></p></article><div id="outputs" class="comparison"></div><div class="toolbar"><button id="previous" type="button">Previous</button><button id="next" type="button">Next</button><button id="download" type="button">Download ratings JSON</button><label class="upload" id="upload-label">Upload ratings JSON<input id="upload" type="file" accept="application/json,.json"></label></div><p id="rubric"></p></section><section id="scorecard" hidden><h2 id="score-title">Automatic scorecard</h2><p id="totals"></p><p id="token-caps">Core benchmark writer cap: 2,048 visible tokens; production: 1,024 visible tokens. Total completion ceilings (reasoning included): ${privateData.tokenCaps.byEffort.map((c) => `${c.reasoning}: ${c.writerCompletionTokenCap.toLocaleString("en-US")}`).join("; ")}; verifier low: 5,120 (extraction: 12,288). Recorded visible caps by category: ${privateData.tokenCaps.byCategory.map((c) => `${c.category}: ${c.writerVisible.join("/")}`).join("; ")}. Excess counts use reported completion minus reasoning tokens; unknown reasoning usage is not guessed.</p><pre id="verifier-faults"></pre><pre id="variant-status" dir="ltr"></pre><p id="decision"></p><div class="table-wrap"><table id="task-decisions"></table></div><h3>Usefulness advisory ranking</h3><p>Case-majority rates with sample sizes; clarify-impact cases and verifier faults excluded. Small samples and ties require the owner’s blind ratings.</p><div class="table-wrap"><table id="usefulness-ranking"></table></div><label id="dimension-label">Group <select id="dimension"><option value="model">Model</option><option value="category" selected>Category × variant</option><option value="language">Language</option><option value="category-language">Category + language</option></select></label><div class="table-wrap"><table id="scores"></table></div><h2 id="human-title">Human ratings</h2><div class="table-wrap"><table id="human"></table></div><p id="definitions"></p></section></main><script type="application/json" id="report-data">${data}</script><script>${required(bundled.outputFiles[0]).text.replaceAll("</script", "<\\/script")}</script></body></html>`;
}
