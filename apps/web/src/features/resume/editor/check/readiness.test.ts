import { expect, it, vi, afterEach } from "vite-plus/test";
import { scheduleReadiness } from "./readiness";
afterEach(() => vi.useRealTimers());
it("cancels delayed and already-running work without publishing superseded results", async () => {
	vi.useFakeTimers();
	let resolve!: (s: string) => void;
	const publish = vi.fn();
	const run = vi.fn(
		() =>
			new Promise<string>((r) => {
				resolve = r;
			}),
	);
	const stop = scheduleReadiness(run, publish, 250);
	await vi.advanceTimersByTimeAsync(249);
	expect(run).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	expect(run).toHaveBeenCalledTimes(1);
	stop();
	resolve("old");
	await Promise.resolve();
	expect(publish).not.toHaveBeenCalled();
	const stop2 = scheduleReadiness(run, publish, 250);
	stop2();
	await vi.advanceTimersByTimeAsync(250);
	expect(run).toHaveBeenCalledTimes(1);
});

it("contains synchronous failures before a readiness promise is returned", async () => {
	vi.useFakeTimers();
	const publish = vi.fn();
	scheduleReadiness(
		() => {
			throw new Error("readiness unavailable");
		},
		publish,
		1,
	);
	await vi.advanceTimersByTimeAsync(1);
	expect(publish).not.toHaveBeenCalled();
});
