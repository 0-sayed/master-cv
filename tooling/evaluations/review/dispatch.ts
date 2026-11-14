import type { ModelConfig } from "./config";

export type DispatchLimits = {
	sessionConcurrency?: number | undefined;
	openaiConcurrency?: number | undefined;
	togetherConcurrency?: number | undefined;
	maxUnverified?: number | undefined;
};
export function dispatchLimits(options: DispatchLimits) {
	const integer = (value: number | undefined, fallback: number, maximum = 64) => {
		const result = value ?? fallback;
		if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new Error("INVALID_CONCURRENCY");
		return result;
	};
	return {
		sessionConcurrency: integer(options.sessionConcurrency, 8),
		openaiConcurrency: integer(options.openaiConcurrency, 4, 8),
		togetherConcurrency: integer(options.togetherConcurrency, 4, 8),
		maxUnverified: integer(options.maxUnverified, 4),
	};
}

/** A slot covers the complete adapter retry sequence, including its backoff and body reads. */
export class ProviderDispatch {
	private readonly active = new Map<string, number>();
	private readonly wake = new Set<() => void>();
	private together: number;
	private windowStart = Date.now();
	private successes = 0;
	private previousRate = 0;
	private last429 = -Infinity;
	constructor(
		private readonly limits: ReturnType<typeof dispatchLimits>,
		private readonly stopped: () => boolean,
	) {
		this.together = Math.min(2, limits.togetherConcurrency);
	}
	limit(model: ModelConfig) {
		return model.provider === "together" ? this.together : this.limits.openaiConcurrency;
	}
	tryAcquire(model: ModelConfig): (() => void) | undefined {
		if (this.stopped()) return;
		const key = model.provider;
		const count = this.active.get(key) ?? 0;
		if (count >= this.limit(model)) return;
		this.active.set(key, count + 1);
		let released = false;
		return () => {
			if (released) throw new Error("DUPLICATE_SLOT_RELEASE");
			released = true;
			this.active.set(key, (this.active.get(key) ?? 1) - 1);
			for (const wake of this.wake) wake();
			this.wake.clear();
		};
	}
	async acquire(model: ModelConfig) {
		for (;;) {
			if (this.stopped()) throw new Error("BENCHMARK_STOPPED");
			const release = this.tryAcquire(model);
			if (release) return release;
			await new Promise<void>((resolve) => this.wake.add(resolve));
		}
	}
	observe(model: ModelConfig, rateLimited: boolean, success: boolean) {
		if (model.provider !== "together") return;
		if (rateLimited) {
			this.together = Math.max(1, Math.floor(this.together / 2));
			this.last429 = Date.now();
			this.successes = 0;
			this.previousRate = 0;
			this.windowStart = Date.now();
		} else if (success && ++this.successes >= 8) {
			const rate = this.successes / Math.max(1, Date.now() - this.windowStart);
			if (Date.now() - this.last429 >= 60_000 && this.previousRate > 0 && rate > this.previousRate)
				this.together = Math.min(this.limits.togetherConcurrency, this.together + 1);
			else if (this.previousRate && rate <= this.previousRate) this.together = Math.max(1, this.together - 1);
			this.previousRate = rate;
			this.windowStart = Date.now();
			this.successes = 0;
		}
	}
}
