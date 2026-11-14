import type { BenchmarkCall } from "./runner";

export const MAX_VERIFIER_FAULT_RETRIES = 1;
const MIN_OVERALL_VERIFICATIONS = 50;
const MAX_OVERALL_VERIFIER_FAULT_RATE = 0.1;
const MIN_VARIANT_VERIFICATIONS = 10;
const MAX_VARIANT_VERIFIER_FAULT_RATE = 0.25;

/** Count final session judgments, never retry attempts or unavailable providers. */
export function systemicVerifierFault(calls: readonly BenchmarkCall[]) {
	const completed = calls.filter(
		(c) =>
			c.verifierUsage &&
			c.outcome !== "transient" &&
			(!c.verifierFault || (c.verifierFaultRetries ?? 0) >= MAX_VERIFIER_FAULT_RETRIES),
	);
	if (
		completed.length >= MIN_OVERALL_VERIFICATIONS &&
		completed.filter((c) => c.verifierFault).length / completed.length > MAX_OVERALL_VERIFIER_FAULT_RATE
	)
		return true;
	const variants = new Map<string, { total: number; faults: number }>();
	for (const c of completed) {
		const key = JSON.stringify([c.model, c.provider, c.reasoning]);
		const variant = variants.get(key) ?? { total: 0, faults: 0 };
		variant.total++;
		variant.faults += Number(Boolean(c.verifierFault));
		variants.set(key, variant);
	}
	return [...variants.values()].some(
		(v) => v.total >= MIN_VARIANT_VERIFICATIONS && v.faults / v.total > MAX_VARIANT_VERIFIER_FAULT_RATE,
	);
}
