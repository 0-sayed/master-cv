import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { executeApprovedStep } from "./adapter";
import { withAiRuntime } from "./route-policy";
import { syntheticRoute } from "./testing/runtime";

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

it("aborts a stalled request at its finite call timeout without retrying", async () => {
	const fetch = vi.fn(
		(_url: unknown, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = init?.signal;
				if (!signal) throw new Error("Missing abort signal");
				if (signal.aborted) reject(signal.reason);
				else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
			}),
	);
	const result = await withAiRuntime({ routes: [syntheticRoute], handlers: {}, workerAvailable: true, fetch }, () =>
		executeApprovedStep({
			route: { ...syntheticRoute, callTimeoutMs: 5 },
			operationId: "op",
			attemptId: "attempt",
			stepId: "answer",
			payload: { selections: [{ section: "skills", text: "TypeScript" }] },
			outputSchema: z.strictObject({ text: z.string() }),
			signal: new AbortController().signal,
		}),
	);
	expect(result).toMatchObject({ outcome: "unknown", output: null, costMicros: null });
	expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([400, 401, 402, 403, 408, 429, 500, 502, 503])(
	"settles definitive HTTP %s rejection at zero cost",
	async (status) => {
		const result = await withAiRuntime(
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
