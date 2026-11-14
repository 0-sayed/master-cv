import { afterEach, expect, it, vi } from "vite-plus/test";
import { withOpenRouterFee } from "./budget";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { scoreBenchmark } from "./metrics";
import { identityMapping } from "./report";
import { required } from "./required";
import { runBenchmark, type RawRecord, type RunOptions } from "./runner";

const target = required(cases.find((c) => c.id === "r2-h01-wording"));
const model = required(loadModels().find((m) => m.model === "openai/gpt-6.1-terra" && m.reasoning === "low"));
const base: RunOptions = {
	models: [model],
	cases: [target],
	runs: 1,
	fake: true,
	budgetUsd: 100,
	openaiBudgetUsd: 100,
	sessionConcurrency: 1,
};
afterEach(() => vi.useRealTimers());

async function harness(faults: number, fault: "length" | "invalid" | "citation" = "length") {
	const raw: RawRecord[] = [];
	const seed = await runBenchmark({
		...base,
		onRaw: async (r) => {
			raw.push(r);
		},
	});
	const writer = required(raw.find((r) => !r.key.endsWith(":verify")));
	const verifier = required(raw.find((r) => r.key.endsWith(":verify")));
	let writerSends = 0;
	const requests: string[] = [];
	const transport: typeof fetch = async (_url, init) => {
		const body = String(init?.body);
		if (JSON.parse(body).model === model.model) {
			writerSends++;
			return new Response(writer.body);
		}
		requests.push(body);
		const response = JSON.parse(verifier.body);
		if (requests.length <= faults) {
			if (fault === "length") {
				response.choices[0].finish_reason = "length";
				response.choices[0].message.content = "{";
			}
			if (fault === "invalid") response.choices[0].message.content = "{}";
			if (fault === "citation") {
				const verdict = JSON.parse(response.choices[0].message.content);
				verdict.factRetention.evidenceIds = ["E1"];
				response.choices[0].message.content = JSON.stringify(verdict);
			}
		}
		return Response.json(response);
	};
	return { seed, raw, transport, requests, writers: () => writerSends };
}

