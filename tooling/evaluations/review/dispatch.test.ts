import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadModels, parseOptions } from "./config";
import { cases, prepareCase } from "./corpus";
import { dispatchLimits, ProviderDispatch } from "./dispatch";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { estimateBenchmark, runBenchmark, type RawRecord, type RunOptions } from "./runner";

afterEach(() => vi.useRealTimers());
const luna = required(loadModels().find((m) => m.model === "openai/gpt-6-luna"));
const deepseek = required(loadModels().find((m) => m.provider === "together"));
const selected = cases.filter((c) => c.category === "wording" && !c.exploratory).slice(0, 12);
const base: RunOptions = { models: [luna, deepseek], cases: selected, runs: 1, fake: true, budgetUsd: 40 };

async function recordings(options: RunOptions = base) {
	const raw: RawRecord[] = [];
	await runBenchmark({
		...options,
		onRaw: async (r) => {
			raw.push(r);
		},
	});
	return raw;
}
function replay(raw: RawRecord[], delay: (r: RawRecord) => number = () => 5): typeof fetch {
	return async (_url, init) => {
		const body = JSON.parse(String(init?.body));
		const verifier = String(body.messages[0].content).includes("usefulness");
		const record = required(
			raw.find((r) => {
				const c = required(selected.find((c) => c.id === r.caseId));
				const source = prepareCase(c).payload.selections[0];
				return (
					r.model === body.model &&
					(!verifier ? r.reasoning === body.reasoning.effort : true) &&
					r.key.endsWith(":verify") === verifier &&
					JSON.parse(body.messages.at(-1).content).selections[0].text === source?.text
				);
			}),
		);
		await new Promise((resolve) => setTimeout(resolve, delay(record)));
		return new Response(record.body);
	};
}

it("overlaps sessions while preserving plan order and scores under reversed completion", async () => {
	const raw = await recordings();
	const execute = async (reverse: boolean) => {
		let active = 0;
		let peak = 0;
		const transport = replay(raw, (r) => (reverse ? 20 - selected.findIndex((c) => c.id === r.caseId) : 5));
		const result = await runBenchmark({
			...base,
			fake: false,
			key: "synthetic",
			transport: async (url, init) => {
				active++;
				peak = Math.max(peak, active);
				try {
					return await transport(url, init);
				} finally {
					active--;
				}
			},
		});
		return { result, peak };
	};
	const a = await execute(false);
	const b = await execute(true);
	expect(a.peak).toBeGreaterThan(1);
	expect(a.result.stopReason).toBeNull();
	expect(a.result.calls.map((c) => c.key)).toEqual(b.result.calls.map((c) => c.key));
	const stable = (run: typeof a.result) =>
		scoreBenchmark(run.calls).map(({ p50Ms: _p50, p95Ms: _p95, ...score }) => score);
	expect(stable(a.result)).toEqual(stable(b.result));
});

it("gates a failed verifier, bounds verification backlog, and resumes cached writers", async () => {
	const options = { ...base, models: [luna], cases: selected };
	const raw = await recordings(options);
	const writers = new Set<string>();
	const journal: RawRecord[] = [];
	let outage = false;
	let sendsAfter429 = 0;
	vi.useFakeTimers();
	const pending = runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		onRaw: async (r) => {
			journal.push(r);
		},
		transport: async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			if (body.model === deepseek.model) {
				outage = true;
				return Response.json({ error: { code: 429 } }, { status: 429 });
			}
			if (outage) sendsAfter429++;
			writers.add(body.messages.at(-1).content);
			return new Response(required(raw.find((r) => !r.key.endsWith(":verify"))).body);
		},
	});
	await vi.runAllTimersAsync();
	const stopped = await pending;
	expect(stopped.stopReason).toBeNull();
	expect(sendsAfter429).toBe(0);
	expect(writers.size).toBeLessThanOrEqual(selected.length);
	expect(stopped.incomplete).toHaveLength(selected.length);
	let regenerated = 0;
	const resumed = await runBenchmark({
		...options,
		previousCalls: stopped.calls,
		rawRecords: journal,
		onRaw: async (r) => {
			if (!r.key.endsWith(":verify") && stopped.calls.some((c) => c.key === r.key)) regenerated++;
		},
	});
	expect(resumed.stopReason).toBeNull();
	expect(resumed.incomplete).toEqual([]);
	expect(regenerated).toBe(0);
});

