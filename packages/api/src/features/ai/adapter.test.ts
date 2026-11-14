import { expect, it, vi } from "vite-plus/test";
import { zodSchema } from "ai";
import { z } from "zod";
import { masterFields } from "@reactive-resume/schema/career-master";
import { executeApprovedStep } from "./adapter";
import { reviewHandlers } from "./review-handlers";
import { withAiRuntime } from "./route-policy";
import { syntheticRoute, syntheticRuntime } from "./testing/runtime";

it("supplies the exact extraction field contract and executable claim-boundary examples to writers", () => {
	const extraction = reviewHandlers["review.extraction"].systemPrompt ?? "";
	const contract = JSON.parse(extraction.split("Extraction field contract: ")[1] ?? "null");
	expect(contract).toEqual(
		Object.fromEntries(Object.entries(masterFields).map(([key, value]) => [key, Object.keys(value.shape)])),
	);
	const wording = reviewHandlers["review.wording"].systemPrompt ?? "";
	const examples = [
		...wording.matchAll(/^Valid (?:wording|missing-info|injection|no-change) example .*: (\{.*\})$/gmu),
	];
	expect(examples).toHaveLength(4);
	for (const example of examples)
		expect(reviewHandlers["review.wording"].output.safeParse(JSON.parse(example[1] ?? "null")).success).toBe(true);
});

function assertStrictSchema(value: object, path = "$", root = value as Record<string, unknown>): void {
	const node = value as Record<string, unknown>;
	if (node.$ref) {
		const target = String(node.$ref)
			.split("/")
			.slice(1)
			.reduce((value, key) => value[key] as Record<string, unknown>, root);
		assertStrictSchema(target, path, root);
		return;
	}
	if (Array.isArray(node.anyOf)) {
		for (const branch of node.anyOf) assertStrictSchema(branch as Record<string, unknown>, path, root);
		return;
	}
	expect(node.type, `${path} requires a type`).toBeDefined();
	if (node.type === "object") {
		expect(node.additionalProperties, path).toBe(false);
		const properties = node.properties as Record<string, Record<string, unknown>>;
		expect([...((node.required as string[]) ?? [])].sort(), path).toEqual(Object.keys(properties).sort());
		for (const [key, value] of Object.entries(properties)) assertStrictSchema(value, `${path}.${key}`, root);
	}
	if (node.type === "array") assertStrictSchema(node.items as Record<string, unknown>, `${path}[]`, root);
}
it("converts every T006 writer and verifier with the adapter SDK conversion into strict output schemas", async () => {
	for (const handler of Object.values(reviewHandlers)) {
		if (!handler.verifier) throw new Error("Missing T006 verifier");
		for (const output of [handler.output, handler.verifier.output]) {
			assertStrictSchema(await zodSchema(output).jsonSchema);
		}
	}
});
it.each([400, 200])("classifies HTTP %s request-schema errors without disabling a model", async (status) => {
	let attempts = 0;
	const result = await replayTransport(async () => {
		attempts++;
		return Response.json(
			{
				error: { code: 400, message: "invalid_json_schema", metadata: { provider_error_code: "invalid_json_schema" } },
			},
			{ status },
		);
	});
	expect(result).toMatchObject({ outcome: "REQUEST_SCHEMA_ERROR", costMicros: 0 });
	expect(attempts).toBe(1);
});
it("preserves HTTP 400 classification when the provider supplies a string error code", async () => {
	const result = await replayTransport(async () =>
		Response.json({ error: { code: "invalid_json_schema", message: "Invalid schema" } }, { status: 400 }),
	);
	expect(result.outcome).toBe("REQUEST_SCHEMA_ERROR");
});

