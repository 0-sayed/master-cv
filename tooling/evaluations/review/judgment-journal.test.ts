import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries, runJudgeCanaries, type JudgeCanaryReceipt } from "./canaries";
import { loadModels } from "./config";
import { appendEvent, readJournal } from "./journal";
import { required } from "./required";
import { runBenchmark, type FakeTransport, type RunOptions } from "./runner";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const c = required(loadJudgeCanaries().find((c) => c.category === "cover-letter" && c.language === "en"));
const model = required(models.find((m) => m.model === "openai/gpt-6-luna" && m.reasoning === "low"));
const rejection: FakeTransport = async (_url, _init, next, context) => {
	const response = await next();
	if (context.role !== "verifier" || context.requestKey?.includes(":judge:")) return response;
	const envelope = await response.json();
	const verdict = JSON.parse(envelope.choices[0].message.content);
	verdict.verdicts[0].verdict = "unsupported";
	verdict.verdicts[0].reason = "Initial independent rejection.";
	envelope.choices[0].message.content = JSON.stringify(verdict);
	return Response.json(envelope);
};
it("replays a truncated judgment and its larger replacement from the journal without another purchase", async () => {
	const folder = await mkdtemp(join(tmpdir(), "judgment-journal-"));
	const path = join(folder, "calls.jsonl");
	let sends = 0;
	const transport: FakeTransport = async (_u, _i, next, ctx) => {
		const response = await next();
		if (ctx.role !== "verifier") return response;
		sends++;
		const body = await response.json();
		body.usage.cost = 0.000123;
		if (sends === 1) body.choices[0].finish_reason = "length";
		return Response.json(body);
	};
	try {
		const options: RunOptions = {
			models: [model],
			cases: [c],
			runs: 1,
			fake: true,
			budgetUsd: 100,
			openaiBudgetUsd: 100,
			fakeTransport: transport,
			onReserve: (data) => appendEvent(path, { type: "reserved", data }),
			onRaw: (data) => appendEvent(path, { type: "raw", data }),
			onCall: (data) => appendEvent(path, { type: "scored", data }),
		};
		const first = await runBenchmark(options);
		expect(sends).toBe(2);
		expect(first.reservedUsd).toBe(0.000246);
		const history = await readJournal(path);
		const replay = await runBenchmark({
			...options,
			rawRecords: history.rawRecords,
			pendingReservations: history.pendingReservations,
			fakeTransport: () => {
				throw new Error("COMPLETED_JUDGMENT_MUST_NOT_BE_REBOUGHT");
			},
		});
		expect(replay.calls[0]?.verifierAccepted).toBe(true);
		expect(replay.reservedUsd).toBe(first.reservedUsd);
		const partial = await runBenchmark({
			...options,
			rawRecords: history.rawRecords.filter((r) => !r.key.endsWith(":retry:1")),
			pendingReservations: history.pendingReservations,
			fakeTransport: transport,
		});
		expect(sends).toBe(3);
		expect(partial.calls[0]?.verifierAccepted).toBe(true);
		expect(partial.reservedUsd).toBe(0.000246);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});
it("replays all three journaled judgments after the scored record is lost without spending again", async () => {
	const folder = await mkdtemp(join(tmpdir(), "judgment-journal-"));
	const path = join(folder, "calls.jsonl");
	try {
		const options: RunOptions = {
			models: [model],
			cases: [c],
			runs: 1,
			fake: true,
			budgetUsd: 100,
			openaiBudgetUsd: 100,
			fakeTransport: rejection,
			onReserve: (data) => appendEvent(path, { type: "reserved", data }),
			onRaw: (data) => appendEvent(path, { type: "raw", data }),
			onCall: (data) => appendEvent(path, { type: "scored", data }),
		};
		const first = await runBenchmark(options);
		expect(first.stopReason).toBeNull();
		expect(first.calls[0]?.verifierJudgments).toHaveLength(3);
		const history = await readJournal(path);
		let sends = 0;
		const replay = await runBenchmark({
			...options,
			rawRecords: history.rawRecords,
			pendingReservations: history.pendingReservations,
			fakeTransport: async (...args) => {
				sends++;
				return rejection(...args);
			},
		});
		expect(sends).toBe(0);
		expect(replay.calls[0]?.verifierVerdict).toEqual(first.calls[0]?.verifierVerdict);
		expect(replay.reservedUsd).toBe(first.reservedUsd);
		expect(replay.reservedOpenaiUsd).toBe(first.reservedOpenaiUsd);
		const complete = await runBenchmark({
			...options,
			...history,
			previousCalls: replay.calls,
			fakeTransport: async (...args) => {
				sends++;
				return rejection(...args);
			},
		});
		expect(sends).toBe(0);
		expect(complete.reservedUsd).toBe(first.reservedUsd);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});
it("resumes a canary checkpoint between judgments without buying either completed judgment", async () => {
	let checkpoint: JudgeCanaryReceipt | undefined;
	let initialKey = "";
	const selected = models.map((m) => ({ ...m, categories: ["cover-letter" as const] }));
	const fakeTransport: FakeTransport = async (_u, _i, next, context) => {
		const response = await next();
		const key = context.requestKey ?? context.key;
		if (!initialKey) initialKey = key;
		if (key !== initialKey) return response;
		const envelope = await response.json();
		const verdict = JSON.parse(envelope.choices[0].message.content);
		verdict.verdicts[0].verdict = "unsupported";
		envelope.choices[0].message.content = JSON.stringify(verdict);
		return Response.json(envelope);
	};
	const input = {
		phase: "smoke" as const,
		studyHash: "checkpoint",
		options: { models: selected, cases: [], runs: 1, fake: true, budgetUsd: 100, sessionConcurrency: 1, fakeTransport },
		onProgress: async (r: JudgeCanaryReceipt) => {
			if (!checkpoint && r.results[0]?.rawJudgments?.length === 2 && r.results[0]?.outcome === "pending")
				checkpoint = structuredClone(r);
		},
	};
	const first = required(await runJudgeCanaries(input));
	const saved = required(checkpoint);
	const keys = new Set(required(saved.results[0]).rawJudgments?.map((r) => r.key));
	let sends = 0;
	const resumed = required(
		await runJudgeCanaries({
			...input,
			previous: saved,
			options: {
				...input.options,
				fakeTransport: async (u, i, next, context) => {
					expect(keys.has(context.requestKey ?? context.key)).toBe(false);
					sends++;
					return fakeTransport(u, i, next, context);
				},
			},
		}),
	);
	expect(sends).toBe(21);
	expect(resumed.openRouterMicros).toBe(first.openRouterMicros);
	expect(resumed.recall).toBe(1);
	expect(resumed.rawHonestFalseRejects).toBe(1);
	expect(resumed.honestFalseRejects).toBe(0);
});

it("resumes a canary after a paid truncation and purchases only its missing expanded attempt", async () => {
	const sent: string[] = [];
	let firstKey = "";
	let checkpoint: JudgeCanaryReceipt | undefined;
	const options = {
		models: models.map((m) => ({ ...m, categories: ["summary" as const] })),
		cases: [],
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		sessionConcurrency: 1,
		fakeTransport: (async (_u, _i, next, ctx) => {
			const response = await next();
			const key = ctx.requestKey ?? ctx.key;
			if (!firstKey) firstKey = key;
			sent.push(key);
			if (key !== firstKey) return response;
			const body = await response.json();
			body.choices[0].finish_reason = "length";
			return Response.json(body);
		}) as FakeTransport,
	};
	const input = {
		phase: "smoke" as const,
		studyHash: "truncated-checkpoint",
		options,
		onProgress: async (r: JudgeCanaryReceipt) => {
			if (!checkpoint && r.results[0]?.rawJudgments?.length === 1 && r.results[0]?.outcome === "pending")
				checkpoint = structuredClone(r);
		},
	};
	const first = required(await runJudgeCanaries(input));
	expect(first.recall).toBe(1);
	expect(sent.filter((key) => key.startsWith(firstKey))).toEqual([firstKey, firstKey + ":retry:1"]);
	sent.length = 0;
	const resumed = required(await runJudgeCanaries({ ...input, previous: required(checkpoint) }));
	expect(sent.filter((key) => key.startsWith(firstKey))).toEqual([firstKey + ":retry:1"]);
	expect(resumed.recall).toBe(1);
	expect(resumed.openRouterMicros).toBe(first.openRouterMicros);
});