it("reserves five-attempt catalog bounds rather than calibrated means before concurrency", async () => {
	const reservations: number[] = [];
	const options = { ...base, models: [luna], cases: selected.slice(0, 1) };
	const worst = estimateBenchmark(options.models, options.cases, 1);
	await runBenchmark({
		...options,
		calibration: [
			{
				model: luna.model,
				provider: luna.provider,
				reasoning: luna.reasoning,
				inputTokens: 1,
				outputTokens: 1,
				samples: 1,
				pairOpenRouterCostMicros: 1,
				pairOpenaiCostMicros: 1,
			},
		],
		onReserve: async (r) => {
			if (!r.key.endsWith(":verify")) reservations.push(r.reservedMicros);
		},
	});
	expect(reservations[0]).toBeGreaterThanOrEqual(Math.round(worst.upperBoundUsd * 1e6) * 5);
});

it("parses explicit session, provider and backlog limits", () => {
	const options = parseOptions([
		"--session-concurrency",
		"8",
		"--openai-concurrency",
		"4",
		"--together-concurrency",
		"4",
		"--max-unverified",
		"4",
	]);
	expect(options).toMatchObject({
		sessionConcurrency: 8,
		openaiConcurrency: 4,
		togetherConcurrency: 4,
		maxUnverified: 4,
	});
});

it("raises Together only after improving clean windows, and backs off immediately on 429", () => {
	vi.useFakeTimers();
	const pool = new ProviderDispatch(dispatchLimits({}), () => false);
	const window = (ms: number) => {
		for (let i = 0; i < 8; i++) {
			vi.advanceTimersByTime(ms);
			pool.observe(deepseek, false, true);
		}
	};
	window(1000);
	expect(pool.limit(deepseek)).toBe(2);
	window(900);
	expect(pool.limit(deepseek)).toBe(3);
	window(800);
	expect(pool.limit(deepseek)).toBe(4);
	window(900);
	expect(pool.limit(deepseek)).toBe(3);
	pool.observe(deepseek, true, false);
	expect(pool.limit(deepseek)).toBe(1);
	window(100);
	expect(pool.limit(deepseek)).toBe(1);
});

it("shares provider slots across writer/verifier models and blocks acquisitions after stop", async () => {
	let stop = false;
	const pool = new ProviderDispatch(dispatchLimits({}), () => stop);
	const releases = Array.from({ length: 4 }, () => required(pool.tryAcquire(luna)));
	const terra = required(loadModels().find((m) => m.model.includes("terra")));
	expect(pool.tryAcquire(terra)).toBeUndefined();
	required(releases.pop())();
	const free = required(pool.tryAcquire(terra));
	stop = true;
	expect(pool.tryAcquire(luna)).toBeUndefined();
	await expect(pool.acquire(deepseek)).rejects.toThrow("BENCHMARK_STOPPED");
	free();
	releases.forEach((release) => release());
});

it("keeps both payer reservations atomic and settles once across a concurrent restart", async () => {
	const options = { ...base, models: loadModels().filter((m) => m.model === luna.model), cases: selected.slice(0, 2) };
	const raw = await recordings(options);
	const routerCap = 1_000_000;
	const openaiCap = 1_000_000;
	let router = 0;
	let openai = 0;
	const held = new Map<string, { router: number; openai: number }>();
	const settled = new Set<string>();
	let writerSends = 0;
	const transport = replay(raw);
	const result = await runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		budgetUsd: routerCap / 1e6,
		openaiBudgetUsd: openaiCap / 1e6,
		onReserve: async (r) => {
			if (!r.reservedMicros) return;
			const pair = { router: r.reservedOpenRouterMicros ?? 0, openai: r.reservedOpenaiMicros ?? 0 };
			held.set(r.key, pair);
			router += pair.router;
			openai += pair.openai;
			expect(router).toBeLessThanOrEqual(routerCap);
			expect(openai).toBeLessThanOrEqual(openaiCap);
		},
		onCall: async (c) => {
			expect(settled.has(c.key)).toBe(false);
			settled.add(c.key);
			const pair = required(held.get(c.key));
			router += required(c.openRouterCostMicros) - pair.router;
			openai += required(c.openaiCostMicros) - pair.openai;
		},
		transport: async (url, init) => {
			writerSends++;
			return transport(url, init);
		},
	});
	expect(result.stopReason).toBeNull();
	expect(result.reservedUsd).toBeCloseTo(router / 1e6, 9);
	expect(result.reservedOpenaiUsd).toBeCloseTo(openai / 1e6, 9);
	const sends = writerSends;
	const resumed = await runBenchmark({
		...options,
		previousCalls: result.calls,
		rawRecords: raw,
		fake: false,
		key: "synthetic",
		transport: async () => {
			writerSends++;
			throw new Error("DUPLICATE_COMPLETED_CALL");
		},
	});
	expect(writerSends).toBe(sends);
	expect(resumed.reservedUsd).toBe(result.reservedUsd);
	expect(resumed.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
});

