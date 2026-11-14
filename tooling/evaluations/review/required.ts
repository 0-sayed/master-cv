/** Fail explicitly when a benchmark artifact or its fixed HTML template violates its contract. */
export function required<T>(value: T | null | undefined): T {
	if (value === null || value === undefined) throw new Error("BENCHMARK_INVARIANT");
	return value;
}