it("serializes one structured request with no fallback, bounded tokens and no SDK retries", async () => {
	let request: Record<string, unknown> = {};
	const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
		request = JSON.parse(String(init?.body));
		return new Response(
			JSON.stringify({
				id: "response-1",
				model: "synthetic/model",
				provider: "Test",
				choices: [
					{ index: 0, message: { role: "assistant", content: '{"text":"Useful result"}' }, finish_reason: "stop" },
				],
				usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, cost: 0.00001 },
			}),
			{ headers: { "content-type": "application/json" } },
		);
	});
	const result = await withAiRuntime({ routes: [syntheticRoute], handlers: {}, workerAvailable: true, fetch }, () =>
		executeApprovedStep({
			route: syntheticRoute,
			operationId: "op",
			attemptId: "attempt",
			stepId: "answer",
			payload: { selections: [{ section: "skills", text: "TypeScript" }] },
			outputSchema: z.strictObject({ text: z.string() }),
			signal: new AbortController().signal,
		}),
	);
	expect(result).toMatchObject({
		outcome: "valid",
		output: { text: "Useful result" },
		responseId: "response-1",
		costMicros: 10,
	});
	expect(request).toMatchObject({
		model: "synthetic/model",
		max_tokens: 4096,
		provider: { only: ["Test"], allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true },
		response_format: { type: "json_schema" },
	});
	expect(request).not.toHaveProperty("tools");
	expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
	["length", '{"text":"Partial"}', "truncated"],
	["content_filter", "", "refusal"],
	["stop", '{"wrong":true}', "invalid"],
])("rejects %s output and preserves measured expense", async (finish, content, outcome) => {
	const fetch = vi.fn(
		async () =>
			new Response(
				JSON.stringify({
					id: "response",
					choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }],
					usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, cost: 0.00001 },
				}),
				{ headers: { "content-type": "application/json" } },
			),
	);
	const result = await withAiRuntime({ routes: [syntheticRoute], handlers: {}, workerAvailable: true, fetch }, () =>
		executeApprovedStep({
			route: syntheticRoute,
			operationId: "op",
			attemptId: "attempt",
			stepId: "generate",
			payload: { selections: [{ section: "skills", text: "TypeScript" }] },
			outputSchema: z.strictObject({ text: z.string() }),
			signal: new AbortController().signal,
		}),
	);
	expect(result).toMatchObject({ outcome, output: null, costMicros: 10 });
	expect(fetch).toHaveBeenCalledTimes(1);
});

it("holds ambiguous billing without retrying a dispatched request after owner cancellation", async () => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 5);
	const fetch = vi.fn(
		(_url: unknown, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = init?.signal;
				if (!signal) throw new Error("Missing abort signal");
				if (signal.aborted) reject(signal.reason);
				else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
			}),
	);
	const pending = withAiRuntime({ routes: [syntheticRoute], handlers: {}, workerAvailable: true, fetch }, () =>
		executeApprovedStep({
			route: { ...syntheticRoute, callTimeoutMs: 5 },
			operationId: "op",
			attemptId: "attempt",
			stepId: "answer",
			payload: { selections: [{ section: "skills", text: "TypeScript" }] },
			outputSchema: z.strictObject({ text: z.string() }),
			signal: controller.signal,
		}),
	);
	const result = await pending;
	clearTimeout(timer);
	expect(result).toMatchObject({ outcome: "transient", output: null, costMicros: null });
	expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([400, 401, 402, 403, 408, 429, 500, 502, 503])(
	"settles definitive HTTP %s rejection at zero cost",
	async (status) => {
		vi.useFakeTimers();
		const pending = withAiRuntime(
			{
				routes: [syntheticRoute],
				handlers: {},
				workerAvailable: true,
				fetch: async () =>
					new Response('{"error":{"message":"Rejected"}}', { status, headers: { "content-type": "application/json" } }),
			},
			() =>
				executeApprovedStep({
					route: syntheticRoute,
					operationId: "op",
					attemptId: "a",
					stepId: "generate",
					payload: { selections: [{ section: "skills", text: "TypeScript" }] },
					outputSchema: z.strictObject({ text: z.string() }),
					signal: new AbortController().signal,
				}),
		);
		await vi.runAllTimersAsync();
		const result = await pending;
		vi.useRealTimers();
		expect(result.costMicros).toBe(0);
		if (status === 408) expect(result.outcome).toBe("transient");
		expect(result.output).toBeNull();
	},
);
it("keeps a lost response after partial output conservatively unknown", async () => {
	const result = await withAiRuntime(
		{
			routes: [syntheticRoute],
			handlers: {},
			workerAvailable: true,
			fetch: async () =>
				new Response(
					new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode('{"choices":[{"message":{"content":"partial'));
						},
						pull(controller) {
							controller.error(new Error("Connection lost"));
						},
					}),
				),
		},
		() =>
			executeApprovedStep({
				route: syntheticRoute,
				operationId: "op",
				attemptId: "a",
				stepId: "generate",
				payload: { selections: [{ section: "skills", text: "TypeScript" }] },
				outputSchema: z.strictObject({ text: z.string() }),
				signal: new AbortController().signal,
			}),
	);
	expect(result).toMatchObject({ costMicros: null, outcome: "unknown", output: null });
});