it("dispatches fair variant coverage despite skewed completion latency", async () => {
	const options = {
		...base,
		models: loadModels()
			.filter((m) => m.model === luna.model)
			.slice(0, 2),
		cases: selected.slice(0, 5),
	};
	const raw = await recordings(options);
	const counts = new Map<string, number>();
	const transport = replay(raw, (r) => (r.reasoning === "low" ? 1 : 15));
	const result = await runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		transport,
		onReserve: async (r) => {
			if (!r.reservedMicros) return;
			const record = required(raw.find((raw) => raw.key === r.key));
			counts.set(record.reasoning, (counts.get(record.reasoning) ?? 0) + 1);
			const planned = options.models.map((m) => counts.get(m.reasoning) ?? 0);
			expect(Math.max(...planned) - Math.min(...planned)).toBeLessThanOrEqual(1);
		},
	});
	expect(result.stopReason).toBeNull();
});

it("preserves every variant without first-ten pruning under shuffled concurrent completion", async () => {
	const options = {
		...base,
		models: loadModels()
			.filter((m) => m.model === luna.model)
			.slice(0, 2),
	};
	const raw = await recordings(options);
	const execute = async (sessionConcurrency: number) => {
		const normal = replay(raw, (r) => (r.reasoning === "low" ? 1 : 10));
		return runBenchmark({
			...options,
			sessionConcurrency,
			fake: false,
			key: "synthetic",
			transport: async (url, init) => {
				const body = JSON.parse(String(init?.body));
				if (body.model === luna.model && body.reasoning.effort === "low")
					return Response.json({
						provider: "OpenAI",
						choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 10,
							cost: 0,
							cost_details: { upstream_inference_cost: 0.00001 },
						},
					});
				return normal(url, init);
			},
		});
	};
	const sequential = await execute(1);
	const concurrent = await execute(8);
	expect(concurrent.calls.filter((c) => c.reasoning === "low")).toHaveLength(selected.length);
	expect(concurrent.calls.filter((c) => c.reasoning === "medium")).toHaveLength(selected.length);
	expect(concurrent.calls.map((c) => c.key)).toEqual(sequential.calls.map((c) => c.key));
	expect(concurrent.modelStops).toEqual(sequential.modelStops);
	expect(concurrent.modelStops).toEqual([]);
});

it("bounds actual provider calls across multiple writer and verifier variants", async () => {
	const options = {
		...base,
		models: loadModels(),
		cases: selected.slice(0, 3),
		openaiConcurrency: 3,
		togetherConcurrency: 2,
		sessionConcurrency: 8,
	};
	const raw = await recordings(options);
	const normal = replay(raw);
	const active = new Map<string, number>();
	const peaks = new Map<string, number>();
	const result = await runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		transport: async (url, init) => {
			const provider = JSON.parse(String(init?.body)).provider.only[0] as string;
			const count = (active.get(provider) ?? 0) + 1;
			active.set(provider, count);
			peaks.set(provider, Math.max(peaks.get(provider) ?? 0, count));
			try {
				return await normal(url, init);
			} finally {
				active.set(provider, (active.get(provider) ?? 1) - 1);
			}
		},
	});
	expect(result.stopReason).toBeNull();
	expect(peaks.get("openai")).toBeLessThanOrEqual(3);
	expect(peaks.get("together")).toBeLessThanOrEqual(2);
	expect(peaks.has("google-vertex/global")).toBe(false);
	expect([...peaks.values()].some((peak) => peak > 1)).toBe(true);
});

