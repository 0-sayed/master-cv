// Conservative shared OpenAI Build allowance: 80% of 5,000 RPM / 1M TPM.
// Together publishes dynamic limits, so it uses response-driven pauses instead.
const WINDOW_MS = 60_000;
type Window = {
	start: number;
	requests: number;
	tokens: number;
	rpm: number;
	tpm: number;
	until: number;
	failures: number;
	admissions: { at: number; tokens: number }[];
};
export class ProviderRatePolicy {
	private readonly windows = new Map<string, Window>();
	private state(provider: string) {
		let state = this.windows.get(provider);
		if (!state) {
			state = {
				start: Date.now(),
				requests: 0,
				tokens: 0,
				rpm: provider === "openai" ? 4000 : Infinity,
				tpm: provider === "openai" ? 800000 : Infinity,
				until: 0,
				failures: 0,
				admissions: [],
			};
			this.windows.set(provider, state);
		}
		return state;
	}
	snapshot(provider: string) {
		const state = this.state(provider);
		return { requestsPerMinute: state.rpm, tokensPerMinute: state.tpm };
	}
	admit(provider: string, tokens: number, stopped: () => boolean = () => false) {
		if (stopped()) throw new Error("BENCHMARK_STOPPED");
		const state = this.state(provider);
		const now = Date.now();
		while (state.admissions[0] && state.admissions[0].at <= now - WINDOW_MS) {
			const expired = state.admissions.shift();
			if (!expired) break;
			state.requests--;
			state.tokens -= expired.tokens;
		}
		state.start = state.admissions[0]?.at ?? now;
		if (tokens > state.tpm) throw new Error("REQUEST_EXCEEDS_PROVIDER_TOKEN_ALLOWANCE");
		const wait = Math.max(
			0,
			state.until - now,
			state.requests + 1 > state.rpm || state.tokens + tokens > state.tpm ? state.start + WINDOW_MS - now : 0,
		);
		if (wait > 0) return wait;
		state.requests++;
		state.tokens += tokens;
		state.admissions.push({ at: now, tokens });
		return 0;
	}
	async beforeRequest(provider: string, tokens: number, stopped: () => boolean = () => false) {
		for (;;) {
			const wait = this.admit(provider, tokens, stopped);
			if (!wait) return;
			await new Promise<void>((resolve) => setTimeout(resolve, wait));
		}
	}

	observe(provider: string, response: Response, raw: string) {
		const state = this.state(provider);
		const now = Date.now();
		if (provider === "openai") {
			for (const [header, key] of [
				["x-ratelimit-limit-requests", "rpm"],
				["x-ratelimit-limit-tokens", "tpm"],
			] as const) {
				const value = Number(response.headers.get(header));
				if (Number.isFinite(value) && value > 0)
					state[key] = Math.min(state[key], Math.max(1, Math.floor(value * 0.8)));
			}
		}
		if (provider === "openai") {
			for (const kind of ["requests", "tokens"]) {
				if (response.headers.get(`x-ratelimit-remaining-${kind}`) === "0") {
					const reset = response.headers.get(`x-ratelimit-reset-${kind}`) ?? "";
					const units = { h: 3600000, m: 60000, s: 1000, ms: 1 };
					const parts = [...reset.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/gu)];
					const delay = parts.reduce(
						(total, part) => total + Number(part[1]) * units[part[2] as keyof typeof units],
						0,
					);
					state.until = Math.max(state.until, now + delay);
				}
			}
		}
		if (response.status !== 429 && !isInFlightHold(response.status, raw)) {
			if (response.ok) state.failures = 0;
			return;
		}
		state.failures++;
		const retry = response.headers.get("retry-after");
		const delay = retry
			? /^\d+(?:\.\d+)?$/u.test(retry)
				? Number(retry) * 1000
				: Math.max(0, Date.parse(retry) - now)
			: Number.NaN;
		const reset = Number(response.headers.get("x-ratelimit-reset"));
		const fallback = Math.min(60000, 1000 * 2 ** Math.min(6, state.failures - 1));
		state.until = Math.max(state.until, now + (Number.isFinite(delay) ? delay : reset > 0 ? reset * 1000 : fallback));
	}
}
function isInFlightHold(status: number, raw: string) {
	if (status !== 402) return false;
	try {
		const metadata = JSON.parse(raw).error?.metadata;
		return (
			metadata?.limit_source === "openrouter_in_flight_budget" && metadata?.reason === "in_flight_budget_exhausted"
		);
	} catch {
		return false;
	}
}
export function normalizeCapacityResponse(response: Response, raw: string) {
	let quotaExhausted = false;
	if (response.status === 429) {
		try {
			const error = JSON.parse(raw).error;
			const nested = typeof error?.metadata?.raw === "string" ? JSON.parse(error.metadata.raw).error : null;
			quotaExhausted = [
				error?.code,
				error?.type,
				error?.metadata?.provider_error_code,
				nested?.code,
				nested?.type,
			].includes("insufficient_quota");
		} catch {
			/* Malformed errors retain their original classification. */
		}
	}
	if (!quotaExhausted && !isInFlightHold(response.status, raw)) return response;
	const body = JSON.parse(raw);
	body.error.code = quotaExhausted ? 402 : 429;
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	headers.set("content-type", "application/json");
	return new Response(JSON.stringify(body), { status: quotaExhausted ? 402 : 429, headers });
}
export function requestTokenAllowance(body: Record<string, unknown>) {
	// UTF-8 bytes bound byte-level input tokens; max_tokens includes reasoning.
	return Buffer.byteLength(JSON.stringify(body)) + Number(body.max_tokens ?? body.max_completion_tokens ?? 0);
}
