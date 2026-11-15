import { afterEach, expect, it, vi } from "vite-plus/test";
const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@reactive-resume/api/features/privacy/work", () => ({ runPrivacyWork: run }));
import { startPrivacyScheduler } from "./privacy-scheduler";
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});
it("prevents overlapping claims and aborts/drains execution before stopping", async () => {
	vi.useFakeTimers();
	let finish: () => void = () => undefined;
	let signal: AbortSignal | undefined;
	run.mockImplementation((value: { signal: AbortSignal }) => {
		signal = value.signal;
		return new Promise<void>((resolve) => {
			finish = resolve;
		});
	});
	const scheduler = startPrivacyScheduler();
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
