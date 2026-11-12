import { afterEach, expect, it, vi } from "vite-plus/test";
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@reactive-resume/api/features/ai/operation-worker", () => ({ runAiOperations: run }));
import { startAiScheduler } from "./ai-scheduler";
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});
it("prevents overlapping claims and aborts/drains execution before stopping", async () => {
	vi.useFakeTimers();
	let finish: () => void = () => undefined;
	let signal: AbortSignal | undefined;
	run.mockImplementation((value: AbortSignal) => {
		signal = value;
		return new Promise<void>((resolve) => {
			finish = resolve;
		});
	});
	const scheduler = startAiScheduler();
	await vi.advanceTimersByTimeAsync(10000);
	expect(run).toHaveBeenCalledTimes(1);
	let drained = false;
	const stopping = scheduler.stop().then(() => {
		drained = true;
	});
	expect(signal?.aborted).toBe(true);
	expect(drained).toBe(false);
	finish();
	await stopping;
	await vi.advanceTimersByTimeAsync(10000);
	expect(run).toHaveBeenCalledTimes(1);
});
