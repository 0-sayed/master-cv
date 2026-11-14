import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { required } from "./required";
import { runBenchmark, type RawRecord } from "./runner";

afterEach(() => vi.useRealTimers());
const options = {
	models: loadModels().slice(0, 1),
	cases: cases.slice(0, 1),
	runs: 1,
	fake: true,
	budgetUsd: 9,
	openaiBudgetUsd: 40,
};
it.each(["fake-response", "fake-verifier"])(
	"records 132 offline smoke sessions while holding three ambiguous %s failures without re-buying",
	async (target) => {
		const cheap = loadModels().map((m) => ({ ...m, inputPerMillion: 0.001, outputPerMillion: 0.001 }));
		const original = Response.json.bind(Response);
		const attempts: unknown[] = [];
		let injected = 0;
		const spy = vi.spyOn(Response, "json").mockImplementation((body, init) => {
			if (body?.id === target && injected < 3) {
				if (++injected === 1) throw new TypeError("fetch rejected");
				if (injected === 2) throw new Error("local throw");
				return new Response(
					new ReadableStream({
						start(c) {
							c.error(new TypeError("body read failed"));
						},
					}),
				);
			}
			return original(body, init);
		});
		vi.useFakeTimers();
		try {
			const pending = runBenchmark({
				...options,
				models: cheap,
				verifierModels: cheap,
				cases,
				phase: "smoke",
				onAttempt: async (a) => {
					attempts.push(a);
				},
			});
			await vi.runAllTimersAsync();
			const result = await pending;
			expect(result.stopReason).toBeNull();
			expect(result.calls).toHaveLength(132);
			expect(result.calls.filter((c) => c.outcome === "valid")).toHaveLength(129);
			expect(result.calls.filter((c) => c.costMicros === null)).toHaveLength(3);
			expect(attempts).toHaveLength(3);
			expect(attempts[2]).toMatchObject({
				failure: {
					errorClass: "TypeError",
					httpStatus: 200,
					message: "body read failed",
					bytesReceived: false,
					generationId: null,
				},
			});
		} finally {
			spy.mockRestore();
		}
	},
);
it("keeps an ambiguous verifier reservation on restart without buying that generation again", async () => {
	const seed = required((await runBenchmark(options)).calls[0]);
	const held = {
		...seed,
		outcome: "transient",
		costMicros: null,
		openRouterCostMicros: null,
		openaiCostMicros: 3,
		reservedOpenRouterMicros: 10,
		reservedOpenaiMicros: 100000,
		reservedMicros: 100010,
	};
	const result = await runBenchmark({
		...options,
		previousCalls: [held],
		onRaw: async () => {
			throw new Error("UNKNOWN_GENERATION_SENT_TWICE");
		},
	});
	expect(result.stopReason).toBeNull();
	expect(result.calls).toEqual([held]);
	expect(result.reservedUsd).toBe(0.00001);
	expect(result.reservedOpenaiUsd).toBe(0.000003);
});

it.each(["writer", "verifier"])(
	"journals and retries proven pre-dispatch fetch rejection and local throw for %s",
	async (role) => {
		const raw: RawRecord[] = [];
		await runBenchmark({
			...options,
			onRaw: async (r) => {
				raw.push(r);
			},
		});
		const attempts: unknown[] = [];
		let injected = 0;
		vi.useFakeTimers();
		const pending = runBenchmark({
			...options,
			fake: false,
			key: "synthetic",
			transport: async (_url, init) => {
				const writer = JSON.parse(String(init?.body)).model.startsWith("openai/");
				if (writer === (role === "writer") && injected < 2) {
					const cause = Object.assign(new Error("offline connection setup"), { code: "ECONNREFUSED", bytesWritten: 0 });
					if (++injected === 1) throw new TypeError("fetch failed synthetic", { cause });
					throw new Error("local throw synthetic", { cause });
				}
				return new Response(required(raw.find((r) => r.key.endsWith(":verify") !== writer)).body);
			},
			onAttempt: async (a) => {
				attempts.push(a);
			},
		});
		await vi.runAllTimersAsync();
		const result = await pending;
		expect(result.stopReason).toBeNull();
		expect(result.calls[0]?.outcome).toBe("valid");
		expect(result.calls[0]?.costMicros).not.toBeNull();
		expect(attempts).toHaveLength(2);
		expect(attempts).toEqual([
			expect.objectContaining({
				failure: expect.objectContaining({
					errorClass: "TypeError",
					httpStatus: null,
					bytesReceived: false,
					generationId: null,
					message: "fetch failed [REDACTED]",
				}),
			}),
			expect.objectContaining({
				failure: expect.objectContaining({ errorClass: "Error", message: "local throw [REDACTED]" }),
			}),
		]);
	},
);

