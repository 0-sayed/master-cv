import { isDeepStrictEqual } from "node:util";

// Both Together and OpenRouter support up to four stop sequences.
export const VERIFIER_WHITESPACE_STOPS = [" ".repeat(64), "\n".repeat(32), "\t".repeat(32), "\r\n".repeat(16)];
export function degenerateVerifierContent(content: unknown): boolean {
	return typeof content === "string" && (!content.trim() || /[\t\r\n ]{32,}/u.test(content));
}

/** Collapse only identical entries. Missing IDs and conflicting entries remain invalid. */
export function canonicalVerifierVerdict<T>(raw: T): T {
	if (!raw || typeof raw !== "object") return raw;
	const value = { ...raw } as Record<string, unknown>;
	for (const field of ["verdicts", "absence", "premises"]) {
		const rows = value[field];
		if (Array.isArray(rows))
			value[field] = rows.filter((row, index) => !rows.slice(0, index).some((prior) => isDeepStrictEqual(prior, row)));
	}
	return value as T;
}

export const MAX_VERIFIER_PROTOCOL_RETRIES = 2;

type ProtocolAttempt = { key: string; outcome: string; fault: string | null };
type ProtocolJudgment = ProtocolAttempt & { attempts?: readonly ProtocolAttempt[] };
export function rawVerifierProtocolRates(
	rows: readonly {
		category: string;
		language: string;
		judgments?: readonly ProtocolJudgment[];
		verifierJudgments?: readonly ProtocolJudgment[];
		attempts?: readonly { judgments?: readonly ProtocolJudgment[] }[];
	}[],
) {
	const groups = new Map<string, { category: string; language: string; calls: Map<string, ProtocolAttempt> }>();
	for (const row of rows) {
		const key = `${row.category}/${row.language}`;
		const group = groups.get(key) ?? {
			category: row.category,
			language: row.language,
			calls: new Map<string, ProtocolAttempt>(),
		};
		const history = row.attempts?.flatMap((a) => a.judgments ?? []) ?? [];
		for (const judgment of [...history, ...(row.judgments ?? row.verifierJudgments ?? [])])
			for (const attempt of judgment.attempts ?? [judgment]) group.calls.set(attempt.key, attempt);
		groups.set(key, group);
	}
	const byCategoryLanguage = [...groups.values()].map(({ category, language, calls }) => {
		const responses = [...calls.values()].filter((a) => ["valid", "invalid", "truncated"].includes(a.outcome));
		const rawProtocolFaults = responses.filter((a) => a.fault).length;
		return {
			category,
			language,
			judgmentRequests: responses.length,
			rawProtocolFaults,
			rawPerCallFaultRate: responses.length ? rawProtocolFaults / responses.length : null,
			transportInterruptions: calls.size - responses.length,
		};
	});
	const judgmentRequests = byCategoryLanguage.reduce((n, g) => n + g.judgmentRequests, 0);
	const rawProtocolFaults = byCategoryLanguage.reduce((n, g) => n + g.rawProtocolFaults, 0);
	return {
		judgmentRequests,
		rawProtocolFaults,
		rawPerCallFaultRate: judgmentRequests ? rawProtocolFaults / judgmentRequests : null,
		denominator:
			"completed verifier protocol responses, including fresh retries; transport/account interruptions separate",
		knownVerifierLimitation: true,
		byCategoryLanguage,
	};
}
