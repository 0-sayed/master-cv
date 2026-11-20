let sessionRetryAfterMs: number | undefined;

export function recordSessionRetryAfter(seconds: string | null) {
	const value = Number(seconds);
	sessionRetryAfterMs = Number.isFinite(value) && value > 0 ? value * 1_000 : undefined;
}

export function consumeSessionRetryAfterMs() {
	const value = sessionRetryAfterMs;
	sessionRetryAfterMs = undefined;
	return value;
}
