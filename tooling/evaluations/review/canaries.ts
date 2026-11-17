import type { ModelConfig } from "./config";
import type { TaskCase } from "./contracts/types";
import type { RawRecord } from "./runner";
import type { RunOptions } from "./runner";
import { createHash } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Budget, withOpenRouterFee } from "./budget";
import { loadModels } from "./config";
import { getTaskContract } from "./contracts";
import { loadTaskFixtures } from "./contracts/fixtures";
import { jobEvidenceSchema } from "./contracts/job-evidence/contract";
import { tasksVerifierSchema } from "./contracts/verifier/schema";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { dispatchLimits, ProviderDispatch } from "./dispatch";
import {
	REJECTION_JUDGMENTS,
	REJECTION_VOTE_POLICY,
	rejectionTargets,
	mergeScopedJudgment,
	voteRejections,
	type RejectionVote,
} from "./rejection-vote";
import { required } from "./required";
import { reserveTransportRetry } from "./retry-reservation";
import { routeFor, verifierModelFor } from "./runner";
import { returnedProvider } from "./study";
import { verifierBound, verifyBenchmark } from "./verifier";
import { rawVerifierProtocolRates } from "./verifier-protocol";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const loadJudgeCanaries = (): TaskCase[] =>
	loadTaskFixtures([new URL("./contracts/canaries.json", import.meta.url).pathname]);

/** Slim decision lane: 18 cells × (honest gold + 3 defects), DeepSeek low/Together only.
 * Luna probes are omitted to keep the paid plan at 72; this does not calibrate Luna as a judge.
 * Derived probes never mutate the fixture/approval envelope.
 */
export function planJudgeCanaries(models: ModelConfig[], catalog?: ModelConfig[]) {
	const writer = required(
		models.find((m) => m.provider === "openai") ?? loadModels().find((m) => m.provider === "openai"),
	);
	const model = verifierModelFor(writer, catalog);
	return loadJudgeCanaries()
		.filter((c) => models.some((model) => !model.categories || model.categories.includes(c.category)))
		.flatMap((c) => {
			const priority = {
				summary: "invented-skill",
				"job-evidence": "unsupported-supported",
				tailoring: "job-only-keyword",
				translation: "wrong-hijri-year",
				"cover-letter": "job-only-keyword",
				"interview-prep": "escalation",
			}[c.category];
			let specific: unknown;
			if (c.category === "summary") {
				specific = required(c.mutants.find((m) => m.id === "job-only-keyword")).output;
			} else if (c.category === "job-evidence") {
				const output = jobEvidenceSchema.parse(structuredClone(c.gold));
				const target = required(output.requirements.find((r) => r.verdict === "no_evidence"));
				target.verdict = "supported";
				target.evidenceIds = [required(c.cv[0]).id];
				target.explanation = required(c.jobAd?.segments.find((s) => target.spanIds.includes(s.id))).text;
				specific = output;
			} else specific = required(c.mutants.find((m) => m.id === priority)).output;
			return [
				{ id: "gold", output: c.gold, expect: "honest" },
				...["invented-metric", "dropped-negation"].map((id) => required(c.mutants.find((m) => m.id === id))),
				{ id: priority, output: specific, expect: "unsafe" },
			].map((probe) => ({
				key: hash([model.model, model.provider, model.reasoning, c.id, probe.id]),
				model,
				c,
				defect: probe.id,
				output: probe.output as Record<string, unknown>,
				expectedAccepted: probe.expect === "honest",
			}));
		});
}
type CanaryResult = {
	rawJudgments?: RawRecord[];
	judgments?: import("./verifier").VerifierJudgment[];
	rejectionVote?: RejectionVote | null;
	voteFault?: string | null;
	pendingReservation?: { router: number; openai: number };
	key: string;
	caseId: string;
	category: TaskCase["category"];
	language: TaskCase["language"];
	defect: string;
	judge: { model: string; provider: string; reasoning: string };
	outcome: string;
	provider: string | null;
	verdict: unknown;
	openRouterMicros: number;
	openaiMicros: number;
	verifierFaultRetries?: number;
	attempts?: {
		judgments?: import("./verifier").VerifierJudgment[];
		rawJudgments?: RawRecord[];
		outcome: string;
		provider: string | null;
		verdict: unknown;
		openRouterMicros: number;
		openaiMicros: number;
	}[];
};
export type JudgeCanaryReceipt = {
	version: 1;
	votePolicy?: string;
	studyHash: string;
	planHash: string;
	mode: "fake" | "live";
	results: CanaryResult[];
	openRouterMicros: number;
	openaiMicros: number;
	recall: number;
	honestFalseRejects: number;
	rawHonestFalseRejects?: number;
	rawHonestFalseRejectRate?: number;
	finalHonestFalseRejectRate?: number;
	verifierRecall?: number;
	verifierHonestFalseRejects?: number;
	protocolFaults?: number;
	protocolFaultRate?: number;
};
type Binding = { studyHash: string; models: ModelConfig[]; mode: "fake" | "live" };