it("reaches four actual Together calls after adaptive growth through the production adapter", async () => {
	const options = { ...base, models: loadModels(), cases: selected, runs: 2, budgetUsd: 100, openaiBudgetUsd: 100 };
	const raw = await recordings(options);
	const normal = replay(raw);
	const active = new Map<string, number>();
	const peaks = new Map<string, number>();
	let now = Date.now();
	let togetherCompletions = 0;
	const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
	try {
		const result = await runBenchmark({
			...options,
			fake: false,
			key: "synthetic",
			transport: async (url, init) => {
				const body = JSON.parse(String(init?.body));
				const model = body.model as string;
				active.set(model, (active.get(model) ?? 0) + 1);
				peaks.set(model, Math.max(peaks.get(model) ?? 0, active.get(model) ?? 0));
				try {
					return await normal(url, init);
				} finally {
					active.set(model, (active.get(model) ?? 1) - 1);
					if (body.provider.only[0] === "together") {
						now += togetherCompletions < 8 ? 1000 : togetherCompletions < 16 ? 900 : 100;
						togetherCompletions++;
					}
				}
			},
		});
		expect(result.stopReason).toBeNull();
		expect(result.calls).toHaveLength(options.models.length * selected.length * 2);
		expect(peaks.get(deepseek.model)).toBe(4);
		expect(peaks.get(luna.model)).toBe(4);
		expect(peaks.has("google/gemini-4-hydrogen")).toBe(false);
	} finally {
		clock.mockRestore();
	}
});

it.each(["openaiConcurrency", "togetherConcurrency"] as const)(
	"rejects %s above the adapter's eight-sequence ceiling",
	(key) => expect(() => dispatchLimits({ [key]: 9 })).toThrow("INVALID_CONCURRENCY"),
);

