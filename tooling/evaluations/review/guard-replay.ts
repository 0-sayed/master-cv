import type { TaskCase } from "./contracts/types";
import type { BenchmarkCall } from "./runner";
import { createHash } from "node:crypto";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { evaluateOutput, prepareCase } from "./execution";
import { sessionPromptHash } from "./repair";
import { fixtureHash } from "./study";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Retrospective guard correction only. Saved inputs, judgments and charges remain immutable. */
export function replayTaskGuards(fixtures: readonly TaskCase[], calls: readonly BenchmarkCall[]) {
	const cases = new Map(fixtures.map((c) => [c.id, c]));
	const seen = new Set<string>();
	const sessions = [...calls]
		.sort((a, b) => a.key.localeCompare(b.key))
		.map((before) => {
			if (seen.has(before.key)) throw new Error("REPLAY_DUPLICATE_KEY");
			seen.add(before.key);
			const c = cases.get(before.caseId);
			if (!c || fixtureHash(c) !== before.fixtureHash) throw new Error("REPLAY_FIXTURE_MISMATCH");
			const prepared = prepareCase(c);
			if (hash(prepared.payload) !== before.inputDigest || hash(prepared.snapshot.evidence) !== before.sourceDigest)
				throw new Error("REPLAY_WRITER_INPUT_MISMATCH");
			if (sessionPromptHash(c) !== before.promptDigest) throw new Error("REPLAY_PROMPT_MISMATCH");
			let output: Record<string, unknown> = {};
			let parsed: unknown = before.output;
			try {
				parsed = JSON.parse(before.output);
				output = parsed as Record<string, unknown>;
			} catch {
				/* Invalid output stays invalid. */
			}
			const schemaOutput = prepared.handler.output.safeParse(parsed);
			if (hash(schemaOutput.success ? schemaOutput.data : before.output) !== before.outputDigest)
				throw new Error(`REPLAY_OUTPUT_MISMATCH:${before.key}`);
			const evaluation = evaluateOutput(c, output, before.verifierVerdict ?? null);
			let semanticAccepted = false;
			let fault = before.verifierFault ?? null;
			if (before.verifierVerdict && !fault) {
				try {
					semanticAccepted = tasksVerifier.assess(
						c,
						output,
						before.verifierVerdict as Record<string, unknown>,
					).accepted;
				} catch (error) {
					fault = error instanceof Error ? error.message : "VERIFIER_FAULT";
				}
			}
			const guardRecovered = !before.guardAccepted && evaluation.guardAccepted;
			const needsReverification = guardRecovered
				? !before.verifierVerdict
					? ["MISSING_VERIFIER"]
					: fault
						? [fault]
						: []
				: [];
			const accepted = Boolean(
				evaluation.guardAccepted && semanticAccepted && !fault && !evaluation.score?.unsupportedClaims.length,
			);
			const beforeUsable = Boolean(
				before.safetyAccepted &&
				before.qualityAccepted !== false &&
				before.taskScore?.quality.pass !== false &&
				!before.missingQuestion &&
				!before.emptyAnswer &&
				!before.truncated,
			);
			const usable = Boolean(
				accepted &&
				before.qualityAccepted !== false &&
				!evaluation.usefulnessMiss &&
				!evaluation.missingQuestion &&
				!evaluation.emptyAnswer &&
				!before.truncated,
			);
			return {
				key: before.key,
				caseId: c.id,
				category: c.category,
				language: c.language,
				variant: `${before.model}@${before.reasoning}`,
				runIndex: before.runIndex,
				writerOutputDigest: before.outputDigest,
				fixtureHash: before.fixtureHash,
				beforeGuardAccepted: before.guardAccepted,
				guardAccepted: evaluation.guardAccepted,
				beforeAccepted: Boolean(before.safetyAccepted),
				accepted,
				beforeUsable,
				usable,
				guardRecovered,
				beforeGuardError: before.guardError,
				guardError: evaluation.guardError,
				semanticAccepted,
				verifierFault: fault,
				needsReverification,
			};
		});
	const byCell = new Map<
		string,
		{
			category: string;
			variant: string;
			total: number;
			beforeAccepted: number;
			accepted: number;
			guardRecovered: number;
			acceptedRecovered: number;
			acceptedLost: number;
			pending: number;
			beforeUsable: number;
			usable: number;
		}
	>();
	for (const s of sessions) {
		const key = `${s.category}:${s.variant}`;
		const cell = byCell.get(key) ?? {
			category: s.category,
			variant: s.variant,
			total: 0,
			beforeAccepted: 0,
			accepted: 0,
			guardRecovered: 0,
			acceptedRecovered: 0,
			acceptedLost: 0,
			pending: 0,
			beforeUsable: 0,
			usable: 0,
		};
		cell.total++;
		cell.beforeAccepted += Number(s.beforeAccepted);
		cell.accepted += Number(s.accepted);
		cell.guardRecovered += Number(s.guardRecovered);
		cell.acceptedRecovered += Number(!s.beforeAccepted && s.accepted);
		cell.acceptedLost += Number(s.beforeAccepted && !s.accepted);
		cell.pending += Number(s.needsReverification.length > 0);
		cell.beforeUsable += Number(s.beforeUsable);
		cell.usable += Number(s.usable);
		byCell.set(key, cell);
	}
	const pending = sessions.filter((s) => s.needsReverification.length);
	return {
		sessions,
		cells: [...byCell.values()].sort((a, b) =>
			`${a.category}:${a.variant}`.localeCompare(`${b.category}:${b.variant}`),
		),
		pending,
		freshVerifierCostUsd: pending.length ? null : 0,
		newWriterCalls: 0,
		newVerifierCalls: 0,
		spendUsd: 0,
	};
}
