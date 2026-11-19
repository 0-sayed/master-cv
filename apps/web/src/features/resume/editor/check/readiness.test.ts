import { expect, it, vi, afterEach } from "vite-plus/test";
import { scheduleReadiness } from "./readiness";
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
it("starts background checks at idle and cancels an idle callback when the editor closes", async () => {
	vi.useFakeTimers();
	let idle!: IdleRequestCallback;
	const cancelIdle = vi.fn();
	vi.stubGlobal(
		"requestIdleCallback",
		vi.fn((callback: IdleRequestCallback) => {
			idle = callback;
			return 7;
		}),
	);
	vi.stubGlobal("cancelIdleCallback", cancelIdle);
	const run = vi.fn(async () => "checked");
	const publish = vi.fn();
	const stop = scheduleReadiness(run, publish, 250);
	await vi.advanceTimersByTimeAsync(250);
	expect(run).not.toHaveBeenCalled();
	idle({ didTimeout: false, timeRemaining: () => 50 });
	await vi.advanceTimersByTimeAsync(0);
	expect(publish).toHaveBeenCalledWith("checked");
	stop();
	expect(cancelIdle).toHaveBeenCalledWith(7);
	const cancelled = scheduleReadiness(run, publish, 250);
	await vi.advanceTimersByTimeAsync(250);
	cancelled();
	idle({ didTimeout: false, timeRemaining: () => 50 });
	await vi.advanceTimersByTimeAsync(0);
	expect(run).toHaveBeenCalledTimes(1);
});
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

import { emptyReadiness } from "@reactive-resume/resume/ats";
import { mergeDocumentReadiness } from "./readiness";
it("preserves the independently published job result when PDF work completes", () => {
	const job = { ...emptyReadiness("job"), checker: "selected-job-B" };
	const before = { pdf: emptyReadiness("pdf"), writing: emptyReadiness("writing"), job };
	const completed = { ...before, job: emptyReadiness("job") };
	expect(mergeDocumentReadiness(before, completed).job).toBe(job);
});
