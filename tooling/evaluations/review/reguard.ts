import type { BenchmarkCall } from "./runner";
import { createHash } from "node:crypto";
import { cases, evaluateOutput, prepareCase } from "./corpus";
import { sessionPromptHash } from "./repair";
import { fixtureHash } from "./study";
import { verifierAuditFault } from "./verifier";

/** Re-evaluate literal saved output. A guard revision does not change judge input. */
export function reguardCalls(previous: readonly BenchmarkCall[]) {
	const sessions = previous.map((before) => {
		const c = cases.find((c) => c.id === before.caseId);
		if (!c || fixtureHash(c) !== before.fixtureHash) throw new Error("REGUARD_FIXTURE_MISMATCH");
		const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
		const prepared = prepareCase(c);
		if (digest(prepared.payload) !== before.inputDigest || digest(prepared.snapshot.evidence) !== before.sourceDigest)
			throw new Error("REGUARD_WRITER_INPUT_MISMATCH");
		let output: Record<string, unknown> = {};
		try {
			output = JSON.parse(before.output);
		} catch {
			/* Invalid writers stay invalid. */
		}
		const evaluation = evaluateOutput(c, output);
		const changed = before.guardAccepted !== evaluation.guardAccepted;
		const needsReverification: string[] = [];
		if (changed && evaluation.schemaValid) {
			if (before.promptDigest !== sessionPromptHash(c)) needsReverification.push("verifier-input-identity-changed");
			if (!before.verifierVerdict || !before.verifierUsage) needsReverification.push("missing-verifier");
			else {
				const fault = before.verifierFault ?? verifierAuditFault(c, output, before.verifierVerdict);
				if (fault) needsReverification.push(fault);
			}
		}
		const call = {
			...before,
			...evaluation,
			// Preserve adjudicated retention/usefulness and accounting. Only guard,
			// materialized result and lexical diagnostics change in this paired replay.
			noChangeHonest: before.noChangeHonest ?? null,
			usefulnessMiss: before.usefulnessMiss,
			safetyAccepted: Boolean(
				!needsReverification.length &&
				evaluation.guardAccepted &&
				before.verifierAccepted &&
				!evaluation.score?.unsupportedClaims.length,
			),
		};
		return {
			key: before.key,
			caseId: c.id,
			model: before.model,
			reasoning: before.reasoning,
			category: c.category,
			language: c.language,
			holdout: c.holdout,
			before: before.guardAccepted,
			after: evaluation.guardAccepted,
			changed,
			beforeError: before.guardError,
			afterError: evaluation.guardError,
			needsReverification,
			call,
		};
	});
	return { sessions: sessions.map(({ call: _call, ...session }) => session), calls: sessions.map((s) => s.call) };
}