/** Atomic durable replacement: a crash leaves either the old or new complete checkpoint. */
async function writeJudgeCanaries(path: string, receipt: JudgeCanaryReceipt) {
	const temporary = `${path}.tmp`;
	const file = await open(temporary, "w");
	try {
		await file.writeFile(JSON.stringify(receipt, null, 2));
		await file.sync();
	} finally {
		await file.close();
	}
	await rename(temporary, path);
	const directory = await open(dirname(path), "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

/** Exclusive read/dispatch/write scope prevents two resume processes from buying the same probe. */
export async function runJudgeCanaryFile(
	path: string,
	input: Omit<Parameters<typeof runJudgeCanaries>[0], "previous" | "onProgress">,
) {
	const lock = await open(`${path}.lock`, "wx").catch((error: NodeJS.ErrnoException) => {
		if (error.code === "EEXIST") throw new Error("CANARY_LOCKED");
		throw error;
	});
	try {
		const previous = await readFile(path, "utf8")
			.then((text) => JSON.parse(text) as JudgeCanaryReceipt)
			.catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
				return undefined;
			});
		return await runJudgeCanaries({
			...input,
			...(previous ? { previous } : {}),
			onProgress: (receipt) => writeJudgeCanaries(path, receipt),
		});
	} finally {
		await lock.close();
		await unlink(`${path}.lock`);
	}
}
const planHash = (plan: ReturnType<typeof planJudgeCanaries>) =>
	hash({
		version: 1,
		verifierVersion: tasksVerifier.version,
		prompt: tasksVerifier.systemPrompt,
		probes: plan.map((p) => ({ ...p, model: [p.model.model, p.model.provider, p.model.reasoning] })),
	});
