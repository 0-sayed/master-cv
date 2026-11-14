import type { BenchmarkCall, RawRecord } from "./runner";
import { createHash } from "node:crypto";
import {
	assertVerification,
	hasReviewEdits,
	verificationClaims,
	reviewVerifierSchema,
} from "@reactive-resume/api/features/ai/review-verifier";
import { cases, evaluateOutput } from "./corpus";
import { required } from "./required";
import { benchmarkCaps } from "./runner";
import { benchmarkInput, verifierAuditFault } from "./verifier";

/** Literal, local re-scoring only. Never fabricates a missing semantic judgment. */
export function rescoreJournal(journal: string) {
	const events = journal
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as { type: string; data: BenchmarkCall & RawRecord });
	const scored = events.filter((e) => e.type === "scored").map((e) => e.data);
	const latest = [...new Map(scored.map((c) => [c.key, c])).values()];
	const writers = new Map(
		events.filter((e) => e.type === "raw" && !e.data.key.endsWith(":verify")).map((e) => [e.data.key, e.data]),
	);
	const capacityRows: {
		key: string;
		category: string;
		inputCodePoints: number;
		inputBytes: number;
		claims: number;
		compactOutputByteBound: number;
		compactCompletionByteBound: number;
		completionCap: number;
		observedVerifierTokens: number | null;
	}[] = [];
	const sessions = latest.map((call) => {
		const raw = writers.get(call.key);
		if (!raw) throw new Error("SAVED_WRITER_REQUIRED");
		const body = JSON.parse(raw.body);
		const literal = body.choices?.[0]?.message?.content ?? "";
		if (literal !== call.output) throw new Error("SAVED_WRITER_MISMATCH");
		const c = required(cases.find((c) => c.id === call.caseId));
		let output: Record<string, unknown> = {};
		try {
			output = JSON.parse(literal);
		} catch {
			/* A truncated writer is data, not a constructed verifier input. */
		}
		const evaluation = evaluateOutput(c, output);
		const needsReverification: string[] = [];
		const verdict = reviewVerifierSchema.safeParse(
			call.verifierVerdict && typeof call.verifierVerdict === "object"
				? Object.fromEntries(Object.entries(call.verifierVerdict).filter(([k]) => k !== "usefulness"))
				: null,
		);
		const fault =
			call.verifierFault ??
			(evaluation.schemaValid && call.verifierVerdict
				? verifierAuditFault(c, { ...output, questions: [] }, call.verifierVerdict)
				: null);
		if (fault) needsReverification.push(fault);
		if (evaluation.schemaValid && Array.isArray(output.questions) && output.questions.length)
			needsReverification.push("question-premises-not-independently-verified");
		const edited = hasReviewEdits(output);
		// Claims were present historically, but the response omitted both candidates and proposals.
		const incompleteResponse =
			evaluation.schemaValid &&
			((Array.isArray(output.candidates) && output.candidates.length > 0) ||
				(Array.isArray(output.proposals) && output.proposals.length > 0));
		if (incompleteResponse) needsReverification.push("incomplete-response-payload");
		if (edited && verdict.success && verdict.data.factRetention.status === "not_applicable")
			needsReverification.push("retention-not-applicable-with-edits");
		if (evaluation.schemaValid && !call.verifierVerdict) needsReverification.push("verifier-unavailable");
		let savedSafety: boolean | null = null;
		let savedQuality: boolean | null = null;
		if (evaluation.schemaValid && !fault && verdict.success) {
			try {
				assertVerification({ ...output, questions: [] }, verdict.data);
				savedSafety = evaluation.guardAccepted && !evaluation.score?.unsupportedClaims.length;
			} catch {
				savedSafety = false;
			}
			savedQuality = ["appropriate", "no_change_needed"].includes(verdict.data.responseAssessment.status);
		}
		if (!evaluation.schemaValid) savedSafety = false;
		if (evaluation.schemaValid) {
			const input = benchmarkInput(c, output);
			const claims = verificationClaims(output);
			const compact = {
				schemaVersion: 3,
				responseAssessment: { status: "inappropriate", reason: "界".repeat(100) },
				factRetention: {
					status: "not_applicable",
					evidenceIds: [...new Set(claims.flatMap((c) => c.evidenceIds))],
					reason: "界".repeat(100),
				},
				usefulness: { status: "not_applicable", reason: "界".repeat(100) },
				verdicts: claims.map((claim) => ({
					claimId: claim.claimId,
					verdict: "contradicted",
					evidenceIds: claim.evidenceIds,
					reason: "界".repeat(100),
				})),
			};
			const bytes = Buffer.byteLength(JSON.stringify(compact));
			capacityRows.push({
				key: call.key,
				category: c.category,
				inputCodePoints: input.selections.reduce((n, s) => n + [...s.text].length, 0),
				inputBytes: Buffer.byteLength(JSON.stringify(input)),
				claims: claims.length,
				compactOutputByteBound: bytes,
				compactCompletionByteBound: Math.ceil(bytes / 0.8),
				completionCap: benchmarkCaps(call.reasoning, c.category).verifierCompletionTokenCap,
				observedVerifierTokens: call.verifierFault ? null : (call.verifierUsage?.outputTokens ?? null),
			});
		}
		return {
			key: call.key,
			model: call.model,
			provider: call.provider,
			reasoning: call.reasoning,
			category: call.category,
			language: call.language,
			caseId: call.caseId,
			schemaValid: evaluation.schemaValid,
			guardError: evaluation.guardError,
			verifierFault: call.verifierFault ?? null,
			writerTruncated: call.writerTruncated ?? call.truncated,
			before: {
				safety: call.guardAccepted && call.verifierAccepted && !call.score?.unsupportedClaims.length,
				quality:
					call.guardAccepted &&
					call.verifierAccepted &&
					!call.usefulnessMiss &&
					!call.missingQuestion &&
					!call.emptyAnswer,
			},
			after: {
				savedSafety,
				savedQuality,
				safety: needsReverification.length ? null : savedSafety,
				quality: needsReverification.length ? null : savedQuality,
			},
			responseAssessment: verdict.success ? verdict.data.responseAssessment : null,
			qualityDiagnostics: {
				usefulness: (call.verifierVerdict as { usefulness?: unknown } | null)?.usefulness ?? null,
				missingQuestion: evaluation.missingQuestion,
				emptyAnswer: evaluation.emptyAnswer,
			},
			factRetention: verdict.success ? verdict.data.factRetention : null,
			needsReverification,
		};
	});
	const group = new Map<string, typeof sessions>();
	for (const s of sessions) {
		const key = `${s.model}@${s.reasoning}/${s.category}`;
		group.set(key, [...(group.get(key) ?? []), s]);
	}
	const rate = (values: (boolean | null)[]) => {
		const judged = values.filter((v) => v !== null);
		const passed = judged.filter(Boolean).length;
		return {
			passed,
			judged: judged.length,
			pending: values.length - judged.length,
			percent: judged.length ? (passed / judged.length) * 100 : null,
		};
	};
	const table = [...group].map(([group, rows]) => ({
		group,
		sessions: rows.length,
		before: { safety: rate(rows.map((r) => r.before.safety)), quality: rate(rows.map((r) => r.before.quality)) },
		after: {
			savedSafety: rate(rows.map((r) => r.after.savedSafety)),
			savedQuality: rate(rows.map((r) => r.after.savedQuality)),
			safety: rate(rows.map((r) => r.after.safety)),
			quality: rate(rows.map((r) => r.after.quality)),
		},
		needsReverification: rows.filter((r) => r.needsReverification.length).length,
	}));
	return {
		sourceJournalHash: createHash("sha256").update(journal).digest("hex"),
		scoredEvents: scored.length,
		sessions,
		table,
		writerErrors: {
			schema: sessions.filter((s) => !s.schemaValid && !s.writerTruncated).length,
			truncated: sessions.filter((s) => s.writerTruncated).length,
		},
		capacity: {
			schemaValidOutputs: capacityRows.length,
			writerFailuresWithoutVerifierInput: sessions.length - capacityRows.length,
			inputLimitFailures: capacityRows.filter((r) => r.inputCodePoints > 32000),
			compactOutputBudgetFailures: capacityRows.filter((r) => r.compactCompletionByteBound > r.completionCap),
			provesLiveNonTruncation: false,
			basis:
				"UTF-8 byte bound for compact 100-character CJK reasons plus 20% reasoning allocation is a conditional capacity check, not a tokenizer measurement or live completion guarantee. The prompt asks for short reasons but the schema permits longer reasons and model reasoning is not guaranteed. Invalid/truncated writers have no valid verifier input.",
			rows: capacityRows,
		},
	};
}
