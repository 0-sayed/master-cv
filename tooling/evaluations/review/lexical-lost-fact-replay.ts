import type { BenchmarkArtifact } from "./runner";
import { createHash } from "node:crypto";
import { replaceBlockText } from "@reactive-resume/resume/proposals";
import { cases } from "./corpus";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { lexicalLostFacts } from "./score";
import { fixtureHash } from "./study";

export function rescoreLexical(artifact: BenchmarkArtifact) {
	const calls = artifact.calls.map((before) => {
		const c = cases.find((c) => c.id === before.caseId);
		if (!c || fixtureHash(c) !== before.fixtureHash) throw new Error("LEXICAL_FIXTURE_MISMATCH");
		let literal: Record<string, unknown> | string = before.output;
		try {
			literal = JSON.parse(before.output);
		} catch {
			// Truncated/invalid writers were hashed as raw strings.
		}
		if (
			![literal, before.output].some(
				(value) => createHash("sha256").update(JSON.stringify(value)).digest("hex") === before.outputDigest,
			)
		)
			throw new Error("LEXICAL_OUTPUT_MISMATCH");
		if (!before.result || !before.score) return { ...before };
		if (typeof literal === "string") throw new Error("LEXICAL_MATERIALIZED_OUTPUT_MISMATCH");
		const actual = before.result;
		const saved = actual.kind === "wording" ? actual.proposals.map((p) => p.after) : actual.candidates;
		const raw =
			actual.kind === "wording"
				? (literal.proposals as { text: string }[]).map((p, i) =>
						replaceBlockText(required(actual.proposals[i]).before, p.text),
					)
				: literal.candidates;
		if (JSON.stringify(saved) !== JSON.stringify(raw)) throw new Error("LEXICAL_MATERIALIZED_OUTPUT_MISMATCH");
		const lost = lexicalLostFacts(
			{ requiredFacts: c.requiredFacts, factAlternatives: c.factAlternatives ?? {} },
			actual,
		);
		// Only lexical losses are replaced. Preserve separately recorded semantic loss markers.
		const semantic = before.score.lostFacts.filter((fact) => !before.lexicalLostFacts?.includes(fact));
		return {
			...before,
			lexicalLostFacts: lost,
			score: { ...before.score, lostFacts: [...new Set([...lost, ...semantic])] },
		};
	});
	return { ...artifact, calls, scores: scoreBenchmark(calls) };
}