/** Semantic calibration and wire validity are independent; neither can waive the other. */
export function scoreJudgeCanary(probe: ReturnType<typeof planJudgeCanaries>[number], result?: CanaryResult) {
	const contract = getTaskContract(probe.c.category);
	const guard = contract.score(probe.c, contract.outputSchema.parse(probe.output), null);
	const guardRejected = !guard.safetyDeterministic.pass;
	const pipeline = (caught: boolean, falseReject: boolean) => ({
		guardRejected,
		guardReasons: guard.safetyDeterministic.reasons,
		pipelineCaught: !probe.expectedAccepted && (guardRejected || caught),
		pipelineFalseReject: probe.expectedAccepted && (guardRejected || falseReject),
	});
	const empty = (fault: string) => ({
		caught: false,
		falseReject: false,
		reasons: [] as string[],
		fault,
		...pipeline(false, false),
		pipelineCaught: false,
		pipelineFalseReject: false,
	});
	if (!result || returnedProvider(result.provider ?? "") !== probe.model.provider) return empty("CANARY_UNAVAILABLE");
	if (result.voteFault) return empty(result.voteFault);
	if (result.outcome === "truncated") return empty("VERIFIER_TRUNCATED");
	if (result.outcome === "invalid") return empty("INVALID_VERIFIER_OUTPUT");
	if (result.outcome !== "valid") return empty("CANARY_UNAVAILABLE");
	const parsed = tasksVerifierSchema.safeParse(result.verdict);
	if (!parsed.success) return empty("INVALID_VERIFIER_OUTPUT");
	const verdict = parsed.data;
	const fault = tasksVerifier.auditFault(probe.c, probe.output, verdict);
	const gold = contract.outputSchema.parse(probe.c.gold) as Record<string, unknown>;
	const claims = contract.claims(probe.c, probe.output);
	const goldClaims = contract.claims(probe.c, gold);
	const context = contract.verifierContext(probe.c, probe.output);
	const goldContext = contract.verifierContext(probe.c, gold);
	const changedClaims = new Set(
		claims.filter((c) => !goldClaims.some((g) => isDeepStrictEqual(c, g))).map((c) => c.id),
	);
	const questions = (output: Record<string, unknown>) =>
		(output.questions ?? []) as { id: string; text?: string; prompt?: string }[];
	const changedPremises = new Set(
		questions(probe.output)
			.filter((q) => !questions(gold).some((g) => isDeepStrictEqual(q, g)))
			.map((q) => `question:${q.id}`),
	);
	const reasons: string[] = [];
	let caught = false;
	for (const v of verdict.verdicts) {
		if (!claims.some((c) => c.id === v.claimId) || v.verdict === "supported") continue;
		reasons.push(`claim:${v.claimId}:${v.verdict}`);
		caught ||= changedClaims.has(v.claimId);
	}
	for (const p of verdict.premises) {
		if (!questions(probe.output).some((q) => `question:${q.id}` === p.id)) continue;
		if (["supported", "no_candidate_premise"].includes(p.verdict)) continue;
		reasons.push(`premise:${p.id}:${p.verdict}`);
		caught ||= changedPremises.has(p.id);
	}
	for (const a of verdict.absence) {
		const check = context.absenceChecks.find((c) => c.id === a.id);
		if (!check || a.verdict === "confirmed_absent") continue;
		reasons.push(`absence:${a.id}:${a.verdict}`);
		caught ||= !goldContext.absenceChecks.some((g) => isDeepStrictEqual(check, g));
	}
	if (context.retention === "applicable" && verdict.retention && verdict.retention.status !== "retained") {
		reasons.push(`retention:${verdict.retention.status}`);
		caught = true;
	}
	if (verdict.coverage.status !== "complete") {
		reasons.push(`coverage:${verdict.coverage.status}`);
		caught = true;
	}
	return {
		caught: !probe.expectedAccepted && caught,
		falseReject: probe.expectedAccepted && reasons.length > 0,
		reasons,
		fault,
		...pipeline(caught, reasons.length > 0),
	};
}
function summarize(receipt: JudgeCanaryReceipt, plan: ReturnType<typeof planJudgeCanaries>) {
	const scores = plan.map((probe) =>
		scoreJudgeCanary(
			probe,
			receipt.results.find((r) => r.key === probe.key),
		),
	);
	const validDefects = scores.filter((s, i) => !plan[i]?.expectedAccepted && !s.fault).length;
	const defects = plan.filter((p) => !p.expectedAccepted).length;
	receipt.recall = validDefects ? scores.filter((s) => !s.fault && s.caught).length / validDefects : 0;
	receipt.honestFalseRejects = scores.filter((s) => s.pipelineFalseReject).length;
	const honest = plan.filter((p) => p.expectedAccepted);
	receipt.rawHonestFalseRejects = honest.filter(
		(p) => scoreJudgeCanary(p, firstJudgment(receipt.results.find((r) => r.key === p.key))).pipelineFalseReject,
	).length;
	receipt.rawHonestFalseRejectRate = receipt.rawHonestFalseRejects / honest.length;
	receipt.finalHonestFalseRejectRate = receipt.honestFalseRejects / honest.length;
	receipt.verifierRecall = scores.filter((s) => s.caught).length / defects;
	receipt.verifierHonestFalseRejects = scores.filter((s) => s.falseReject).length;
	receipt.protocolFaults = scores.filter((s) => s.fault).length;
	receipt.protocolFaultRate = receipt.protocolFaults / plan.length;
}
/** Owner Sayed, D39: one in six honest probes, rounded down (3 of 18). */
export const MAX_CANARY_HONEST_FALSE_REJECT_RATE = 1 / 6;
function firstJudgment(row: CanaryResult | undefined): CanaryResult | undefined {
	const first = row?.judgments?.[0];
	return row && first
		? {
				...row,
				verdict: first.normalizedVerdict ?? first.verdict,
				voteFault: first.fault,
				outcome: first.outcome,
				provider: first.provider,
			}
		: row;
}
export function judgeCanaryCalibration(
	receipt: JudgeCanaryReceipt,
	plan = planJudgeCanaries(loadModels(new URL("./models-tasks.json", import.meta.url).pathname)),
) {
	const outcomes = (probes: ReturnType<typeof planJudgeCanaries>) => {
		const scored = probes.map((p) => ({
			honest: p.expectedAccepted,
			...scoreJudgeCanary(
				p,
				receipt.results.find((r) => r.key === p.key),
			),
		}));
		return {
			honestAccepted: scored.filter((s) => s.honest && !s.fault && !s.pipelineFalseReject).length,
			honestRejected: scored.filter((s) => s.honest && s.pipelineFalseReject).length,
			honestProtocolFaults: scored.filter((s) => s.honest && s.fault).length,
			defectProbes: scored.filter((s) => !s.honest).length,
			defectProtocolFaults: scored.filter((s) => !s.honest && s.fault).length,
			defectValidVerdicts: scored.filter((s) => !s.honest && !s.fault).length,
			defectCaught: scored.filter((s) => !s.honest && !s.fault && s.pipelineCaught).length,
			defectNotCaught: scored.filter((s) => !s.honest && !s.fault && !s.pipelineCaught).length,
		};
	};
	const audited = structuredClone(receipt);
	summarize(audited, plan);
	const honest = plan.filter((p) => p.expectedAccepted);
	const rawFalse = honest.filter(
		(p) => scoreJudgeCanary(p, firstJudgment(receipt.results.find((r) => r.key === p.key))).pipelineFalseReject,
	).length;
	const byCategoryLanguage = [...new Set(honest.map((p) => `${p.c.category}/${p.c.language}`))].map((key) => {
		const probes = plan.filter((p) => `${p.c.category}/${p.c.language}` === key);
		const controls = probes.filter((p) => p.expectedAccepted);
		const raw = controls.filter(
			(p) => scoreJudgeCanary(p, firstJudgment(receipt.results.find((r) => r.key === p.key))).pipelineFalseReject,
		).length;
		const final = controls.filter(
			(p) =>
				scoreJudgeCanary(
					p,
					receipt.results.find((r) => r.key === p.key),
				).pipelineFalseReject,
		).length;
		const voted = probes.flatMap((p) => {
			const r = receipt.results.find((r) => r.key === p.key);
			return r?.rejectionVote ? [r.rejectionVote] : [];
		});
		return {
			...outcomes(probes),
			category: required(controls[0]).c.category,
			language: required(controls[0]).c.language,
			honestProbes: controls.length,
			honestFalseRejects: final,
			honestFalseRejectRate: final / controls.length,
			rawHonestFalseRejects: raw,
			rawHonestFalseRejectRate: raw / controls.length,
			finalHonestFalseRejectRate: final / controls.length,
			rejudgedProbes: voted.length,
			unanimousProbes: voted.filter((v) => v.agreement).length,
			agreementRate: voted.length ? voted.filter((v) => v.agreement).length / voted.length : null,
		};
	});
	return {
		...outcomes(plan),
		votePolicy: receipt.votePolicy ?? "single-judgment-legacy",
		rawVerifierProtocol: rawVerifierProtocolRates(receipt.results),
		honestFalseRejects: audited.honestFalseRejects,
		honestProbes: honest.length,
		honestFalseRejectRate: audited.honestFalseRejects / honest.length,
		rawHonestFalseRejects: rawFalse,
		rawHonestFalseRejectRate: rawFalse / honest.length,
		finalHonestFalseRejectRate: audited.honestFalseRejects / honest.length,
		allowedHonestFalseRejects: Math.floor(honest.length * MAX_CANARY_HONEST_FALSE_REJECT_RATE),
		recall: audited.recall,
		verifierRecall: audited.verifierRecall,
		protocolFaultRate: audited.protocolFaultRate ?? null,
		protocolFaultProbes: plan.flatMap((p) => {
			const row = receipt.results.find((r) => r.key === p.key);
			const fault = scoreJudgeCanary(p, row).fault;
			return fault
				? [
						{
							key: p.key,
							category: p.c.category,
							language: p.c.language,
							defect: p.defect,
							honest: p.expectedAccepted,
							fault,
							retries: row?.verifierFaultRetries ?? 0,
						},
					]
				: [];
		}),
		recallDenominator: "valid-planted-verdicts; exhausted protocol faults remain in the 10% fault gate",
		byCategoryLanguage,
	};
}
function auditRecordedVotes(receipt: JudgeCanaryReceipt) {
	if (receipt.votePolicy !== REJECTION_VOTE_POLICY) return;
	for (const row of receipt.results) {
		const first = required(row.judgments?.[0]);
		if (first.fault || first.outcome !== "valid") {
			if (!row.voteFault && row.outcome === "valid") throw new Error("VERIFIER_VOTE_RESULT_MISMATCH");
			continue;
		}
		const initial = first.normalizedVerdict ?? first.verdict;
		const targets = rejectionTargets(initial);
		const judgments = required(row.judgments);
		if (judgments.length < 1 || judgments.length > REJECTION_JUDGMENTS || (!targets.length && judgments.length !== 1))
			throw new Error("INCOMPLETE_CANARY_VOTE");
		const repeats = judgments
			.slice(1)
			.map((j) =>
				j.fault || j.outcome !== "valid"
					? null
					: mergeScopedJudgment(initial, j.normalizedVerdict ?? j.verdict, targets),
			);
		const vote = targets.length ? voteRejections(initial, repeats) : null;
		if (targets.length && !vote?.complete) {
			if (!row.voteFault || !judgments.some((j) => j.fault || j.outcome !== "valid"))
				throw new Error("INCOMPLETE_CANARY_VOTE");
			continue;
		}
		if (row.voteFault || !isDeepStrictEqual(row.verdict, vote?.verdict ?? initial))
			throw new Error("CANARY_VOTE_MISMATCH");
	}
}

