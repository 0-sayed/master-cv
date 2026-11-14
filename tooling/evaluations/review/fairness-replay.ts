import type { BenchmarkCall } from "./runner";
import { cases, evaluateOutput, prepareCase } from "./corpus";
import { fixtureHash } from "./study";

/** Local writer checks only. Old judgments never qualify a changed verifier input. */
export function replayCalls(calls: readonly BenchmarkCall[]) {
	return calls.map((before) => {
		const c = cases.find((c) => c.id === before.caseId);
		if (!c) throw new Error("REPLAY_UNKNOWN_FIXTURE");
		if (fixtureHash(c) !== before.fixtureHash) throw new Error("REPLAY_FIXTURE_MISMATCH");
		let output: unknown = null;
		try {
			output = JSON.parse(before.output);
		} catch {
			/* Invalid JSON remains a structural failure. */
		}
		const parsed = prepareCase(c).handler.output.safeParse(output);
		const after = evaluateOutput(c, output);
		return {
			key: before.key,
			caseId: c.id,
			model: before.model,
			reasoning: before.reasoning,
			category: c.category,
			language: c.language,
			output: before.output,
			...after,
			verifierStatus: "needs-reverification" as const,
			qualification: false,
			modelOutputAvailable: before.output.trim().length > 0,
			schemaIssues: parsed.success ? [] : parsed.error.issues.map(({ path, message }) => ({ path, message })),
			before: {
				schemaValid: before.schemaValid,
				emptyAnswer: before.emptyAnswer,
				noChangeHonest: before.noChangeHonest ?? null,
				fabrications: before.score?.unsupportedClaims.length ?? 0,
			},
		};
	});
}