const throttled = {
	error: {
		code: 429,
		message: "openai/gpt-6-luna is temporarily rate-limited upstream...",
		metadata: { error_type: "rate_limit_exceeded" },
	},
};
it("preserves the nested connection cause while removing embedded headers", async () => {
	const controller = new AbortController();
	const failures: unknown[] = [];
	const pending = withAiRuntime(
		{
			routes: [],
			handlers: {},
			workerAvailable: true,
			fetch: async () => {
				throw new TypeError("fetch failed", {
					cause: new Error('connect ECONNREFUSED; "headers":{"x-secret":"private-value"}'),
				});
			},
		},
		() =>
			executeApprovedStep(
				{
					route: syntheticRoute,
					operationId: "op",
					attemptId: "a",
					stepId: "answer",
					payload: { selections: [] },
					outputSchema: z.object({ text: z.string() }),
					signal: controller.signal,
				},
				{
					concurrencyLimit: 2,
					onAttempt: async (r) => {
						failures.push(r.failure);
						controller.abort();
					},
				},
			),
	);
	await pending;
	expect(failures).toEqual([
		expect.objectContaining({ causes: [{ errorClass: "Error", message: 'connect ECONNREFUSED; "[REDACTED]' }] }),
	]);
	expect(JSON.stringify(failures)).not.toContain("private-value");
});
async function replayTransport(fetch: typeof globalThis.fetch, signal = new AbortController().signal) {
	return withAiRuntime({ routes: [], handlers: {}, workerAvailable: true, fetch }, () =>
		executeApprovedStep({
			route: syntheticRoute,
			operationId: "op",
			attemptId: "a",
			stepId: "answer",
			payload: { selections: [] },
			outputSchema: z.object({ text: z.string() }),
			signal,
		}),
	);
}
it.each([TypeError, Error])(
	"retries an established pre-dispatch %s and preserves sanitized attempt diagnostics",
	async (ErrorClass) => {
		vi.useFakeTimers();
		try {
			const failures: unknown[] = [];
			let sends = 0;
			const pending = withAiRuntime(
				{
					routes: [],
					handlers: {},
					workerAvailable: true,
					fetch: async () => {
						if (++sends === 1)
							throw Object.assign(
								new ErrorClass(`connection failed ${syntheticRoute.apiKey}\nAuthorization: Bearer private-token`),
								{ code: "ECONNREFUSED" },
							);
						return Response.json({
							id: "recovered",
							choices: [
								{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" },
							],
							usage: { prompt_tokens: 4, completion_tokens: 3, cost: 0.00001 },
						});
					},
				},
				() =>
					executeApprovedStep(
						{
							route: syntheticRoute,
							operationId: "op",
							attemptId: "a",
							stepId: "answer",
							payload: { selections: [] },
							outputSchema: z.object({ text: z.string() }),
							signal: new AbortController().signal,
						},
						{
							concurrencyLimit: 2,
							onAttempt: async (r) => {
								failures.push(r.failure);
							},
						},
					),
			);
			await vi.runAllTimersAsync();
			expect(await pending).toMatchObject({ outcome: "valid", costMicros: 10 });
			expect(failures).toEqual([
				expect.objectContaining({
					errorClass: ErrorClass.name,
					httpStatus: null,
					bytesReceived: false,
					generationId: null,
					message: "connection failed [REDACTED]",
				}),
			]);
			expect(JSON.stringify(failures)).not.toContain("private-token");
		} finally {
			vi.useRealTimers();
		}
	},
);
it("retries HTTP 200 upstream errors with identical pinned requests and accounts for billed attempts", async () => {
	vi.useFakeTimers();
	try {
		const bodies: string[] = [];
		const pending = replayTransport(async (_url, init) => {
			bodies.push(String(init?.body));
			if (bodies.length === 1)
				return Response.json(
					{ ...throttled, usage: { prompt_tokens: 2, completion_tokens: 1, cost: 0.000002 } },
					{ headers: { "retry-after": "2" } },
				);
			return Response.json({
				id: "ok",
				choices: [{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" }],
				usage: { prompt_tokens: 4, completion_tokens: 3, cost: 0.00001 },
			});
		});
		await vi.advanceTimersByTimeAsync(1999);
		expect(bodies).toHaveLength(1);
		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ outcome: "valid", costMicros: 12, inputTokens: 6, outputTokens: 4 });
		expect(bodies).toHaveLength(2);
		expect(bodies[1]).toBe(bodies[0]);
	} finally {
		vi.useRealTimers();
	}
});
it.each([200, 429, 502, 503])(
	"bounds transient retries for HTTP %s without charging unbilled failures",
	async (status) => {
		vi.useFakeTimers();
		try {
			let attempts = 0;
			const pending = replayTransport(async () => {
				attempts++;
				return Response.json(throttled, { status });
			});
			await vi.runAllTimersAsync();
			expect(await pending).toMatchObject({ outcome: "transient", output: null, costMicros: 0 });
			expect(attempts).toBe(5);
		} finally {
			vi.useRealTimers();
		}
	},
);
it("leaves transient retries to the durable caller when transport retries are disabled", async () => {
	vi.useFakeTimers();
	try {
		const fetch = vi.fn(async () => Response.json(throttled, { status: 503 }));
		const pending = withAiRuntime({ ...syntheticRuntime, fetch }, () =>
			executeApprovedStep(
				{
					route: syntheticRoute,
					operationId: "op",
					attemptId: "attempt",
					stepId: "generate",
					payload: { selections: [] },
					outputSchema: z.strictObject({ text: z.string() }),
					signal: new AbortController().signal,
				},
				{ retry: false },
			),
		);
		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ outcome: "transient", output: null, costMicros: 0 });
		expect(fetch).toHaveBeenCalledTimes(1);
	} finally {
		vi.useRealTimers();
	}
});