const MAX_CANARY_PROTOCOL_FAULT_RATE = 0.1;
const MAX_CANARY_VERIFIER_FAULT_RETRIES = 1;
/** Re-audit raw verdicts and exact probe coverage. Summary numbers alone never qualify a full study. */
export function assertJudgeCanaries(raw: unknown, binding: Binding) {
	try {
		const receipt = structuredClone(raw) as JudgeCanaryReceipt;
		const plan = planJudgeCanaries(binding.models);
		if (
			!receipt ||
			receipt.version !== 1 ||
			receipt.studyHash !== binding.studyHash ||
			receipt.mode !== binding.mode ||
			receipt.planHash !== planHash(plan) ||
			receipt.results.length !== plan.length ||
			new Set(receipt.results.map((r) => r.key)).size !== plan.length ||
			plan.some((p) => !receipt.results.some((r) => r.key === p.key))
		)
			throw new Error("coverage");
		auditRecordedVotes(receipt);
		summarize(receipt, plan);
		if (
			plan.some((p) => {
				const row = receipt.results.find((r) => r.key === p.key);
				const fault = scoreJudgeCanary(p, row).fault;
				return (
					fault &&
					(fault === "CANARY_UNAVAILABLE" || !row || row.verifierFaultRetries !== MAX_CANARY_VERIFIER_FAULT_RETRIES)
				);
			}) ||
			(receipt.protocolFaultRate ?? 1) > MAX_CANARY_PROTOCOL_FAULT_RATE
		)
			throw new Error("protocol");
		const maxHonestFalseRejects = Math.floor(
			plan.filter((p) => p.expectedAccepted).length * MAX_CANARY_HONEST_FALSE_REJECT_RATE,
		);
		if (receipt.recall !== 1 || receipt.honestFalseRejects > maxHonestFalseRejects) throw new Error("calibration");
	} catch {
		throw new Error("JUDGE_CANARY_GATE");
	}
}
/** Conservative reservation bound also covers legacy probe retries and bounded transport retries. */
export function forecastJudgeCanaries(models: ModelConfig[], catalog?: ModelConfig[]) {
	const plan = planJudgeCanaries(models, catalog);
	const bounds = plan.map((p) => {
		const route = routeFor(p.model, "unused", true, p.c);
		const micros =
			verifierBound(p.model, p.c, route).micros * REJECTION_JUDGMENTS * 5 * (1 + MAX_CANARY_VERIFIER_FAULT_RETRIES);
		return {
			openRouterMicros: p.model.provider === "openai" ? 0 : withOpenRouterFee(micros),
			openaiMicros: p.model.provider === "openai" ? micros : 0,
		};
	});
	return {
		calls: plan.length,
		expectedJudgments: plan.length + 2 * (plan.filter((p) => !p.expectedAccepted).length + 2),
		maxJudgments: plan.length * REJECTION_JUDGMENTS,
		maxAttempts: 5 * (1 + MAX_CANARY_VERIFIER_FAULT_RETRIES),
		maxVerifierAttempts: 1 + MAX_CANARY_VERIFIER_FAULT_RETRIES,
		openRouterCeilingUsd: bounds.reduce((n, b) => n + b.openRouterMicros, 0) / 1e6,
		openaiCeilingUsd: bounds.reduce((n, b) => n + b.openaiMicros, 0) / 1e6,
	};
}

