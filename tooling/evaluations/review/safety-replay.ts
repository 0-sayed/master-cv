import type { TaskCase } from "./contracts/types";
import type { BenchmarkCall } from "./runner";
import { getTaskContract } from "./contracts";
import { tasksVerifierSchema } from "./contracts/verifier/schema";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { required } from "./required";

/** Diagnostic semantic signals survive unrelated protocol faults; never qualify an invalid verdict. */
function semanticReasons(c: TaskCase, output: Record<string, unknown>, raw: unknown): string[] | null {
	const parsed = tasksVerifierSchema.safeParse(raw);
	if (!parsed.success) return null;
	const verdict = parsed.data;
	const contract = getTaskContract(c.category);
	const claims = contract.claims(c, output);
	const context = contract.verifierContext(c, output);
	const questions = (output.questions ?? []) as { id: string }[];
	return [
		...verdict.verdicts
			.filter((v) => claims.some((c) => c.id === v.claimId) && v.verdict !== "supported")
			.map((v) => `claim:${v.claimId}:${v.verdict}`),
		...verdict.premises
			.filter(
				(p) =>
					questions.some((q) => `question:${q.id}` === p.id) &&
					!["supported", "no_candidate_premise"].includes(p.verdict),
			)
			.map((p) => `premise:${p.id}:${p.verdict}`),
		...verdict.absence
			.filter((a) => context.absenceChecks.some((check) => check.id === a.id) && a.verdict !== "confirmed_absent")
			.map((a) => `absence:${a.id}:${a.verdict}`),
		...(context.retention === "applicable" && verdict.retention && verdict.retention.status !== "retained"
			? [`retention:${verdict.retention.status}`]
			: []),
		...(verdict.coverage.status !== "complete" ? [`coverage:${verdict.coverage.status}`] : []),
	];
}

/** Latest saved sessions only. No generation, retries, fabricated judgments or source-file mutations. */
export function rescoreTaskSessions(calls: BenchmarkCall[], fixtures: TaskCase[]) {
	const sessions = [...new Map(calls.map((c) => [c.key, c])).values()].map((call) => {
		const c = required(fixtures.find((c) => c.id === call.caseId));
		let output: Record<string, unknown> = {};
		try {
			output = JSON.parse(call.output);
		} catch {
			/* Truncated writers remain failed data. */
		}
		const contract = getTaskContract(c.category);
		const parsed = contract.outputSchema.safeParse(output);
		const taskScore = parsed.success ? contract.score(c, parsed.data, null) : null;
		const guardRejected = !taskScore?.safetyDeterministic.pass;
		const guardReasons = taskScore?.safetyDeterministic.reasons ?? ["AI_INVALID_RESULT"];
		const verifierFault = parsed.success ? tasksVerifier.auditFault(c, output, call.verifierVerdict) : null;
		const reasons = parsed.success ? semanticReasons(c, output, call.verifierVerdict) : null;
		const semanticRejected = reasons === null ? null : reasons.length > 0;
		const safetyAccepted =
			!guardRejected && !verifierFault && semanticRejected === false && !call.writerProvenanceRejected;
		return {
			key: call.key,
			caseId: c.id,
			category: c.category,
			language: c.language,
			variant: `${call.model}@${call.reasoning} [${call.provider}]`,
			schemaValid: parsed.success,
			guardRejected,
			guardReasons,
			verifierFault,
			verifierFaultRetries: call.verifierFaultRetries ?? 0,
			semanticRejected,
			semanticReasons: reasons,
			safetyAccepted,
			quality: taskScore?.quality ?? null,
			savedVerdict: call.verifierVerdict,
		};
	});
	const groups = [...new Set(sessions.map((s) => `${s.variant} / ${s.category}`))];
	const table = groups.map((group) => {
		const rows = sessions.filter((s) => `${s.variant} / ${s.category}` === group);
		return {
			group,
			observed: rows.length,
			safetyAccepted: rows.filter((s) => s.safetyAccepted).length,
			guardRejects: rows.filter((s) => s.guardRejected).length,
			verifierFaults: rows.filter((s) => s.verifierFault).length,
			semanticRejects: rows.filter((s) => s.semanticRejected).length,
			unknownJudgments: rows.filter((s) => s.semanticRejected === null).length,
		};
	});
	return { sessions, table };
}
