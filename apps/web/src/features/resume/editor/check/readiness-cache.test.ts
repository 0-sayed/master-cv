import type { evaluateReadiness } from "./evaluate";
import { expect, it, vi } from "vite-plus/test";
import { emptyReadiness } from "@reactive-resume/resume/ats";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createReadinessCache } from "./readiness-cache";

const snapshot = {
	identity: { ownerId: "alice", resumeId: "cv", baseRevision: "v1", editGeneration: 0 },
	data: defaultResumeData,
};
type Evaluation = Awaited<ReturnType<typeof evaluateReadiness>>;
const result: Evaluation = {
	results: {
		pdf: {
			...emptyReadiness("pdf"),
			state: "complete",
			checkedAt: "2026-11-19T00:00:00.000Z",
			source: {
				...snapshot.identity,
				contentHash: "content",
				bytesHash: "bytes",
				versions: { renderer: "1", template: "1", fonts: "1", locale: "ar-SA" },
			},
		},
		writing: emptyReadiness("writing"),
		job: emptyReadiness("job"),
	},
	pdfReport: null,
};
const signal = () => new AbortController().signal;

it("shares pending and completed checks for the exact document revision", async () => {
	const run = vi.fn(async () => result);
	const cache = createReadinessCache(run);
	const [first, second] = await Promise.all([
		cache.evaluate(snapshot, signal()),
		cache.evaluate(structuredClone(snapshot), signal()),
	]);
	expect(first).toBe(result);
	expect(second).toBe(first);
	expect(await cache.evaluate(snapshot, signal())).toBe(first);
	expect(run).toHaveBeenCalledTimes(1);
});

it("keeps a completed result when its original subscriber leaves", async () => {
	const run = vi.fn(async () => result);
	const cache = createReadinessCache(run);
	const controller = new AbortController();
	await cache.evaluate(snapshot, controller.signal);
	controller.abort();
	expect(await cache.evaluate(snapshot, signal())).toBe(result);
	expect(run).toHaveBeenCalledTimes(1);
});

it("bounds retained revisions and retries a failed PDF check", async () => {
	const run = vi.fn(async () => result);
	const cache = createReadinessCache(run);
	for (let editGeneration = 0; editGeneration < 4; editGeneration++) {
		await cache.evaluate({ ...snapshot, identity: { ...snapshot.identity, editGeneration } }, signal());
	}
	await cache.evaluate(snapshot, signal());
	expect(run).toHaveBeenCalledTimes(5);
	cache.clear();
	run.mockResolvedValueOnce({
		...result,
		results: { ...result.results, pdf: { ...emptyReadiness("pdf"), state: "failed" } },
	});
	await cache.evaluate(snapshot, signal());
	await cache.evaluate(snapshot, signal());
	expect(run).toHaveBeenCalledTimes(7);
});

it("invalidates on edits, saved revisions, document switches and owner switches", async () => {
	const run = vi.fn(async () => result);
	const cache = createReadinessCache(run);
	await cache.evaluate(snapshot, signal());
	for (const identity of [
		{ ...snapshot.identity, editGeneration: 1 },
		{ ...snapshot.identity, baseRevision: "v2" },
		{ ...snapshot.identity, resumeId: "other" },
		{ ...snapshot.identity, ownerId: "bob" },
	])
		await cache.evaluate({ ...snapshot, identity }, signal());
	expect(run).toHaveBeenCalledTimes(5);
	await cache.evaluate(
		{ ...snapshot, data: { ...snapshot.data, basics: { ...snapshot.data.basics, name: "Changed" } } },
		signal(),
	);
	expect(run).toHaveBeenCalledTimes(6);
});

it("refreshes for an explicit retry, a new day and editor disposal", async () => {
	const run = vi.fn(async () => result);
	let day = "2026-11-19";
	const cache = createReadinessCache(run, () => day);
	await cache.evaluate(snapshot, signal());
	await cache.evaluate(snapshot, signal(), 1);
	day = "2026-11-20";
	await cache.evaluate(snapshot, signal(), 1);
	cache.clear();
	await cache.evaluate(snapshot, signal(), 1);
	expect(run).toHaveBeenCalledTimes(4);
});

it("does not reuse aborted or failed work", async () => {
	const run = vi.fn(async () => result);
	const cache = createReadinessCache(run);
	const controller = new AbortController();
	controller.abort();
	await expect(cache.evaluate(snapshot, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
	expect(run).not.toHaveBeenCalled();
	run.mockRejectedValueOnce(new Error("worker unavailable"));
	await expect(cache.evaluate(snapshot, signal())).rejects.toThrow("worker unavailable");
	expect(await cache.evaluate(snapshot, signal())).toBe(result);
	expect(run).toHaveBeenCalledTimes(2);
});

it("starts fresh work after cancellation without accepting the old completion", async () => {
	const completions: ((value: Evaluation) => void)[] = [];
	const run = vi.fn(() => new Promise<Evaluation>((resolve) => completions.push(resolve)));
	const cache = createReadinessCache(run);
	const controller = new AbortController();
	const first = cache.evaluate(snapshot, controller.signal);
	await vi.waitFor(() => expect(completions).toHaveLength(1));
	controller.abort();
	const second = cache.evaluate(snapshot, signal());
	await vi.waitFor(() => expect(completions).toHaveLength(2));
	const [finishFirst, finishSecond] = completions;
	if (!finishFirst || !finishSecond) throw new Error("Checks did not start");
	finishFirst(result);
	await expect(first).rejects.toMatchObject({ name: "AbortError" });
	finishSecond(result);
	expect(await second).toBe(result);
	expect(await cache.evaluate(snapshot, signal())).toBe(result);
	expect(run).toHaveBeenCalledTimes(2);
});

it("rejects results that finish after editor disposal", async () => {
	let finish!: (value: Evaluation) => void;
	const cache = createReadinessCache(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = cache.evaluate(snapshot, signal());
	await vi.waitFor(() => expect(finish).toBeDefined());
	cache.clear();
	finish(result);
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});