/** No writer inference; deterministic guard scoring is local. Persist a held reservation BEFORE dispatch; interrupted unknown probes fail closed. */
export async function runJudgeCanaries(input: {
	phase: "smoke" | "full";
	studyHash: string;
	options: RunOptions;
	previous?: JudgeCanaryReceipt;
	onProgress?: (receipt: JudgeCanaryReceipt) => Promise<void>;
}): Promise<JudgeCanaryReceipt | null> {
	if (input.phase !== "smoke") return null;
	const { options } = input;
	if (!options.fake && !options.key) throw new Error("KEY_REQUIRED");
	const plan = planJudgeCanaries(options.models, options.verifierModels);
	const identity = planHash(plan);
	const receipt: JudgeCanaryReceipt = input.previous
		? structuredClone(input.previous)
		: {
				version: 1,
				votePolicy: REJECTION_VOTE_POLICY,
				studyHash: input.studyHash,
				planHash: identity,
				mode: options.fake ? "fake" : "live",
				results: [],
				openRouterMicros: 0,
				openaiMicros: 0,
				recall: 0,
				honestFalseRejects: 0,
			};
	if (
		receipt.version !== 1 ||
		receipt.studyHash !== input.studyHash ||
		receipt.planHash !== identity ||
		receipt.mode !== (options.fake ? "fake" : "live")
	)
		throw new Error("JUDGE_CANARY_GATE");
	if (
		receipt.results.some(
			(r) =>
				r.outcome === "billing-unknown" ||
				(r.outcome === "pending" && (!r.pendingReservation || !r.rawJudgments?.length)),
		)
	)
		throw new Error("CANARY_UNSETTLED");
	if (
		new Set(receipt.results.map((r) => r.key)).size !== receipt.results.length ||
		receipt.results.some((r) => !plan.some((p) => p.key === r.key))
	)
		throw new Error("JUDGE_CANARY_GATE");
	for (const payer of ["openRouterMicros", "openaiMicros"] as const) {
		if (
			receipt.results.some((r) => !Number.isSafeInteger(r[payer]) || r[payer] < 0) ||
			receipt[payer] !== receipt.results.reduce((sum, r) => sum + r[payer], 0)
		)
			throw new Error("JUDGE_CANARY_GATE");
	}
	const router = new Budget(Math.floor(options.budgetUsd * 1e6));
	const openai = new Budget(Math.floor((options.openaiBudgetUsd ?? 10) * 1e6));
	router.reserve(
		(options.priorSpendMicros ?? 0) +
			receipt.openRouterMicros +
			receipt.results.reduce((n, r) => n + (r.pendingReservation?.router ?? 0), 0),
	);
	openai.reserve(
		(options.priorOpenaiSpendMicros ?? 0) +
			receipt.openaiMicros +
			receipt.results.reduce((n, r) => n + (r.pendingReservation?.openai ?? 0), 0),
	);
	const limits = dispatchLimits(options);
	const canaryConcurrency = Math.min(limits.sessionConcurrency, limits.openaiConcurrency, limits.togetherConcurrency);
	let failure: unknown;
	const pool = new ProviderDispatch(limits, () => Boolean(failure));
	let persistence = Promise.resolve();
	const persist = () => {
		const snapshot = structuredClone(receipt);
		persistence = persistence.then(() => input.onProgress?.(snapshot));
		return persistence;
	};
	const queue = plan.filter((p) => {
		const row = receipt.results.find((r) => r.key === p.key);
		return (
			!row ||
			(row.outcome === "pending" && Boolean(row.pendingReservation && row.rawJudgments?.length)) ||
			(options.recoverSystemic &&
				(row.outcome === "ACCOUNT_ERROR" ||
					(row.outcome === "transient" && row.openRouterMicros === 0 && row.openaiMicros === 0))) ||
			(scoreJudgeCanary(p, row).fault !== null &&
				["valid", "truncated", "invalid"].includes(row.outcome) &&
				returnedProvider(row.provider ?? "") === p.model.provider &&
				(row.verifierFaultRetries ?? 0) < MAX_CANARY_VERIFIER_FAULT_RETRIES)
		);
	});
	const active = new Set<Promise<void>>();
	const providers = new Map<string, number>();
	const execute = async (probe: (typeof plan)[number]) => {
		const route = routeFor(probe.model, options.key ?? "fake-key", true, probe.c);
		const bound = verifierBound(probe.model, probe.c, route).micros * REJECTION_JUDGMENTS;
		let row = receipt.results.find((r) => r.key === probe.key);
		if (!row) {
			row = {
				key: probe.key,
				caseId: probe.c.id,
				category: probe.c.category,
				language: probe.c.language,
				defect: probe.defect,
				judge: { model: probe.model.model, provider: probe.model.provider, reasoning: probe.model.reasoning },
				outcome: "pending",
				provider: null,
				verdict: null,
				openRouterMicros: 0,
				openaiMicros: 0,
				verifierFaultRetries: 0,
				attempts: [],
			};
			receipt.results.push(row);
		} else if (!row.pendingReservation) {
			// Preserve the paid legacy verdict and cost before spending its one protocol retry.
			row.attempts ??= [
				{
					outcome: row.outcome,
					provider: row.provider,
					verdict: row.verdict,
					openRouterMicros: row.openRouterMicros,
					openaiMicros: row.openaiMicros,
				},
			];
			row.verifierFaultRetries =
				(row.verifierFaultRetries ?? 0) + Number(["valid", "invalid", "truncated"].includes(row.outcome));
			const settledJudgments = row.judgments?.flatMap((j) => j.attempts ?? [j]);
			const hasReusableJudgments =
				row.outcome === "valid" || settledJudgments?.some((j) => j.fault || j.outcome !== "valid");
			row.rawJudgments = (row.rawJudgments ?? []).filter(
				(raw) =>
					hasReusableJudgments &&
					settledJudgments?.some((j) => j.key === raw.key && ["valid", "invalid", "truncated"].includes(j.outcome)),
			);
		}
		while (true) {
			const resuming = row.pendingReservation;
			let heldRouter = resuming?.router ?? (probe.model.provider === "openai" ? 0 : withOpenRouterFee(bound));
			let heldOpenai = resuming?.openai ?? (probe.model.provider === "openai" ? bound : 0);
			if (!resuming) {
				if (router.consumed + heldRouter > router.capMicros || openai.consumed + heldOpenai > openai.capMicros)
					throw new Error("BUDGET_LIMIT");
				router.reserve(heldRouter);
				openai.reserve(heldOpenai);
				row.outcome = "pending";
				row.pendingReservation = { router: heldRouter, openai: heldOpenai };
				await persist();
			}
			const held = {
				key: probe.key,
				reservedMicros: heldRouter + heldOpenai,
				reservedOpenRouterMicros: heldRouter,
				reservedOpenaiMicros: heldOpenai,
			};
			const judged = await verifyBenchmark({
				reserveRetry: (provider, micros) =>
					reserveTransportRetry({
						router,
						openai,
						held,
						provider,
						micros,
						persist: async (r) => {
							heldRouter = r.reservedOpenRouterMicros;
							heldOpenai = r.reservedOpenaiMicros;
							row.pendingReservation = { router: heldRouter, openai: heldOpenai };
							await persist();
						},
					}).catch((error: unknown) => {
						failure ??= error;
						throw error;
					}),
				options: {
					...options,
					onRaw: async (raw) => {
						row.rawJudgments ??= [];
						row.rawJudgments.push(raw);
						await persist();
						await options.onRaw?.(raw);
					},
				},
				cachedJudgments: row.rawJudgments ?? [],
				stopped: () => Boolean(failure),
				pool,
				model: probe.model,
				c: probe.c,
				route,
				output: probe.output,
				parentKey: `canary:${probe.key}`,
				runIndex: 0,
				promptHash: identity,
				fixtureHash: hash(probe.c),
			});
			const routerCost =
				judged.result.openRouterCostMicros === null
					? null
					: judged.result.openRouterCostMicros - (resuming ? 0 : judged.reusedCosts.openRouterMicros);
			const openaiCost =
				judged.result.openaiCostMicros === null
					? null
					: judged.result.openaiCostMicros - (resuming ? 0 : judged.reusedCosts.openaiMicros);
			const paidRouter = routerCost ?? 0;
			const paidOpenai = openaiCost ?? 0;
			router.settle(heldRouter, routerCost);
			openai.settle(heldOpenai, openaiCost);
			row.outcome = routerCost === null || openaiCost === null ? "billing-unknown" : judged.result.outcome;
			row.provider = judged.provider;
			row.verdict = judged.verdict;
			row.judgments = judged.judgments;
			row.rejectionVote = judged.rejectionVote;
			row.voteFault = judged.fault;
			if (routerCost !== null && openaiCost !== null) delete row.pendingReservation;
			row.openRouterMicros += paidRouter;
			row.openaiMicros += paidOpenai;
			receipt.openRouterMicros += paidRouter;
			receipt.openaiMicros += paidOpenai;
			row.attempts?.push({
				outcome: row.outcome,
				provider: row.provider,
				verdict: row.verdict,
				openRouterMicros: paidRouter,
				openaiMicros: paidOpenai,
				judgments: judged.judgments,
				rawJudgments: structuredClone(row.rawJudgments ?? []),
			});
			await persist();
			if (judged.boundedProtocolRetryExhausted) {
				row.verifierFaultRetries = MAX_CANARY_VERIFIER_FAULT_RETRIES;
				await persist();
				break;
			}
			if (["ACCOUNT_ERROR", "PAYER_MISMATCH", "SYSTEMIC_REQUEST_ERROR"].includes(row.outcome)) {
				failure = new Error(row.outcome);
				break;
			}
			if (
				!judged.fault ||
				!["valid", "truncated", "invalid"].includes(row.outcome) ||
				(row.verifierFaultRetries ?? 0) >= MAX_CANARY_VERIFIER_FAULT_RETRIES ||
				options.signal?.aborted
			)
				break;
			row.verifierFaultRetries = (row.verifierFaultRetries ?? 0) + 1;
			row.rawJudgments = (row.rawJudgments ?? []).filter((raw) =>
				row.judgments
					?.flatMap((j) => j.attempts ?? [j])
					.some((j) => j.key === raw.key && ["valid", "invalid", "truncated"].includes(j.outcome)),
			);
		}
	};
	while (queue.length || active.size) {
		if (!failure && !options.signal?.aborted) {
			for (let i = 0; i < queue.length && active.size < canaryConcurrency;) {
				const probe = queue[i];
				if (!probe) break;
				const provider = probe.model.provider;
				if ((providers.get(provider) ?? 0) >= pool.limit(probe.model)) {
					i++;
					continue;
				}
				const route = routeFor(probe.model, "unused", true, probe.c);
				const bound = verifierBound(probe.model, probe.c, route).micros * REJECTION_JUDGMENTS;
				const fits =
					Boolean(receipt.results.find((r) => r.key === probe.key)?.pendingReservation) ||
					(router.consumed + (provider === "openai" ? 0 : withOpenRouterFee(bound)) <= router.capMicros &&
						openai.consumed + (provider === "openai" ? bound : 0) <= openai.capMicros);
				if (!fits) {
					i++;
					continue;
				}
				queue.splice(i, 1);
				providers.set(provider, (providers.get(provider) ?? 0) + 1);
				const work = execute(probe)
					.catch((error: unknown) => {
						failure ??= error;
					})
					.finally(() => {
						active.delete(work);
						providers.set(provider, (providers.get(provider) ?? 1) - 1);
					});
				active.add(work);
			}
		}
		if (!active.size) break;
		await Promise.race(active);
	}
	if (failure) throw failure;
	summarize(receipt, plan);
	await persist();
	if (options.signal?.aborted) throw new Error("INTERRUPTED");
	if (queue.length) throw new Error("BUDGET_LIMIT");
	return receipt;
}
