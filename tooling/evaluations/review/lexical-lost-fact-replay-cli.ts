import type { BenchmarkArtifact } from "./runner";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

// Install before application imports. This command has no inference/credential mode.
process.loadEnvFile = () => {};
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_LEXICAL_NETWORK_FORBIDDEN"));
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET = "synthetic-offline-lexical";
const { required } = await import("./required");
const { reviewVerifierSchema } = await import("@reactive-resume/api/features/ai/review-verifier");
const { values } = parseArgs({
	options: {
		source: { type: "string" },
		out: { type: "string", short: "o" },
		checks: { type: "string" },
	},
});
if (!values.source || !values.out) throw new Error("SOURCE_AND_EXPLICIT_OUTPUT_REQUIRED");
const source = resolve(values.source);
const out = resolve(values.out);
if (basename(source).startsWith(".env") || (values.checks && basename(values.checks).startsWith(".env")))
	throw new Error("ENV_FILE_FORBIDDEN");
if ([process.cwd(), resolve("..")].includes(out) || source === join(out, "lexical-lost-fact-results.json"))
	throw new Error("SEPARATE_NON_ROOT_OUTPUT_REQUIRED");
const [
	{ rescoreLexical },
	{ cases },
	{ controls },
	{ scoreBenchmark },
	{ selectTaskModels },
	{ renderReport, identityMapping },
] = await Promise.all([
	import("./lexical-lost-fact-replay"),
	import("./corpus"),
	import("./study"),
	import("./metrics"),
	import("./decision"),
	import("./report"),
]);
const body = await readFile(source, "utf8");
const before = JSON.parse(body) as BenchmarkArtifact;
const after = rescoreLexical(before);
const control = controls(cases);
if (!control.pass || control.checked !== 126) throw new Error("LEXICAL_CONTROLS_FAILED");
const beforeScores = scoreBenchmark(before.calls);
const table = after.scores
	.filter((s) => s.dimension === "category")
	.map((s) => {
		const old = required(
			beforeScores.find(
				(b) =>
					b.model === s.model &&
					b.reasoning === s.reasoning &&
					b.holdout === s.holdout &&
					b.dimension === s.dimension &&
					b.value === s.value,
			),
		);
		return {
			variant: `${s.model}@${s.reasoning}`,
			partition: s.holdout ? "holdout" : "tuning",
			category: s.value,
			beforeLostFacts: old.lostFacts,
			afterLostFacts: s.lostFacts,
			beforePass: old.pass,
			afterPass: s.pass,
			costPer1000Usd: s.costPerSessionUsd * 1000,
			writerCostPer1000Usd: s.writerCostPer1000Usd,
			p50Ms: s.p50Ms,
		};
	});
const genuine = new Map([
	["r2-t03-extraction/حائل", "location replaced with جدة"],
	["r2-t07-extraction/2018-09 to 2020-06", "start date omitted; end used as start"],
	["r2-t12-wording/دون إصدار فواتير ZATCA", "negative role boundary dropped"],
	["r2-h03-extraction/دبلوم أرشفة", "specialization أرشفة omitted"],
	["r2-h06-wording/field technician", "role omitted (dates remain as named months)"],
	["r2-h10-wording/قوى", "tool replaced with قمد"],
	["r2-h12-extraction/مؤسسة مرسى التجريبية", "employer replaced with مرسية التجريبية"],
]);
const causeNames = [
	"attached clitics/article",
	"diacritics/tatweel",
	"alef/ya/ta-marbuta",
	"Arabic-Indic/Latin digits",
	"punctuation inside fact",
	"joined number/year marker",
	"genuine loss",
	"explicit month/year representation",
	"unmatched paraphrase/translation",
];
const hits = before.calls.flatMap((call, index) =>
	(call.lexicalLostFacts ?? []).map((fact) => {
		const retention = reviewVerifierSchema.shape.factRetention.safeParse(
			call.verifierVerdict && typeof call.verifierVerdict === "object" && "factRetention" in call.verifierVerdict
				? call.verifierVerdict.factRetention
				: null,
		);
		const fixed = !required(after.calls[index]).lexicalLostFacts?.includes(fact);
		const annotation = genuine.get(`${call.caseId}/${fact}`);
		const cause = annotation
			? "genuine loss"
			: fixed
				? /^\d{4}-\d{2}$/u.test(fact)
					? "explicit month/year representation"
					: fact === "١٤٤٣ هـ"
						? "joined number/year marker"
						: "attached clitics/article"
				: "unmatched paraphrase/translation";
		return {
			key: call.key,
			caseId: call.caseId,
			variant: `${call.model}@${call.reasoning}`,
			category: call.category,
			partition: call.holdout ? "holdout" : "tuning",
			fact,
			cause,
			fixed,
			annotation: annotation ?? null,
			verifierFactRetention: retention.success ? retention.data : null,
			verifierFault: call.verifierFault,
			output: JSON.parse(call.output),
		};
	}),
);
const causes = causeNames.map((cause) => {
	const rows = hits.filter((h) => h.cause === cause);
	return {
		cause,
		hits: rows.length,
		holdout: rows.filter((h) => h.partition === "holdout").length,
		tuning: rows.filter((h) => h.partition === "tuning").length,
		fixed: rows.filter((h) => h.fixed).length,
		verifierRetained: rows.filter((h) => h.verifierFactRetention?.status === "retained").length,
		verifierLost: rows.filter((h) => h.verifierFactRetention?.status === "lost").length,
		verifierUnavailable: rows.filter((h) => !h.verifierFactRetention).length,
		examples: rows.slice(0, 2).map((h) => ({ key: h.key, fact: h.fact, output: h.output })),
	};
});
const languageRows = after.scores
	.filter((s) => s.holdout && !s.exploratory && s.dimension === "category-language")
	.map((s) => ({
		...s,
		category: required(s.value.split("/")[0]),
		language: required(s.value.split("/")[1]),
	}));
