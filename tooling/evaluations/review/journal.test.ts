import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { appendEvent, readJournal } from "./journal";
import { required } from "./required";
it("durably retains failure evidence without treating an attempt as a settled session", async () => {
	const folder = await mkdtemp(join(tmpdir(), "review-attempt-journal-"));
	const path = join(folder, "calls.jsonl");
	try {
		const attempt = {
			key: "session:verify",
			reservedMicros: 0,
			outcome: "transient",
			failure: {
				errorClass: "TypeError",
				message: "fetch failed",
				httpStatus: null,
				bytesReceived: false,
				generationId: null,
			},
		};
		await appendEvent(path, { type: "reserved", data: { key: "session", reservedMicros: 100 } });
		await appendEvent(path, { type: "attempt", data: attempt });
		const history = await readJournal(path);
		expect(history.attempts).toEqual([attempt]);
		expect(history.previousCalls).toEqual([]);
		expect(history.pendingReservations).toEqual([{ key: "session", reservedMicros: 100 }]);
	} finally {
		await rm(folder, { recursive: true });
	}
});
it("durably reloads append-only reservations and rejects a torn record without repeating a paid call", async () => {
	const folder = await mkdtemp(join(tmpdir(), "a02-journal-"));
	const path = join(folder, "events.jsonl");
	try {
		await appendEvent(path, { type: "reserved", data: { key: "a", reservedMicros: 10 } });
		const history = await readJournal(path);
		expect(history.pendingReservations).toEqual([{ key: "a", reservedMicros: 10 }]);
		await appendFile(path, '{"type":');
		await expect(readJournal(path)).rejects.toThrow("JOURNAL_INCOMPLETE");
	} finally {
		await rm(folder, { recursive: true });
	}
});

it("holds a new retry reservation after a scored transient until that retry is durably scored", async () => {
	const folder = await mkdtemp(join(tmpdir(), "review-retry-journal-"));
	const path = join(folder, "events.jsonl");
	try {
		const { runBenchmark } = await import("./runner");
		const { loadModels } = await import("./config");
		const { cases } = await import("./corpus");
		const options = { models: loadModels().slice(0, 1), cases: cases.slice(0, 1), runs: 1, fake: true, budgetUsd: 10 };
		const first = await runBenchmark(options);
		const call = required(first.calls[0]);
		await appendEvent(path, { type: "scored", data: { ...call, outcome: "transient" } });
		await appendEvent(path, {
			type: "reserved",
			data: { key: call.key, reservedMicros: 10, reservedOpenRouterMicros: 4, reservedOpenaiMicros: 6 },
		});
		const resumed = await runBenchmark({ ...options, ...(await readJournal(path)) });
		expect(resumed.stopReason).toBe("PENDING_BILLING");
		expect(resumed.reservedUsd).toBeCloseTo(first.reservedUsd + 0.000004, 9);
		expect(resumed.reservedOpenaiUsd).toBeCloseTo(required(first.reservedOpenaiUsd) + 0.000006, 9);
		await appendEvent(path, { type: "scored", data: call });
		const completed = await runBenchmark({ ...options, ...(await readJournal(path)) });
		expect(completed.stopReason).toBeNull();
		expect(completed.reservedUsd).toBe(first.reservedUsd);
	} finally {
		await rm(folder, { recursive: true });
	}
});

it("serializes concurrent durable appends in submitted order without torn or duplicate records", async () => {
	const folder = await mkdtemp(join(tmpdir(), "review-concurrent-journal-"));
	const path = join(folder, "events.jsonl");
	try {
		await Promise.all(
			Array.from({ length: 100 }, (_, i) =>
				appendEvent(path, {
					type: "reserved",
					data: { key: String(i), reservedMicros: i },
				}),
			),
		);
		const history = await readJournal(path);
		expect(history.pendingReservations.map((r) => r.key)).toEqual(Array.from({ length: 100 }, (_, i) => String(i)));
	} finally {
		await rm(folder, { recursive: true });
	}
});
