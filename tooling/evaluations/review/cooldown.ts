import type { ModelConfig } from "./config";

/** Per-run, pinned provider/model recovery. Reasoning variants share the same upstream pool. */
export class ProviderCooldown {
	private readonly outages = new Map<string, { bursts: number; since: number; until: number }>();
	private key(model: ModelConfig) {
		return JSON.stringify([model.providerEndpoint ?? model.provider, model.model]);
	}
	record(model: ModelConfig, rateLimited: boolean, outcome: string) {
		const key = this.key(model);
		if (!rateLimited && ["valid", "invalid", "truncated", "refusal", "unsupported"].includes(outcome))
			this.outages.delete(key);
		else if (rateLimited && outcome === "transient") {
			const prior = this.outages.get(key);
			const bursts = (prior?.bursts ?? 0) + 1;
			const delay = Math.min(300_000, 30_000 * 2 ** (bursts - 1) * (1 + Math.random() * 0.2));
			this.outages.set(key, { bursts, since: prior?.since ?? Date.now(), until: Date.now() + delay });
		}
	}
	blocked(model: ModelConfig) {
		return this.delay([model]) > 0;
	}
	expired(models: ModelConfig[]) {
		return models.some((model) => {
			const outage = this.outages.get(this.key(model));
			return outage !== undefined && Date.now() - outage.since >= 30 * 60_000;
		});
	}
	delay(models: ModelConfig[]) {
		return Math.max(
			0,
			...models.map((model) => {
				const outage = this.outages.get(this.key(model));
				return outage ? Math.min(outage.until, outage.since + 30 * 60_000) - Date.now() : 0;
			}),
		);
	}
	async wait(ms: number) {
		await new Promise<void>((resolve) => setTimeout(resolve, Math.min(Math.ceil(ms), 60_000)));
	}
}

export function isRateLimited(status: number, body: string) {
	if (status === 429) return true;
	try {
		const error = JSON.parse(body)?.error;
		return Boolean(
			error &&
			(Number(error.code) === 429 || /rate_limit_exceeded|temporarily rate-limited/iu.test(JSON.stringify(error))),
		);
	} catch {
		return false;
	}
}
