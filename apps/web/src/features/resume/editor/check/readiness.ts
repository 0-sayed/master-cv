/** Each run owns its signal and publication right. Cancelled work can finish but cannot publish. */
export function scheduleReadiness<T>(
	run: (signal: AbortSignal) => Promise<T>,
	publish: (value: T) => void,
	delay: number,
) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		void run(controller.signal)
			.then((value) => {
				if (!controller.signal.aborted) publish(value);
			})
			.catch(() => {});
	}, delay);
	return () => {
		clearTimeout(timer);
		controller.abort();
	};
}
