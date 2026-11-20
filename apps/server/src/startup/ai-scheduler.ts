import { runAiOperations } from "@reactive-resume/api/features/ai/operation-worker";

/** PostgreSQL owns leases; this Node lifecycle only starts and drains bounded ticks. */
export function startAiScheduler({ enabled = true, concurrency = 100 } = {}) {
	if (!enabled) return { stop: () => Promise.resolve() };
	const controller = new AbortController();
	let inFlight: Promise<void> | null = null;
	const tick = () => {
		if (controller.signal.aborted || inFlight) return;
		inFlight = Promise.resolve()
			.then(() => runAiOperations(controller.signal, concurrency))
			.catch(() => {
				console.error("[ai] Operation tick failed. Durable work remains recoverable.");
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
