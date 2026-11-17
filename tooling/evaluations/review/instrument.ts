import type { BenchmarkCall } from "./runner";

/** Earlier verifier attempts are billed even when their final replacement succeeds. */
export function sessionRouterCostMicros(
	call: Pick<BenchmarkCall, "openRouterCostMicros" | "costMicros" | "priorAttemptOpenRouterMicros">,
): number {
	return (call.openRouterCostMicros ?? call.costMicros ?? 0) + (call.priorAttemptOpenRouterMicros ?? 0);
}

export function smokeUsable(call: BenchmarkCall): boolean {
	return (
		call.outcome === "valid" &&
		call.schemaValid &&
		call.guardAccepted &&
		call.verifierAccepted &&
		Boolean(call.verifierUsage) &&
		!call.verifierFault &&
		!call.verifierTruncated &&
		!(call.writerTruncated ?? call.truncated)
	);
}

/** A shared empty cell pauses its category, never removes a finalist on one observation. */
export function smokeCellReport(calls: BenchmarkCall[]) {
	return [...new Set(calls.map((c) => c.category))].flatMap((category) =>
		["ar", "en", "mixed"].map((language) => {
			const variants = calls
				.filter((c) => c.category === category && c.language === language && c.outcome !== "ACCOUNT_ERROR")
				.map((c) => ({
					model: c.model,
					reasoning: c.reasoning,
					provider: c.provider,
					usable: smokeUsable(c),
					reason: smokeUsable(c)
						? null
						: (c.verifierFault ??
							c.guardError ??
							(!c.schemaValid
								? "SCHEMA_INVALID"
								: c.writerTruncated || c.verifierTruncated
									? "TRUNCATED"
									: !c.verifierAccepted
										? "VERIFIER_REJECTED"
										: c.outcome)),
				}));
			return { category, language, blocked: !variants.some((v) => v.usable), variants };
		}),
	);
}

export function blockedSmokeCategories(calls: BenchmarkCall[]): string[] {
	return [
		...new Set(
			smokeCellReport(calls)
				.filter((cell) => cell.blocked)
				.map((cell) => cell.category),
		),
	];
}