it("limits concurrent calls to two per model and releases slots", async () => {
	let active = 0;
	let peak = 0;
	const release: (() => void)[] = [];
	const fetch: typeof globalThis.fetch = async () => {
		active++;
		peak = Math.max(peak, active);
		await new Promise<void>((resolve) => release.push(resolve));
		active--;
		return Response.json({ error: { code: 400, message: "unsupported" } }, { status: 400 });
	};
	const pending = Array.from({ length: 5 }, () => replayTransport(fetch));
	for (let i = 0; i < 10; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		release.splice(0).forEach((resolve) => resolve());
	}
	await Promise.all(pending);
	expect(peak).toBe(2);
	expect(active).toBe(0);
});

it.each([1, 4, 8])("uses an explicitly passed retry-sequence cap of %s", async (concurrencyLimit) => {
	const input = {
		route: syntheticRoute,
		operationId: "op",
		attemptId: "attempt",
		stepId: "answer",
		payload: { selections: [{ section: "skills" as const, text: "TypeScript" }] },
		outputSchema: z.strictObject({ text: z.string() }),
		signal: new AbortController().signal,
	};
	let active = 0;
	let peak = 0;
	const fetch: typeof globalThis.fetch = async () => {
		active++;
		peak = Math.max(peak, active);
		await new Promise((resolve) => setTimeout(resolve, 5));
		active--;
		return Response.json({ error: { code: 400 } }, { status: 400 });
	};
	await withAiRuntime({ routes: [syntheticRoute], handlers: {}, workerAvailable: true, fetch }, () =>
		Promise.all(Array.from({ length: 10 }, () => executeApprovedStep(input, { concurrencyLimit }))),
	);
	expect(peak).toBe(concurrencyLimit);
	expect(active).toBe(0);
});

it.each([0, -1, 1.5, 9, Number.NaN, Infinity])(
	"rejects an invalid explicit concurrency cap %s before dispatch",
	async (concurrencyLimit) => {
		await expect(
			executeApprovedStep(
				{
					route: syntheticRoute,
					operationId: "op",
					attemptId: "attempt",
					stepId: "answer",
					payload: { selections: [{ section: "skills", text: "TypeScript" }] },
					outputSchema: z.strictObject({ text: z.string() }),
					signal: new AbortController().signal,
				},
				{ concurrencyLimit },
			),
		).rejects.toThrow("AI_INVALID_CONCURRENCY_LIMIT");
	},
);

