import type { UiLocale } from "@reactive-resume/utils/locale";

export function createLocaleSwitchQueue(apply: (locale: UiLocale) => Promise<void>) {
	type Waiter = { resolve: () => void; reject: (error: unknown) => void };
	let running = false;
	let queued: { locale: UiLocale; waiters: Waiter[] } | undefined;
	async function drain() {
		if (running) return;
		running = true;
		while (queued) {
			const next = queued;
			queued = undefined;
			try {
				await apply(next.locale);
				for (const waiter of next.waiters) waiter.resolve();
			} catch (error) {
				for (const waiter of next.waiters) waiter.reject(error);
			}
		}
		running = false;
	}
	return (locale: UiLocale) =>
		new Promise<void>((resolve, reject) => {
			if (queued) {
				queued.locale = locale;
				queued.waiters.push({ resolve, reject });
			} else queued = { locale, waiters: [{ resolve, reject }] };
			void drain();
		});
}
