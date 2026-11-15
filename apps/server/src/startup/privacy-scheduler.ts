import { runPrivacyWork } from "@reactive-resume/api/features/privacy/work";

/** PostgreSQL owns leases; this Node lifecycle only starts and drains bounded ticks. */
export function startPrivacyScheduler() {
	const controller = new AbortController();
	let inFlight: Promise<void> | null = null;
	const tick = () => {
		if (controller.signal.aborted || inFlight) return;
		inFlight = Promise.resolve()
			.then(() => runPrivacyWork({ signal: controller.signal }))
			.catch(() => {
				console.error("[privacy] Tick failed. Durable work remains recoverable.");
			})
			.finally(() => {
				inFlight = null;
			});
	};
	const timer = setInterval(tick, 1000);
	timer.unref();
	tick();
	return {
		stop: async () => {
			controller.abort();
			clearInterval(timer);
			await inFlight;
		},
	};
}