it.each(["length", "invalid", "citation"] as const)(
	"retries one %s fault with identical config and no writer regeneration, then continues",
	async (fault) => {
		const h = await harness(1, fault);
		const result = await runBenchmark({ ...base, runs: 2, fake: false, key: "synthetic", transport: h.transport });
		expect(result.stopReason).toBeNull();
		expect(result.calls).toHaveLength(2);
		expect(result.calls.every((c) => c.verifierAccepted && !c.verifierFault)).toBe(true);
		expect(h.writers()).toBe(2);
		expect(h.requests).toHaveLength(3);
		expect(h.requests[0]).toBe(h.requests[1]);
		const rawCost = required(h.seed.calls[0]?.totalOpenRouterBaseMicros);
		const routerCharge = withOpenRouterFee(rawCost * 2) + withOpenRouterFee(rawCost);
		expect(result.reservedUsd).toBe(routerCharge / 1e6);
		expect(result.reservedOpenaiUsd).toBe(required(h.seed.reservedOpenaiUsd) * 2);
		const again = await runBenchmark({ ...base, runs: 2, previousCalls: result.calls, transport: h.transport });
		expect(again.reservedUsd).toBe(result.reservedUsd);
		expect(again.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
	},
);

it("excludes persistent truncation after one retry, counts coverage, and continues", async () => {
	const h = await harness(2);
	const result = await runBenchmark({ ...base, runs: 2, fake: false, key: "synthetic", transport: h.transport });
	expect(result.stopReason).toBeNull();
	expect(result.incomplete).toEqual([]);
	expect(h.writers()).toBe(2);
	expect(h.requests).toHaveLength(3);
	expect(result.calls[0]).toMatchObject({ verifierFault: "VERIFIER_TRUNCATED", adjudication: "verifier-fault" });
	expect(result.calls[1]?.verifierAccepted).toBe(true);
	const score = required(scoreBenchmark(result.calls).find((g) => g.dimension === "model"));
	expect(score).toMatchObject({ runs: 2, writerRuns: 1, verifierFaults: 1, truncations: 0 });
	const report = identityMapping(result);
	expect(report.recommendationAllowed).toBe(true);
	expect(report.verifierFaults).toHaveLength(1);
	const sends = h.requests.length;
	const again = await runBenchmark({ ...base, runs: 2, previousCalls: result.calls, transport: h.transport });
	expect(h.requests).toHaveLength(sends);
	expect(again.incomplete).toEqual([]);
});

it("retries legacy faults once on resume, preserves other sessions and never double charges the writer", async () => {
	const h = await harness(0);
	const original = required(h.seed.calls[0]);
	for (const legacy of [
		{ verifierFault: "VERIFIER_TRUNCATED", verifierUsage: required(original.verifierUsage) },
		{
			verifierFault: "INVALID_VERIFIER_OUTPUT",
			verifierUsage: { ...required(original.verifierUsage), provider: "unknown" },
		},
	]) {
		const fault = { ...original, ...legacy, verifierAccepted: false, adjudication: "verifier-fault" as const };
		const result = await runBenchmark({
			...base,
			previousCalls: [fault],
			rawRecords: h.raw,
			fake: false,
			key: "synthetic",
			transport: h.transport,
		});
		expect(result.stopReason).toBeNull();
		expect(result.calls[0]?.verifierAccepted).toBe(true);
		expect(h.writers()).toBe(0);
		expect(result.reservedUsd).toBe(withOpenRouterFee(required(original.totalOpenRouterBaseMicros) * 2) / 1e6);
		expect(result.reservedOpenaiUsd).toBe(h.seed.reservedOpenaiUsd);
		const settled = await runBenchmark({ ...base, previousCalls: result.calls, rawRecords: h.raw });
		expect(settled.reservedUsd).toBe(result.reservedUsd);
		expect(settled.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
	}
	expect(h.requests).toHaveLength(2);
});

it("does not regenerate a writer when a legacy fault has no cached raw writer", async () => {
	const h = await harness(0);
	const fault = { ...required(h.seed.calls[0]), verifierFault: "VERIFIER_TRUNCATED", verifierAccepted: false };
	const result = await runBenchmark({
		...base,
		previousCalls: [fault],
		fake: false,
		key: "synthetic",
		transport: h.transport,
	});
	expect(result.stopReason).toBe("CACHED_WRITER_REQUIRED");
	expect(h.writers()).toBe(0);
	expect(h.requests).toHaveLength(0);
});

it("checks both payer budgets before a fault retry and resumes only that verification", async () => {
	const h = await harness(Infinity);
	const raw: RawRecord[] = [];
	const calls = [] as typeof h.seed.calls;
	const result = await runBenchmark({
		...base,
		fake: false,
		key: "synthetic",
		transport: h.transport,
		onRaw: async (r) => {
			raw.push(r);
		},
		onCall: async (c) => {
			calls.push(c);
		},
		onReserve: async () => {},
	});
	expect(result.stopReason).toBeNull();
	expect(calls).toHaveLength(2);
	const first = required(calls[0]);
	for (const payer of ["budgetUsd", "openaiBudgetUsd"] as const) {
		const cost = payer === "budgetUsd" ? required(first.openRouterCostMicros) : required(first.openaiCostMicros);
		const blocked = await runBenchmark({
			...base,
			[payer]: cost / 1e6,
			previousCalls: [first],
			rawRecords: raw,
			fake: false,
			key: "synthetic",
			transport: h.transport,
		});
		expect(blocked.stopReason).toBe(payer === "budgetUsd" ? "BUDGET_LIMIT" : "OPENAI_BUDGET_LIMIT");
		expect(blocked.incomplete).toHaveLength(1);
	}
});

it("keeps fault retries within verifier cooldown and resumes a transient retry without another writer", async () => {
	const h = await harness(1);
	const rawRecords: RawRecord[] = [];
	let attempts = 0;
	vi.useFakeTimers();
	const pending = runBenchmark({
		...base,
		fake: false,
		key: "synthetic",
		onRaw: async (r) => {
			rawRecords.push(r);
		},
		transport: async (url, init) => {
			if (JSON.parse(String(init?.body)).model !== model.model && ++attempts > 1)
				return Response.json({ error: { code: 429 } }, { status: 429 });
			return h.transport(url, init);
		},
	});
	await vi.runAllTimersAsync();
	const first = await pending;
	expect(first.stopReason).toBeNull();
	expect(first.calls[0]).toMatchObject({ outcome: "transient", verifierFault: null });
	expect(attempts).toBeGreaterThan(6);
	expect(h.writers()).toBe(1);
	const resumed = await runBenchmark({
		...base,
		previousCalls: first.calls,
		rawRecords,
		fake: false,
		key: "synthetic",
		transport: h.transport,
	});
	expect(resumed.stopReason).toBeNull();
	expect(resumed.calls[0]?.verifierAccepted).toBe(true);
	expect(resumed.reservedOpenaiUsd).toBe(first.reservedOpenaiUsd);
	expect(h.writers()).toBe(1);
});

it("retains a fault retry's unsettled reservation after interruption without dispatching again", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const { tmpdir } = await import("node:os");
	const { appendEvent, readJournal } = await import("./journal");
	const folder = await mkdtemp(join(tmpdir(), "verifier-fault-retry-"));
	const path = join(folder, "calls.jsonl");
	const h = await harness(Infinity);
	let reservations = 0;
	try {
		const interrupted = runBenchmark({
			...base,
			fake: false,
			key: "synthetic",
			transport: h.transport,
			onRaw: (data) => appendEvent(path, { type: "raw", data }),
			onCall: (data) => appendEvent(path, { type: "scored", data }),
			onReserve: async (data) => {
				await appendEvent(path, { type: "reserved", data });
				if (data.reservedMicros > 0 && ++reservations === 2) throw new Error("synthetic interruption");
			},
		});
		await expect(interrupted).rejects.toThrow("synthetic interruption");
		const history = await readJournal(path);
		expect(history.previousCalls).toHaveLength(1);
		expect(history.unsettledRetryReservations).toHaveLength(1);
		const count = h.requests.length;
		const resumed = await runBenchmark({ ...base, ...history, fake: false, key: "synthetic", transport: h.transport });
		expect(resumed.stopReason).toBe("PENDING_BILLING");
		expect(h.requests).toHaveLength(count);
		expect(h.writers()).toBe(1);
	} finally {
		await rm(folder, { recursive: true });
	}
});

it("stops above ten percent overall after fifty completed verifications, and keeps the boundary resumable", async () => {
	const models = loadModels().filter((m) => m.model === "openai/gpt-6-luna");
	const options = { ...base, models, runs: 10 };
	const seed = await runBenchmark(options);
	expect(seed.calls).toHaveLength(50);
	// At most two faults for any variant: this isolates the overall threshold.
	const faults = (count: number) =>
		seed.calls.map((c, i) =>
			i < count
				? {
						...c,
						verifierFault: "VERIFIER_TRUNCATED",
						verifierFaultRetries: 1,
						verifierAccepted: false,
						adjudication: "verifier-fault" as const,
					}
				: c,
		);
	let sends = 0;
	const stopped = await runBenchmark({
		...options,
		runs: 11,
		previousCalls: faults(6),
		onRaw: async () => {
			sends++;
		},
	});
	expect(stopped.stopReason).toBe("VERIFIER_FAULT");
	expect(stopped.incomplete).toHaveLength(5);
	expect(sends).toBe(0);
	const boundary = await runBenchmark({ ...options, runs: 11, previousCalls: faults(5) });
	expect(boundary.stopReason).toBeNull();
	expect(boundary.incomplete).toEqual([]);
	expect(boundary.calls).toHaveLength(55);
});

it("stops a writer variant above twenty-five percent after ten verifications, independently of the overall floor", async () => {
	const seed = await runBenchmark({ ...base, runs: 10 });
	const withFaults = (count: number) =>
		seed.calls.map((c, i) =>
			i < count
				? {
						...c,
						verifierFault: "VERIFIER_TRUNCATED",
						verifierFaultRetries: 1,
						verifierAccepted: false,
						adjudication: "verifier-fault" as const,
					}
				: c,
		);
	let sends = 0;
	const stopped = await runBenchmark({
		...base,
		runs: 11,
		previousCalls: withFaults(3),
		onRaw: async () => {
			sends++;
		},
	});
	expect(stopped.stopReason).toBe("VERIFIER_FAULT");
	expect(stopped.incomplete).toHaveLength(1);
	expect(sends).toBe(0);
	const boundary = await runBenchmark({ ...base, runs: 11, previousCalls: withFaults(2) });
	expect(boundary.stopReason).toBeNull();
	expect(boundary.incomplete).toEqual([]);
});

it("drains a systemic stop durably and does not spend again on an unchanged resume", async () => {
	const h = await harness(Infinity);
	const rawRecords: RawRecord[] = [];
	const scored = [] as typeof h.seed.calls;
	const good = required(h.raw.find((r) => r.key.endsWith(":verify")));
	let verifies = 0;
	const stopped = await runBenchmark({
		...base,
		runs: 60,
		fake: false,
		key: "synthetic",
		transport: async (url, init) => {
			if (JSON.parse(String(init?.body)).model !== model.model && ++verifies <= 45) return new Response(good.body);
			return h.transport(url, init);
		},
		onRaw: async (r) => {
			rawRecords.push(r);
		},
		onCall: async (c) => {
			scored.push(c);
		},
	});
	expect(stopped.stopReason).toBe("VERIFIER_FAULT");
	expect(stopped.calls).toHaveLength(51);
	expect(stopped.calls.filter((c) => c.verifierFault)).toHaveLength(6);
	expect(stopped.incomplete).toHaveLength(9);
	expect(scored).toHaveLength(57);
	const count = h.requests.length;
	const resumed = await runBenchmark({
		...base,
		runs: 60,
		previousCalls: scored,
		rawRecords,
		fake: false,
		key: "synthetic",
		transport: h.transport,
	});
	expect(resumed.stopReason).toBe("VERIFIER_FAULT");
	expect(resumed.incomplete).toHaveLength(9);
	expect(resumed.reservedUsd).toBe(stopped.reservedUsd);
	expect(resumed.reservedOpenaiUsd).toBe(stopped.reservedOpenaiUsd);
	expect(h.requests).toHaveLength(count);
});

it("shares the verifier dispatch limit across initial requests and fault retries", async () => {
	const h = await harness(Infinity);
	let active = 0;
	let maximum = 0;
	vi.useFakeTimers();
	const pending = runBenchmark({
		...base,
		models: [model, { ...model, reasoning: "medium" }],
		runs: 2,
		sessionConcurrency: 4,
		fake: false,
		key: "synthetic",
		transport: async (url, init) => {
			const verifying = JSON.parse(String(init?.body)).model !== model.model;
			if (verifying) {
				active++;
				maximum = Math.max(maximum, active);
			}
			try {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return await h.transport(url, init);
			} finally {
				if (verifying) active--;
			}
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(result.stopReason).toBeNull();
	expect(result.calls).toHaveLength(4);
	expect(h.writers()).toBe(4);
	expect(h.requests).toHaveLength(8);
	expect(maximum).toBe(2);
});

it("keeps a few excluded sessions within the existing 252-session per-variant coverage rule", async () => {
	const result = await runBenchmark({ ...base, cases: cases.filter((c) => !c.exploratory), runs: 3, phase: "full" });
	expect(result.calls).toHaveLength(252);
	for (const c of result.calls.slice(0, 2)) {
		c.verifierFault = "VERIFIER_TRUNCATED";
		c.verifierFaultRetries = 1;
		c.adjudication = "verifier-fault";
		c.verifierAccepted = false;
	}
	const report = identityMapping(result);
	expect(report.recommendationAllowed).toBe(false); // Fake coverage remains diagnostic.
	expect(report.complete).toBe(true);
	expect(report.verifierFaults).toHaveLength(2);
});
