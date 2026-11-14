import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { runBenchmark, type RawRecord, type RunOptions } from "./runner";
import { vertexFixture } from "./vertex-test-fixture";

afterEach(() => vi.useRealTimers());

async function seed() {
	const models = loadModels()
		.filter((m) => m.model === "openai/gpt-6-luna")
		.slice(0, 3);
	const raw: RawRecord[] = [];
	const options: RunOptions = {
		models,
		cases: [required(cases.find((c) => c.id === "r2-h01-wording"))],
		runs: 1,
		fake: true,
		budgetUsd: 10,
	};
	await runBenchmark({
		...options,
		onRaw: async (r) => {
			raw.push(r);
		},
	});
	return { options, raw };
}

it("recovers ten verifier 429s in-run, then resumes only verification", async () => {
	const { options, raw } = await seed();
	const journal: RawRecord[] = [];
	const reservations: { key: string; reservedMicros: number }[] = [];
	let verifies = 0;
	const transport: typeof fetch = async (_url, init) => {
		const body = JSON.parse(String(init?.body));
		expect(body.provider.allow_fallbacks).toBe(false);
		if (body.model.startsWith("deepseek/")) {
			expect(body.provider.only).toEqual(["together"]);
			verifies++;
			if (verifies <= 10)
				return Response.json({ error: { code: 429, message: "temporarily rate-limited upstream" } }, { status: 429 });
			return new Response(required(raw.find((r) => r.key.endsWith(":verify"))).body);
		}
		return new Response(
			required(raw.find((r) => !r.key.endsWith(":verify") && r.reasoning === body.reasoning.effort)).body,
		);
	};
	vi.useFakeTimers();
	const pending = runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		transport,
		onRaw: async (r) => {
			journal.push(r);
		},
		onReserve: async (r) => {
			reservations.push(r);
		},
	});
	await vi.runAllTimersAsync();
	const first = await pending;
	expect(first.stopReason).toBeNull();
	expect(first.calls).toHaveLength(3);
	expect(verifies).toBe(13);
	expect(first.calls.every((c) => c.outcome === "valid" && c.verifierAccepted)).toBe(true);
	expect(first.incomplete).toEqual([]);
	expect(journal.filter((r) => r.key.endsWith(":verify"))).toHaveLength(13);
	expect(reservations.filter((r) => r.key.endsWith(":verify")).every((r) => r.reservedMicros === 0)).toBe(true);
	expect(
		scoreBenchmark(first.calls)
			.filter((g) => g.dimension === "model")
			.every((g) => g.transientProviderFailures === 0 && g.verifierFaults === 0),
	).toBe(true);
	let writerSends = 0;
	let verifierSends = 0;
	const retry = runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		previousCalls: first.calls,
		rawRecords: journal,
		pendingReservations: reservations,
		transport: async (_url, init) => {
			const body = JSON.parse(String(init?.body));
			if (!body.model.startsWith("deepseek/")) writerSends++;
			else verifierSends++;
			return new Response(required(raw.find((r) => r.key.endsWith(":verify"))).body);
		},
	});
	await vi.runAllTimersAsync();
	const resumed = await retry;
	expect(resumed.stopReason).toBeNull();
	expect(resumed.calls).toHaveLength(3);
	expect(resumed.calls.every((c) => c.outcome === "valid" && c.verifierAccepted)).toBe(true);
	expect(resumed.incomplete).toEqual([]);
	expect(writerSends).toBe(0);
	expect(verifierSends).toBe(0);
	expect(resumed.reservedUsd).toBeGreaterThanOrEqual(first.reservedUsd);
	expect(resumed.reservedOpenaiUsd).toBe(first.reservedOpenaiUsd);
	const again = await runBenchmark({
		...options,
		previousCalls: resumed.calls,
		rawRecords: journal,
		onRaw: async () => {
			throw new Error("COMPLETED_SESSION_SENT");
		},
	});
	expect(again.reservedUsd).toBe(resumed.reservedUsd);
	expect(again.reservedOpenaiUsd).toBe(resumed.reservedOpenaiUsd);
});