it.each(["writer", "verifier"])(
	"holds an ambiguous 200 body failure for %s and continues another session",
	async (role) => {
		const cheap = loadModels().map((m) => ({ ...m, inputPerMillion: 0.001, outputPerMillion: 0.001 }));
		const scoped = { ...options, models: cheap.slice(0, 2), verifierModels: cheap, sessionConcurrency: 1 };
		const raw: RawRecord[] = [];
		await runBenchmark({
			...scoped,
			onRaw: async (r) => {
				raw.push(r);
			},
		});
		const attempts: unknown[] = [];
		let injected = false;
		const result = await runBenchmark({
			...scoped,
			fake: false,
			key: "synthetic",
			transport: async (_url, init) => {
				const body = JSON.parse(String(init?.body));
				const writer = body.model.startsWith("openai/");
				if (!injected && writer === (role === "writer")) {
					injected = true;
					return new Response(
						new ReadableStream({
							start(c) {
								c.error(new TypeError("terminated"));
							},
						}),
					);
				}
				return new Response(
					required(
						raw.find((r) => r.key.endsWith(":verify") !== writer && (!writer || r.reasoning === body.reasoning.effort)),
					).body,
				);
			},
			onAttempt: async (a) => {
				attempts.push(a);
			},
		});
		expect(result.stopReason).toBeNull();
		expect(result.calls).toHaveLength(2);
		expect(result.calls.filter((c) => c.costMicros === null)).toHaveLength(1);
		expect(result.calls.filter((c) => c.outcome === "valid")).toHaveLength(1);
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({
			failure: {
				errorClass: "TypeError",
				httpStatus: 200,
				bytesReceived: false,
				generationId: null,
				message: "terminated",
			},
		});
	},
);

it.each([
	[3, 50000, null],
	[4, 40000, "BILLING_UNKNOWN"],
	[1, 50001, "BILLING_UNKNOWN"],
] as const)("bounds unknown holds at %s sessions / %s micros", async (count, micros, stop) => {
	const seed = required((await runBenchmark(options)).calls[0]);
	const unknown = Array.from({ length: count }, (_, i) => ({
		...seed,
		key: `unknown-${i}`,
		unknownExposureMicros: i === 0 ? micros : 0,
		costMicros: null,
		openRouterCostMicros: 0,
		openaiCostMicros: null,
		reservedOpenRouterMicros: 0,
		reservedOpenaiMicros: i === 0 ? micros : 0,
		reservedMicros: i === 0 ? micros : 0,
	}));
	const result = await runBenchmark({ ...options, cases: [], previousCalls: unknown });
	expect(result.stopReason).toBe(stop);
	expect(result.reservedOpenaiUsd).toBe(micros / 1e6);
});

it("looks up a failed generation and settles both payers without resending it", async () => {
	const raw: RawRecord[] = [];
	await runBenchmark({
		...options,
		onRaw: async (r) => {
			raw.push(r);
		},
	});
	const attempts: unknown[] = [];
	let lookups = 0;
	let sends = 0;
	vi.useFakeTimers();
	const pending = runBenchmark({
		...options,
		fake: false,
		key: "synthetic",
		transport: async (url, init) => {
			if (new URL(String(url)).pathname.endsWith("/generation")) {
				lookups++;
				expect(init?.method).toBe("GET");
				expect(new URL(String(url)).searchParams.get("id")).toBe("gen-failed");
				return Response.json({ data: { id: "gen-failed", total_cost: 0.000002, upstream_inference_cost: 0.000003 } });
			}
			if (++sends > 1)
				return new Response(
					required(
						raw.find((r) => r.key.endsWith(":verify") === JSON.parse(String(init?.body)).model.startsWith("deepseek/")),
					).body,
				);
			return new Response(
				new ReadableStream({
					start(c) {
						c.enqueue(new TextEncoder().encode('{"id":"gen-failed",'));
					},
					pull(c) {
						c.error(new TypeError("terminated"));
					},
				}),
			);
		},
		onAttempt: async (a) => {
			attempts.push(a);
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	// The cost is available, but this fixture never returns provider/token/BYOK metadata.
	// Exhaust the bounded GET-only reconciliation window without buying the lost response again.
	expect(lookups).toBe(3);
	expect(result.stopReason).toBeNull();
	expect(result.calls[0]?.writerBilling?.openaiCostMicros).toBe(
		Math.ceil(
			JSON.parse(required(raw.find((r) => !r.key.endsWith(":verify"))).body).usage.cost_details
				.upstream_inference_cost * 1e6,
		) + 3,
	);
	expect(result.incomplete).toEqual([]);
	expect(attempts[0]).toMatchObject({
		failure: { errorClass: "TypeError", httpStatus: 200, bytesReceived: true, generationId: "gen-failed" },
	});
});