it("lets DeepSeek writers finish through Luna while keeping Luna writers gated on the failed judge", async () => {
	const raw = await recordings();
	const normal = replay(raw);
	let failed = false;
	let gatedWriterSends = 0;
	let independentWritersAfterFailure = 0;
	vi.useFakeTimers();
	const pending = runBenchmark({
		...base,
		fake: false,
		key: "synthetic",
		transport: async (url, init) => {
			const body = JSON.parse(String(init?.body));
			const verifier = String(body.messages[0].content).includes("usefulness");
			if (verifier && body.model === deepseek.model) {
				failed = true;
				return Response.json({ error: { code: 429 } }, { status: 429 });
			}
			if (!verifier && failed && body.model === luna.model) gatedWriterSends++;
			if (!verifier && failed && body.model === deepseek.model) independentWritersAfterFailure++;
			return normal(url, init);
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(result.stopReason).toBeNull();
	expect(gatedWriterSends).toBe(0);
	expect(independentWritersAfterFailure).toBeGreaterThan(0);
	expect(result.calls.filter((c) => c.model === deepseek.model && c.verifierAccepted)).toHaveLength(selected.length);
});

it.each([2, 4])(
	"caps unresolved writer outputs across all variants sharing a verifier at %s",
	async (maxUnverified) => {
		const options = {
			...base,
			models: loadModels().filter((m) => m.provider === "openai"),
			cases: selected.slice(0, 2),
			maxUnverified,
		};
		const raw = await recordings(options);
		const normal = replay(raw);
		let writers = 0;
		const journal: RawRecord[] = [];
		vi.useFakeTimers();
		const pending = runBenchmark({
			...options,
			fake: false,
			key: "synthetic",
			onRaw: async (r) => {
				journal.push(r);
			},
			transport: async (url, init) => {
				const body = JSON.parse(String(init?.body));
				if (body.model === deepseek.model) return Response.json({ error: { code: 429 } }, { status: 429 });
				writers++;
				return normal(url, init);
			},
		});
		await vi.runAllTimersAsync();
		const result = await pending;
		expect(result.stopReason).toBeNull();
		expect(writers).toBeGreaterThan(0);
		expect(writers).toBeLessThanOrEqual(options.models.length * options.cases.length);
		expect(result.calls.filter((c) => c.outcome === "transient").length).toBeLessThanOrEqual(writers);
		const resumed = await runBenchmark({ ...options, previousCalls: result.calls, rawRecords: journal });
		expect(resumed.incomplete).toEqual([]);
		expect(resumed.calls).toHaveLength(options.models.length * options.cases.length);
	},
);

it("retains unknown charges and prevents queued provider sends after a session billing hold", async () => {
	const options = {
		...base,
		sessionConcurrency: 1,
		models: loadModels()
			.filter((m) => m.provider === "openai")
			.sort((a, b) => Number(b.reasoning === "xhigh") - Number(a.reasoning === "xhigh")),
		cases: selected.slice(0, 2),
	};
	const raw = await recordings(options);
	const normal = replay(raw);
	let sends = 0;
	let observedUnknown = false;
	let sendsAfterUnknown = 0;
	const result = await runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		onCall: async (c) => {
			if (c.costMicros === null && c.outcome !== "transient") observedUnknown = true;
		},
		transport: async (url, init) => {
			if (observedUnknown) sendsAfterUnknown++;
			if (++sends !== 1) return normal(url, init);
			const response = await normal(url, init);
			const body = await response.json();
			delete body.usage.cost_details;
			return Response.json(body);
		},
	});
	expect(result.stopReason).toBeNull();
	expect(sendsAfterUnknown).toBeGreaterThan(0);
	expect(result.calls.some((c) => c.openaiCostMicros === null && (c.reservedOpenaiMicros ?? 0) > 0)).toBe(true);
	const settledOrHeld = result.calls.reduce((sum, c) => sum + (c.openaiCostMicros ?? c.reservedOpenaiMicros ?? 0), 0);
	expect(result.reservedOpenaiUsd).toBeCloseTo(settledOrHeld / 1e6, 9);
	const resumed = await runBenchmark({ ...options, previousCalls: result.calls });
	expect(resumed.stopReason).toBeNull();
	expect(resumed.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
});

it("reports a resumable stop when a resumed legacy backlog exceeds the new verifier cap", async () => {
	const options = { ...base, models: loadModels().filter((m) => m.provider === "openai"), cases: selected.slice(0, 1) };
	const raw = await recordings(options);
	const seed = await runBenchmark(options);
	vi.useFakeTimers();
	const pending = runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		previousCalls: seed.calls.map((c) => ({ ...c, outcome: "transient" })),
		rawRecords: raw,
		transport: async () => Response.json({ error: { code: 429 } }, { status: 429 }),
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(result.stopReason).toBeNull();
	expect(result.incomplete).toHaveLength(options.models.length);
});

it("counts cached writers toward backpressure before purchasing any new session on resume", async () => {
	const options = { ...base, models: loadModels().filter((m) => m.provider === "openai"), cases: selected.slice(0, 3) };
	const raw = await recordings(options);
	const seed = await runBenchmark(options);
	const cached = seed.calls.filter((c) => c.caseId === selected[2]?.id);
	const cachedKeys = new Set(cached.map((c) => c.key));
	let awaiting = cached.length;
	const normal = replay(raw);
	const result = await runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		previousCalls: cached.map((c) => ({ ...c, outcome: "transient" })),
		rawRecords: raw.filter((r) => cachedKeys.has(r.key)),
		onCall: async (c) => {
			if (cachedKeys.has(c.key)) awaiting--;
		},
		transport: async (url, init) => {
			const body = JSON.parse(String(init?.body));
			if (!String(body.messages[0].content).includes("usefulness")) expect(awaiting).toBeLessThan(4);
			return normal(url, init);
		},
	});
	expect(result.stopReason).toBeNull();
	expect(result.incomplete).toEqual([]);
});

it("gates writer retry attempts as soon as their verifier enters cooldown", async () => {
	const options = {
		...base,
		models: loadModels()
			.filter((m) => m.model === luna.model)
			.slice(0, 2),
		cases: selected.slice(0, 2),
	};
	const raw = await recordings(options);
	const normal = replay(raw);
	let failedJudge = false;
	let sendsAfterJudge429 = 0;
	vi.useFakeTimers();
	const pending = runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		transport: async (url, init) => {
			const body = JSON.parse(String(init?.body));
			if (body.model === deepseek.model) {
				failedJudge = true;
				return Response.json({ error: { code: 429 } }, { status: 429 });
			}
			if (failedJudge) sendsAfterJudge429++;
			if (body.reasoning.effort === "medium") return Response.json({ error: { code: 429 } }, { status: 429 });
			return normal(url, init);
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(sendsAfterJudge429).toBeGreaterThan(0);
	expect(result.stopReason).toBeNull();
});