it("keeps production at two despite concurrency overrides in environment, runtime, route or payload", async () => {
	vi.stubEnv("AI_CONCURRENCY_LIMIT", "8");
	vi.stubEnv("concurrencyLimit", "8");
	const pollution = { concurrencyLimit: 8 };
	const pollutedRoute = { ...syntheticRoute, ...pollution };
	let active = 0;
	let peak = 0;
	try {
		await withAiRuntime(
			{
				routes: [pollutedRoute],
				handlers: {},
				workerAvailable: true,
				...pollution,
				fetch: async () => {
					active++;
					peak = Math.max(peak, active);
					await new Promise((resolve) => setTimeout(resolve, 5));
					active--;
					return Response.json({ error: { code: 400 } }, { status: 400 });
				},
			},
			() =>
				Promise.all(
					Array.from({ length: 5 }, () =>
						executeApprovedStep({
							route: pollutedRoute,
							operationId: "op",
							attemptId: "attempt",
							stepId: "answer",
							payload: { selections: [{ section: "skills", text: "TypeScript", ...pollution }] },
							outputSchema: z.strictObject({ text: z.string() }),
							signal: new AbortController().signal,
						}),
					),
				),
		);
		expect(peak).toBe(2);
		expect(active).toBe(0);
	} finally {
		vi.unstubAllEnvs();
	}
});

it("honors Retry-After dates and cancels backoff without losing billed usage", async () => {
	vi.useFakeTimers();
	try {
		const controller = new AbortController();
		let attempts = 0;
		const pending = replayTransport(async () => {
			attempts++;
			return Response.json(
				{ ...throttled, usage: { prompt_tokens: 2, cost: 0.000002 } },
				{ headers: { "retry-after": new Date(Date.now() + 60000).toUTCString() } },
			);
		}, controller.signal);
		await vi.advanceTimersByTimeAsync(30000);
		expect(attempts).toBe(1);
		controller.abort();
		expect(await pending).toMatchObject({ outcome: "transient", costMicros: 2, inputTokens: 2 });
		expect(attempts).toBe(1);
	} finally {
		vi.useRealTimers();
	}
});
it("retains unknown billing on errors with usage but no cost", async () => {
	let attempts = 0;
	const result = await replayTransport(async () => {
		attempts++;
		return Response.json({ ...throttled, usage: { prompt_tokens: 2 } });
	});
	expect(result).toMatchObject({ outcome: "transient", costMicros: null, inputTokens: 2 });
	expect(attempts).toBe(1);
});
it("does not retry a non-transient error inside HTTP 200", async () => {
	let attempts = 0;
	const result = await replayTransport(async () => {
		attempts++;
		return Response.json({ error: { code: 400, message: "unsupported" } });
	});
	expect(result).toMatchObject({ outcome: "refusal", output: null, costMicros: 0 });
	expect(attempts).toBe(1);
});

it("honors Retry-After on a non-JSON upstream outage", async () => {
	vi.useFakeTimers();
	try {
		let attempts = 0;
		const pending = replayTransport(async () => {
			attempts++;
			return new Response("upstream overloaded", { status: 503, headers: { "retry-after": "50" } });
		});
		await vi.advanceTimersByTimeAsync(30000);
		expect(attempts).toBe(1);
		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ outcome: "transient", costMicros: 0 });
		expect(attempts).toBe(3);
	} finally {
		vi.useRealTimers();
	}
});

it("holds unknown cost without retry after a dispatched connection loss", async () => {
	vi.useFakeTimers();
	try {
		let sends = 0;
		const pending = replayTransport(async (_url, init) => {
			expect(init?.body).toBeTruthy();
			sends++;
			throw new TypeError("fetch failed", {
				cause: Object.assign(new Error("socket closed after request write"), { code: "ECONNRESET", bytesWritten: 512 }),
			});
		});
		await vi.runAllTimersAsync();
		expect(await pending).toMatchObject({ output: null, costMicros: null });
		expect(sends).toBe(1);
	} finally {
		vi.useRealTimers();
	}
});