// Missing owner ratings stay missing. Never synthesize fidelity/band/tie judgments.
const decision = selectTaskModels(languageRows, [], { model: "openai/gpt-6.1-terra", reasoning: "low" });
const winners = decision.tasks.map((task) => {
	const strict = after.scores
		.filter(
			(s) =>
				s.holdout &&
				s.dimension === "category" &&
				s.value === task.category &&
				["ar", "en", "mixed"].every((language) =>
					languageRows.some(
						(r) =>
							r.model === s.model &&
							r.reasoning === s.reasoning &&
							r.category === task.category &&
							r.language === language &&
							r.pass,
					),
				),
		)
		.sort((a, b) => a.costPerSessionUsd - b.costPerSessionUsd)[0];
	return {
		category: task.category,
		winner: null,
		reason: "Owner blind fidelity/band and two-reviewer ratings unavailable; no final winner.",
		strictAutomaticLeader: strict ? `${strict.model}@${strict.reasoning}` : null,
		costPer1000Usd: strict ? strict.costPerSessionUsd * 1000 : null,
		p50Ms: strict?.p50Ms ?? null,
	};
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const checks = values.checks ? JSON.parse(await readFile(resolve(values.checks), "utf8")) : null;
const audit = {
	source,
	sourceSha256: hash(body),
	scorerSha256: hash(await readFile(new URL("./score.ts", import.meta.url), "utf8")),
	interpretation:
		"Paired offline lexical-only re-score of saved live outputs, not a new live study. Writers, verifier judgments, guards, billing and latency are unchanged. Existing strict pass and decision.ts thresholds unchanged. No inferred semantic equivalences or owner ratings. Verifier retention is response-level, not a fact-level ground truth. Cause counts are exclusive blocking mismatches after existing normalization; co-occurring diacritics/digits are not double-counted. Cause annotations cover this recorded run; zero counts mean already handled/no observed hit, not absent regression coverage. Remaining translations/paraphrases need reviewed label alternatives; genuine loss is not overridden by retained verifier status. Four retained judgments omit the required archiving specialization from the diploma; four lost judgments on named-date hits concern role omissions rather than the dates.",
	control,
	causes,
	hits,
	table,
	winners,
	decision,
	checks,
};
const mdTable = (heads: string[], rows: unknown[][]) =>
	`| ${heads.join(" | ")} |\n|${heads.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;
const example = (row: (typeof causes)[number]) => {
	const first = row.examples[0];
	if (!first) return "No observed hit";
	const literal = first.output as { proposals?: { text: string }[]; candidates?: unknown[] };
	const text = literal.proposals?.map((p) => p.text).join(" ") ?? JSON.stringify(literal.candidates);
	return `${first.fact} ⇒ ${text.slice(0, 150)}`.replaceAll("|", "\\|").replace(/\n/gu, " ");
};
const report = `${audit.interpretation}\n\n${mdTable(
	[
		"Cause",
		"Holdout",
		"Tuning",
		"Total",
		"Fixed",
		"Verifier retained/lost/unavailable",
		"Example (full output in audit)",
	],
	causes.map((r) => [
		r.cause,
		r.holdout,
		r.tuning,
		r.hits,
		r.fixed,
		`${r.verifierRetained}/${r.verifierLost}/${r.verifierUnavailable}`,
		example(r),
	]),
)}\n${mdTable(
	[
		"Variant",
		"Partition",
		"Category",
		"Lost before→after",
		"Pass before→after",
		"Pair USD/1,000",
		"Writer USD/1,000",
		"p50 ms",
	],
	table.map((r) => [
		r.variant,
		r.partition,
		r.category,
		`${r.beforeLostFacts}→${r.afterLostFacts}`,
		`${r.beforePass}→${r.afterPass}`,
		r.costPer1000Usd.toFixed(4),
		r.writerCostPer1000Usd.toFixed(4),
		Math.round(r.p50Ms),
	]),
)}\n${mdTable(
	["Category", "Winner", "Strict automatic leader (pending ratings)", "Pair USD/1,000", "p50 ms"],
	winners.map((r) => [
		r.category,
		"NONE",
		r.strictAutomaticLeader ?? "NONE",
		r.costPer1000Usd?.toFixed(4) ?? "N/A",
		r.p50Ms === null ? "N/A" : Math.round(r.p50Ms),
	]),
)}\nNo winner can satisfy the requested fidelity band or tie-break without owner ratings. Current decision.ts treats fidelity as advisory; this report does not silently change it or assert the requested band is met.\n\nEvery hit, literal output, example and saved verifier reason: lexical-lost-fact-audit.json. Changed lexical rules: bounded Arabic clitics/article, preserved negators, no Arabic suffix stemming, orthographic variants and explicit date/token boundaries. Translations and synonyms are not invented.\n\nControls: ${control.checked}/${control.checked}; checks: ${JSON.stringify(checks)}.\n`;
await mkdir(out, { recursive: true });
await writeFile(
	join(out, "lexical-lost-fact-results.json"),
	JSON.stringify(
		{
			...after,
			lexicalRescore: {
				source: basename(source),
				sourceSha256: audit.sourceSha256,
				scorerSha256: audit.scorerSha256,
				offline: true,
			},
		},
		null,
		2,
	),
);
await writeFile(join(out, "lexical-lost-fact-audit.json"), JSON.stringify(audit, null, 2));
await writeFile(join(out, "lexical-lost-fact-report.md"), report);
await writeFile(join(out, "lexical-lost-fact-controls.json"), JSON.stringify(control, null, 2));
const privateData = identityMapping(after);
await writeFile(join(out, "lexical-lost-fact-report.html"), await renderReport(after, { ...privateData, control }));
await writeFile(join(out, "lexical-lost-fact-identities.private.json"), JSON.stringify(privateData, null, 2));
const command = `PATH=~/.nvm/versions/node/v24.22.1/bin:$PATH pnpm --filter @reactive-resume/tooling exec node --import tsx evaluations/review/lexical-lost-fact-replay-cli.ts --source ${JSON.stringify(source)} -o ${JSON.stringify(out)}`;
const n = (calls: BenchmarkArtifact["calls"]) => calls.reduce((s, c) => s + (c.lexicalLostFacts?.length ?? 0), 0);
const passedGroups = (rows: typeof beforeScores) => rows.filter((s) => s.dimension === "category" && s.pass).length;
const final = [
	`Causes: ${causes.map((c) => `${c.cause}=${c.hits}`).join("; ")}; full cross-check/examples: lexical-lost-fact-audit.json.`,
	`Fix: bounded clitics/article + Arabic orthography + number/word boundaries + explicit month/year dates; negation/genuine losses preserved; ${causes.find((c) => c.cause === "unmatched paraphrase/translation")?.hits} paraphrase/translation gaps remain lexical misses.`,
	`Before/after: lexical lostFacts ${n(before.calls)}→${n(after.calls)}; category-group pass ${passedGroups(beforeScores)}/88→${passedGroups(after.scores)}/88; complete variant×category×partition lostFacts/pass/cost/p50 table: lexical-lost-fact-report.md.`,
	`Winners: ${winners.map((w) => `${w.category}=NONE (strict automatic ${w.strictAutomaticLeader ?? "NONE"}, USD/1,000=${w.costPer1000Usd?.toFixed(4) ?? "N/A"}, p50=${w.p50Ms === null ? "N/A" : Math.round(w.p50Ms)}ms)`).join("; ")}; owner ratings/band pending.`,
	`Offline owner command (no key): ${command}; open lexical-lost-fact-report.html locally for blind ratings, keep lexical-lost-fact-identities.private.json private until rated.`,
	`Tests: controls ${control.checked}/${control.checked}; ${JSON.stringify(checks)}; TDD receipts in validation logs; no inference, .env reads, staging, commits or payload.ts edits.`,
];
await writeFile(join(out, "lexical-lost-fact-final.txt"), final.join("\n") + "\n");
