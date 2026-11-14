/** Integer microdollars. Unknown billing remains fully reserved. One ledger per payer. */
export class Budget {
	consumed = 0;
	constructor(readonly capMicros: number) {
		if (!Number.isSafeInteger(capMicros) || capMicros <= 0) throw new Error("INVALID_BUDGET");
	}
	reserve(bound: number) {
		if (!Number.isSafeInteger(bound) || bound < 0) throw new Error("INVALID_BOUND");
		if (this.consumed + bound > this.capMicros) throw new Error("BUDGET_LIMIT");
		this.consumed += bound;
	}
	settle(bound: number, actual: number | null) {
		if (actual === null) return;
		if (!Number.isSafeInteger(actual) || actual < 0 || actual > bound) throw new Error("BILLING_BOUND_EXCEEDED");
		this.consumed += actual - bound;
	}
}
export function assertStudyForecast(
	fullUsd: number,
	smokeMicros: number,
	budgetUsd: number,
	report: (message: string) => void = console.info,
) {
	const forecastMicros = Math.ceil(fullUsd * 1e6) + smokeMicros;
	const limitMicros = Math.floor(budgetUsd * 1e6);
	report(
		`Smoke-calibrated forecast: full $${fullUsd.toFixed(6)} + smoke $${(smokeMicros / 1e6).toFixed(6)} = $${(forecastMicros / 1e6).toFixed(6)}; limit $${(limitMicros / 1e6).toFixed(6)}.`,
	);
	if (!Number.isSafeInteger(forecastMicros) || forecastMicros < 0 || forecastMicros > limitMicros)
		throw new Error("CALIBRATED_FORECAST_LIMIT");
}

/** OpenRouter credit purchase fee, included once in OpenRouter spend; never applied to OpenAI upstream billing. */
export const openRouterFeeMultiplier = 1.055;
export const withOpenRouterFee = (micros: number) => Math.ceil(micros * openRouterFeeMultiplier);

/** Recorded pair costs include the 5.5% fee once. Scale each variant's mean, then add 25% headroom. */
export function calibratedExpectedFull(
	smoke: { model: string; provider: string; reasoning: string; costMicros: number | null }[],
	planned: { model: string; provider: string; reasoning: string; calls: number }[],
) {
	if (!planned.length) throw new Error("INVALID_CALIBRATION");
	let total = 0;
	for (const variant of planned) {
		const samples = smoke.filter(
			(c) => c.model === variant.model && c.provider === variant.provider && c.reasoning === variant.reasoning,
		);
		if (
			!Number.isSafeInteger(variant.calls) ||
			variant.calls <= 0 ||
			!samples.length ||
			samples.some((c) => c.costMicros === null || !Number.isSafeInteger(c.costMicros) || c.costMicros < 0)
		)
			throw new Error("INVALID_CALIBRATION");
		const observed = samples.reduce((sum, c) => sum + (c.costMicros ?? 0), 0);
		total += Math.ceil((observed * variant.calls) / samples.length);
	}
	if (!Number.isSafeInteger(total) || total < 0) throw new Error("INVALID_CALIBRATION");
	return Math.ceil(total * 1.25) / 1e6;
}

/** Planning estimate only: observed mean plus 25% headroom, never a replacement for reservations. */
export function projectObservedSpend(
	smokeMicros: number,
	smokeSessions: number,
	fullSessions: number,
	budgetUsd: number,
) {
	if (
		!Number.isSafeInteger(smokeMicros) ||
		smokeMicros <= 0 ||
		!Number.isSafeInteger(smokeSessions) ||
		smokeSessions <= 0 ||
		!Number.isSafeInteger(fullSessions) ||
		fullSessions <= 0 ||
		!Number.isFinite(budgetUsd) ||
		budgetUsd <= 0
	)
		throw new Error("INVALID_CALIBRATION");
	const fullMicros = Math.ceil((smokeMicros * fullSessions) / smokeSessions);
	const bufferedFullMicros = Math.ceil(fullMicros * 1.25);
	return {
		smokeUsd: smokeMicros / 1e6,
		fullUsd: fullMicros / 1e6,
		bufferedFullUsd: bufferedFullMicros / 1e6,
		totalUsd: (smokeMicros + bufferedFullMicros) / 1e6,
		withinBudget: smokeMicros + bufferedFullMicros <= Math.floor(budgetUsd * 1e6),
	};
}
