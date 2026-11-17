import type { ModelConfig } from "./config";
import { ProviderRatePolicy } from "./provider-rate-policy";

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
		sessionConcurrency: integer(options.sessionConcurrency, 16),
		openaiConcurrency: integer(options.openaiConcurrency, 8, 8),
		togetherConcurrency: integer(options.togetherConcurrency, 8, 8),
		maxUnverified: integer(options.maxUnverified, 16),
	};
}

/** A slot covers the complete adapter retry sequence, including its backoff and body reads. */
export class ProviderDispatch {
	private readonly active = new Map<string, number>();
	private readonly wake = new Set<() => void>();
	private together: number;
	private openai: number;
	private readonly ratePolicy = new ProviderRatePolicy();
	private openaiSuccesses = 0;
	private openaiLast429 = -Infinity;
	private successes = 0;
	private last429 = -Infinity;
	constructor(
		private readonly limits: ReturnType<typeof dispatchLimits>,
		private readonly stopped: () => boolean,
	) {
		this.together = Math.min(2, limits.togetherConcurrency);
		this.openai = Math.min(2, limits.openaiConcurrency);
	}
	limit(model: ModelConfig) {
		return model.provider === "together" ? this.together : this.openai;
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
	beforeRequest(model: ModelConfig, tokens: number) {
		if (this.ratePolicy.admit(model.provider, tokens, this.stopped) > 0)
			return this.ratePolicy.beforeRequest(model.provider, tokens, this.stopped);
	}

	observeResponse(model: ModelConfig, response: Response, raw: string) {
		this.ratePolicy.observe(model.provider, response, raw);
	}
	observe(model: ModelConfig, rateLimited: boolean, success: boolean) {
		if (model.provider === "openai") {
			if (rateLimited) {
				this.openai = Math.max(1, Math.floor(this.openai / 2));
				this.openaiLast429 = Date.now();
				this.openaiSuccesses = 0;
			} else if (success && ++this.openaiSuccesses >= 8) {
				if (Date.now() - this.openaiLast429 >= 60000)
					this.openai = Math.min(this.limits.openaiConcurrency, this.openai + 1);
				this.openaiSuccesses = 0;
			}
			return;
		}
		if (model.provider !== "together") return;
		if (rateLimited) {
			this.together = Math.max(1, Math.floor(this.together / 2));
			this.last429 = Date.now();
			this.successes = 0;
		} else if (success && ++this.successes >= 8) {
			if (Date.now() - this.last429 >= 60000)
				this.together = Math.min(this.limits.togetherConcurrency, this.together + 1);
			this.successes = 0;
		}
	}
}
