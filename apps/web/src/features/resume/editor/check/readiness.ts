import type { ReadinessResults } from "@reactive-resume/resume/ats";
/** Each run owns its signal and publication right. Cancelled work can finish but cannot publish. */
export function scheduleReadiness<T>(
	run: (signal: AbortSignal) => Promise<T>,
	publish: (value: T) => void,
	delay: number,
) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		void Promise.resolve()
			.then(() => run(controller.signal))
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

/** PDF/writing work has no authority over independently selected job evidence. */
export function mergeDocumentReadiness(current: ReadinessResults, completed: ReadinessResults): ReadinessResults {
	return { ...completed, job: current.job };
}