it("ignores a standalone zero reservation and retries transient writers instead of replaying errors", async () => {
	const { options } = await seed();
	vi.useFakeTimers();
	const rawRecords: RawRecord[] = [];
	const pending = runBenchmark({
		...options,
		models: options.models.slice(0, 1),
		fake: false,
		key: "synthetic",
		transport: async () => Response.json({ error: { code: 429 } }, { status: 429 }),
		onRaw: async (r) => {
			rawRecords.push(r);
		},
	});
	await vi.runAllTimersAsync();
	const first = await pending;
	const retried = await runBenchmark({
		...options,
		models: options.models.slice(0, 1),
		previousCalls: first.calls,
		rawRecords,
		pendingReservations: [{ key: "orphan:verify", reservedMicros: 0 }],
	});
	expect(retried.stopReason).toBeNull();
	expect(retried.calls[0]?.outcome).toBe("valid");
	expect(retried.incomplete).toEqual([]);
});

it("cools only the exhausted provider/model and bounds attempts in a persistent outage within thirty minutes", async () => {
	const { options } = await seed();
	const google = vertexFixture;
	const models = [google, required(options.models[0]), { ...google, reasoning: "medium" as const }];
	const json = Response.json.bind(Response);
	const times: number[] = [];
	let healthyAt = 0;
	vi.useFakeTimers();
	const start = Date.now();
	const spy = vi.spyOn(Response, "json").mockImplementation((body, init) => {
		if (body?.id === "fake-response" && body.model === google.model) {
			times.push(Date.now());
			return json({ error: { code: 429 } }, { status: 429 });
		}
		if (body?.id === "fake-response") healthyAt = Date.now();
		return json(body, init);
	});
	try {
		const pending = runBenchmark({ ...options, models, runs: 20, openaiConcurrency: 1 });
		await vi.runAllTimersAsync();
		const result = await pending;
		expect(result.stopReason).toBeNull();
		expect(required(times[5]) - required(times[4])).toBeGreaterThanOrEqual(30_000);
		expect(healthyAt).toBeLessThan(required(times[5]));
		expect(Date.now() - start).toBeLessThan(32 * 60_000);
		expect(result.calls.some((c) => c.verifierFault)).toBe(false);
		expect(result.incomplete?.length).toBeGreaterThan(0);
	} finally {
		spy.mockRestore();
	}
});

it("requires a new writer and verifier after the study invalidates historical judgments", async () => {
	const { readRepairSource, createRepairPlan } = await import("./repair");
	const source = await readRepairSource(
		new URL("../results/2026-11-13T06-30-48.077Z-c283d9cd", import.meta.url).pathname,
	);
	const latest = [...new Map(source.history.previousCalls.map((c) => [c.key, c])).values()];
	const legacy = required(source.history.previousCalls.find((c) => c.verifierFault === "INVALID_VERIFIER_OUTPUT"));
	const settled = required(latest.find((c) => c.key === legacy.key));
	expect(settled.verifierAccepted).toBe(true);
	const { options } = await seed();
	const sent: string[] = [];
	const result = await runBenchmark({
		...options,
		models: source.manifest.models.filter((m) => m.model === settled.model && m.reasoning === settled.reasoning),
		cases: cases.filter((c) => c.id === settled.caseId),
		runs: 1,
		previousCalls: [settled],
		rawRecords: source.history.rawRecords.filter((r) => r.key === settled.key || r.key === settled.key + ":verify"),
		repairPlan: createRepairPlan(source.manifest, source.history),
		onRaw: async (raw) => {
			sent.push(raw.key);
		},
	});
	expect(result.stopReason).toBeNull();
	expect(sent).toEqual([settled.key, settled.key + ":verify"]);
	expect(result.calls[0]?.promptDigest).not.toBe(settled.promptDigest);
});

it("keeps a returned verifier provider mismatch global across resume", async () => {
	const { options } = await seed();
	const first = await runBenchmark({ ...options, models: options.models.slice(0, 1) });
	const call = required(first.calls[0]);
	const resumed = await runBenchmark({
		...options,
		previousCalls: [{ ...call, verifierUsage: { ...required(call.verifierUsage), provider: "azure" } }],
	});
	expect(resumed.stopReason).toBe("VERIFIER_PROVIDER_MISMATCH");
});

it("does not trust a syntactically valid verifier response without provider identity", async () => {
	const { options } = await seed();
	const json = Response.json.bind(Response);
	const spy = vi.spyOn(Response, "json").mockImplementation((body, init) => {
		if (body?.id === "fake-verifier") {
			const { provider: _provider, ...withoutProvider } = body;
			return json(withoutProvider, init);
		}
		return json(body, init);
	});
	try {
		const result = await runBenchmark(options);
		expect(result.stopReason).toBeNull();
		expect(
			result.calls.every(
				(c) => c.outcome === "transient" && !c.verifierAccepted && c.verifierFault === null && c.factRetention === null,
			),
		).toBe(true);
	} finally {
		spy.mockRestore();
	}
});
