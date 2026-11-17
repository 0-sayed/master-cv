import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { blindCalls } from "./blind";
import { judgeCanaryCalibration } from "./canaries";
import { cases } from "./corpus";
import { decideEvidence, type OwnerRating } from "./decision";
import { artifactComplete, mergeDecisionEvidence } from "./decision-table";
import { fixedHonesty } from "./honesty";
import { smokeCellReport } from "./instrument";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { benchmarkCaps, type BenchmarkArtifact, type BenchmarkCall } from "./runner";
import { controls, recordedControls, fixtureHash } from "./study";
import { rawVerifierProtocolRates } from "./verifier-protocol";

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
		creditInterruptedSessions: artifact.calls
			.filter((c) => c.outcome === "ACCOUNT_ERROR")
			.map((c) => ({
				key: c.key,
				caseId: c.caseId,
				outcome: c.outcome,
				retry: "top up, then resume the same sealed campaign",
			})),
		smokeCells:
			artifact.study?.phase === "smoke"
				? smokeCellReport(artifact.calls).map((cell) => ({
						...cell,
						variants: cell.variants.map((variant, index) => ({
							variant: `Finalist ${index + 1}`,
							usable: variant.usable,
							reason: variant.reason,
						})),
					}))
				: [],
		safetyClassification: {
			annotationFailures: artifact.calls.filter((c) => c.guardError === "SUMMARY_UNCOVERED_TEXT").length,
			pendingAdjudication: artifact.calls.filter(
				(c) => c.outcome !== "ACCOUNT_ERROR" && c.adjudication === "pending-human",
			).length,
			protocolFaults: artifact.calls.filter((c) => c.verifierFault).length,
		},
		verifierAgreement: verifierAgreement(artifact.calls),
		rawVerifierProtocol: rawVerifierProtocolRates(artifact.calls),
		verifierJudgments: artifact.calls
			.filter((c) => c.outcome !== "ACCOUNT_ERROR" && c.verifierJudgments?.length)
			.map((c) => ({
				caseId: c.caseId,
				category: c.category,
				language: c.language,
				model: c.model,
				reasoning: c.reasoning,
				judgments: c.verifierJudgments,
				vote: c.verifierVote,
			})),
		judgeCanaryJudgments:
			artifact.study?.judgeCanaries?.results.map((r) => ({
				key: r.key,
				caseId: r.caseId,
				category: r.category,
				language: r.language,
				defect: r.defect,
				judgments: r.judgments ?? [],
				vote: r.rejectionVote,
				attempts: r.attempts,
			})) ?? [],
		judgeCanaryCalibration: artifact.study?.judgeCanaries ? judgeCanaryCalibration(artifact.study.judgeCanaries) : null,
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
		selectionPolicy:
			artifact.study?.name === "tasks-v1"
				? "PROVISIONAL, not statistically proven. Require zero critical safety failures and 12 holdouts per language. Rank each language's safety, then quality, writer cost, and latency. Confidence intervals are descriptive only. Synthetic selection does not approve release. "
				: "Safety = guard + independent verifier + zero accepted inventions. Every language needs a case-clustered CI95 lower bound >= 0.95; lexical retention flags and quality metrics are advisory. Ties require two independent blind ratings per output. Contract changes expire decisions. Synthetic benchmark selection does not approve release. ",
		holdoutDisclosure:
			artifact.study?.name === "tasks-v1"
				? {
						en: "Independent task holdouts contain 12 career cases per language and category. They remain outside tuning. Results are PROVISIONAL and not statistically proven.",
						ar: "تتضمن المجموعة المحجوبة 12 حالة مهنية لكل لغة وفئة، ولا تستخدم في ضبط النماذج. النتائج مؤقتة ولا تمثل إثباتا إحصائيا.",
					}
				: {
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
const htmlText = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function verifierAgreement(calls: BenchmarkCall[]) {
	return [...new Set(calls.map((c) => `${c.category}/${c.language}`))].map((key) => {
		const rows = calls.filter((c) => `${c.category}/${c.language}` === key);
		const measured = rows.filter((c) => c.outcome !== "ACCOUNT_ERROR" && c.verifierJudgments?.length);
		const voted = rows.filter((c) => c.verifierVote?.complete);
		return {
			category: required(rows[0]).category,
			language: required(rows[0]).language,
			sessions: rows.length,
			measuredSessions: measured.length,
			rawRejectedSessions: measured.filter((c) => !c.verifierJudgments?.[0]?.accepted).length,
			finalRejectedSessions: measured.filter((c) => !c.verifierAccepted).length,
			rejudgedSessions: voted.length,
			unanimousSessions: voted.filter((c) => c.verifierVote?.agreement).length,
			agreementRate: voted.length ? voted.filter((c) => c.verifierVote?.agreement).length / voted.length : null,
		};
	});
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
		verifierJudgments: _verifierJudgments,
		...ratingBase
	} = privateData;
	const ratingData = {
		...ratingBase,
		verifierJudgments: privateData.verifierJudgments.map(({ model: _model, reasoning: _reasoning, ...session }) => ({
			...session,
			judgments: session.judgments?.map(({ provider: _provider, ...judgment }) => judgment),
		})),
	};
	const data = JSON.stringify(ratingData)
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
	return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'"><title>A02 · Master CV benchmark</title><style>${tokens}\n${fonts.join("\n")}\n${css}</style></head><body><main><header><div><p>A02 · MASTER CV</p><h1 id="title">Blind model review</h1><p id="holdout-disclosure" role="note">Previously inspected holdout: authorized class-level inspection; no pristine independent generalization estimate.</p></div><button id="locale" type="button">العربية</button></header><p role="status">${privateData.studyStatus} · Worst-case forecast including prior spend: $${privateData.worstCaseUsd.toFixed(6)}</p><p role="note">Writer sessions use the benchmark transport. Production uses a separate approved route. Latency can differ.</p><p id="judge-canary-calibration">${privateData.judgeCanaryCalibration ? `Honest false rejects: ${privateData.judgeCanaryCalibration.honestFalseRejects} / ${privateData.judgeCanaryCalibration.allowedHonestFalseRejects} allowed. Recall: ${privateData.judgeCanaryCalibration.recall}. Honest protocol faults: ${privateData.judgeCanaryCalibration.honestProtocolFaults}. Planted faults: ${privateData.judgeCanaryCalibration.defectProtocolFaults}. Planted probes not caught: ${privateData.judgeCanaryCalibration.defectNotCaught} / ${privateData.judgeCanaryCalibration.defectProbes}. Protocol fault rate: ${privateData.judgeCanaryCalibration.protocolFaultRate === null ? "unknown" : `${(privateData.judgeCanaryCalibration.protocolFaultRate * 100).toFixed(2)}%`}.` : "Judge canaries not run."}</p>${privateData.judgeCanaryCalibration ? `<p>Known verifier limitation: honest answers can be rejected. Rates use honest probes only. Full reports reuse smoke calibration.</p><pre id="judge-canary-cell-rates">${JSON.stringify(privateData.judgeCanaryCalibration.byCategoryLanguage, null, 2)}</pre>` : ""}<p>Raw honest false-reject rate: ${privateData.judgeCanaryCalibration ? (privateData.judgeCanaryCalibration.rawHonestFalseRejectRate * 100).toFixed(2) + "%" : "unmeasured"}. Final honest false-reject rate: ${privateData.judgeCanaryCalibration ? (privateData.judgeCanaryCalibration.finalHonestFalseRejectRate * 100).toFixed(2) + "%" : "unmeasured"}. Rates use known honest canaries. Writer rejection rates do not establish truth.</p><details><summary>Judgment agreement by category/language</summary><pre id="verifier-agreement">${htmlText(JSON.stringify(privateData.verifierAgreement, null, 2))}</pre></details><details><summary>Raw canary judgments and votes</summary><pre id="canary-judgments">${htmlText(JSON.stringify(privateData.judgeCanaryJudgments, null, 2))}</pre></details><details><summary>Raw writer-session judgments and votes</summary><pre id="session-judgments">${htmlText(JSON.stringify(ratingData.verifierJudgments, null, 2))}</pre></details><p id="qualification"></p><nav><button id="fixture-tab" type="button">Review fixtures</button><button id="blind-tab" type="button">Blind rating</button><button id="reveal" type="button">Import identities after ratings</button><input id="identity-upload" type="file" accept="application/json,.json" hidden><button id="scores-tab" type="button" hidden>Scorecard</button></nav><div class="toolbar"><label id="partition-label">Dataset<select id="partition"><option value="tuning">Tuning</option><option value="holdout">Held out</option></select></label><label id="scope-label">Scope<select id="scope"><option value="production">Production handlers</option><option value="exploratory">Exploratory · T007</option></select></label></div><p id="control-summary"></p><p role="status" id="status" aria-live="polite"></p><section id="fixture-review" hidden><h2 id="fixture-title">Source and gold review</h2><label id="fixture-reviewer-label">Arabic reviewer<input id="fixture-reviewer" maxlength="100"></label><label id="fixture-case-label">Fixture<select id="fixture-case"></select></label><p id="fixture-progress"></p><article class="source"><p id="fixture-source" dir="auto"></p><p id="fixture-intent" dir="auto"></p><pre id="fixture-gold" dir="auto"></pre></article><label><input id="source-reviewed" type="checkbox"><span id="source-reviewed-label">Source wording reviewed</span></label><label><input id="gold-reviewed" type="checkbox"><span id="gold-reviewed-label">Gold facts and acceptable outputs reviewed</span></label><div class="toolbar"><button id="fixture-next" type="button">Next fixture</button><button id="approval-download" type="button">Download Arabic approval</button><label class="upload" id="approval-upload-label">Upload Arabic approval<input id="approval-upload" type="file" accept="application/json,.json"></label></div><table id="coverage"></table></section><section id="blind"><div class="toolbar"><label id="reviewer-label">Reviewer <input id="reviewer" maxlength="100" value="owner"></label><label id="language-label">Cases <select id="language"><option value="all">All</option><option value="ar">Arabic</option><option value="en">English</option><option value="mixed">Mixed</option></select></label><label id="case-label">Case / run <select id="case"></select></label></div><p id="progress"></p><article class="source"><h2 id="source-title">Source</h2><p id="source" dir="auto"></p><p id="intent" dir="auto"></p></article><div id="outputs" class="comparison"></div><div class="toolbar"><button id="previous" type="button">Previous</button><button id="next" type="button">Next</button><button id="download" type="button">Download ratings JSON</button><label class="upload" id="upload-label">Upload ratings JSON<input id="upload" type="file" accept="application/json,.json"></label></div><p id="rubric"></p></section><section id="scorecard" hidden><h2 id="score-title">Automatic scorecard</h2><p id="totals"></p><p id="token-caps">Core benchmark writer cap: 2,048 visible tokens; production: 1,024 visible tokens. Total completion ceilings (reasoning included): ${privateData.tokenCaps.byEffort.map((c) => `${c.reasoning}: ${c.writerCompletionTokenCap.toLocaleString("en-US")}`).join("; ")}; verifier low: 16,384 (one content truncation retry: 20,480; whitespace faults retry fresh at 16,384; extraction: 12,288). Recorded visible caps by category: ${privateData.tokenCaps.byCategory.map((c) => `${c.category}: ${c.writerVisible.join("/")}`).join("; ")}. Excess counts use reported completion minus reasoning tokens; unknown reasoning usage is not guessed.</p><pre id="verifier-protocol-rates">${JSON.stringify({ sessions: privateData.rawVerifierProtocol, canaries: privateData.judgeCanaryCalibration?.rawVerifierProtocol ?? null }).replaceAll("<", "&lt;")}</pre><pre id="judge-protocol-faults">${JSON.stringify(privateData.judgeCanaryCalibration?.protocolFaultProbes ?? []).replaceAll("<", "&lt;")}</pre><pre id="credit-interruptions">${JSON.stringify(privateData.creditInterruptedSessions).replaceAll("<", "&lt;")}</pre><pre id="smoke-cells">${JSON.stringify(privateData.smokeCells).replaceAll("<", "&lt;")}</pre><pre id="verifier-faults"></pre><pre id="variant-status" dir="ltr"></pre><p id="decision"></p><div class="table-wrap"><table id="task-decisions"></table></div><h3>Usefulness advisory ranking</h3><p>Case-majority rates with sample sizes; clarify-impact cases and verifier faults excluded. Small samples and ties require the owner’s blind ratings.</p><div class="table-wrap"><table id="usefulness-ranking"></table></div><label id="dimension-label">Group <select id="dimension"><option value="model">Model</option><option value="category" selected>Category × variant</option><option value="language">Language</option><option value="category-language">Category + language</option></select></label><div class="table-wrap"><table id="scores"></table></div><h2 id="human-title">Human ratings</h2><div class="table-wrap"><table id="human"></table></div><p id="definitions"></p></section></main><script type="application/json" id="report-data">${data}</script><script>${required(bundled.outputFiles[0]).text.replaceAll("</script", "<\\/script")}</script></body></html>`;
}
