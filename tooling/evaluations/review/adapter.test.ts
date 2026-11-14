import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { executeApprovedStep } from "@reactive-resume/api/features/ai/adapter";
import { withAiRuntime, completionTokenLimit, type ApprovedRoute } from "@reactive-resume/api/features/ai/route-policy";

export const route: ApprovedRoute = {
	routeId: "benchmark",
	routeRevision: "1",
	configRevision: "1",
	endpoint: "https://openrouter.ai/api/v1",
	model: "openai/gpt-6-luna",
	downstreamProvider: "azure",
	apiKey: "synthetic-key",
	noticeVersion: "synthetic",
	evidenceVersion: "synthetic",
	maxCalls: 1,
	maxRepairs: 0,
	callTimeoutMs: 30000,
	deadlineMs: 60000,
	maxInputCodePoints: 32000,
	maxOutputTokens: 1000,
	requestCapMicros: 100000,
	maxCallCostMicros: 100000,
	dayCapMicros: 100000,
};
it.each([
	["none", 1000],
	["low", 1250],
	["high", 5000],
] as const)("sends %s effort and reserves visible output space", async (effort, limit) => {
	let sent: Record<string, unknown> = {};
	const result = await withAiRuntime(
		{
			routes: [],
			handlers: {},
			workerAvailable: false,
			fetch: async (_url, init) => {
				sent = JSON.parse(String(init?.body));
				return Response.json({
					id: "fake",
					model: route.model,
					choices: [{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" }],
					usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.00001 },
				});
			},
		},
		() =>
			executeApprovedStep({
				route: { ...route, reasoningEffort: effort },
				operationId: "eval",
				attemptId: "1",
				stepId: "1",
				payload: { selections: [{ section: "summary", text: "Synthetic only" }] },
				outputSchema: z.object({ text: z.string() }),
				signal: new AbortController().signal,
			}),
	);
	expect(result.outcome).toBe("valid");
	expect(sent.reasoning).toEqual({ effort, exclude: true });
	expect(sent).not.toHaveProperty("seed");
	expect(sent).not.toHaveProperty("temperature");
	expect(sent.max_tokens ?? sent.max_completion_tokens).toBe(limit);
	expect(sent.provider).toEqual({
		only: ["azure"],
		allow_fallbacks: false,
		require_parameters: true,
		data_collection: "deny",
		zdr: true,
	});
});
it("defaults to no reasoning and rejects invalid reasoning limits", () => {
	expect(completionTokenLimit(route)).toBe(1000);
	expect(() => completionTokenLimit({ ...route, reasoningEffort: "nonsense" as "low" })).toThrow();
});

it("uses Gemini JSON mode while enforcing the complete schema locally", async () => {
	let sent: Record<string, unknown> = {};
	const schema = z.strictObject({ code: z.string().regex(/^CV-[0-9]+$/u), version: z.literal(2) });
	for (const content of [
		'{"code":"CV-7","version":2}',
		'{"code":"bad","version":2}',
		'{"code":"CV-7","version":3}',
		'{"code":"CV-7","version":2,"extra":true}',
	]) {
		const result = await withAiRuntime(
			{
				routes: [],
				handlers: {},
				workerAvailable: false,
				fetch: async (_url, init) => {
					sent = JSON.parse(String(init?.body));
					return Response.json({
						id: "offline",
						model: "google/gemini-4-hydrogen",
						choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
						usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0 },
					});
				},
			},
			() =>
				executeApprovedStep({
					route: {
						...route,
						model: "google/gemini-4-hydrogen",
						downstreamProvider: "google-vertex/global",
						reasoningEffort: "low",
					},
					operationId: "offline",
					attemptId: "1",
					stepId: "1",
					payload: { selections: [] },
					outputSchema: schema,
					signal: new AbortController().signal,
				}),
		);
		expect(result.outcome).toBe(content === '{"code":"CV-7","version":2}' ? "valid" : "invalid");
	}
	expect(sent.response_format).toEqual({ type: "json_object" });
	expect(JSON.stringify(sent.messages)).toContain("CV-");
	expect(sent.reasoning).toEqual({ effort: "low", exclude: true });
});

it("preserves measured usage and truncation when recorded verifier JSON ends mid-object", async () => {
	const replay = JSON.parse(readFileSync(new URL("./live-smoke-replay.json", import.meta.url), "utf8"));
	const result = await withAiRuntime(
		{
			routes: [],
			handlers: {},
			workerAvailable: false,
			fetch: async () => new Response(replay.partialVerifierBody, { status: 200 }),
		},
		() =>
			executeApprovedStep({
				route,
				operationId: "offline",
				attemptId: "1",
				stepId: "1",
				payload: { selections: [] },
				outputSchema: z.object({ verdicts: z.array(z.unknown()) }),
				signal: new AbortController().signal,
			}),
	);
	expect(result).toMatchObject({ outcome: "truncated", outputTokens: 1280 });
	expect(result.inputTokens).toBeGreaterThan(0);
	expect(result.costMicros).toBeGreaterThan(0);
});
it("records reasoning-only truncation and tokens when structured parsing fails", async () => {
	const result = await withAiRuntime(
		{
			routes: [],
			handlers: {},
			workerAvailable: false,
			fetch: async () =>
				Response.json({
					id: "length",
					model: route.model,
					choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "length" }],
					usage: { prompt_tokens: 10, completion_tokens: 1000, total_tokens: 1010, cost: 0.001 },
				}),
		},
		() =>
			executeApprovedStep({
				route,
				operationId: "eval",
				attemptId: "1",
				stepId: "1",
				payload: { selections: [{ section: "summary", text: "Synthetic" }] },
				outputSchema: z.object({ text: z.string() }),
				signal: new AbortController().signal,
			}),
	);
	expect(result).toMatchObject({ outcome: "truncated", inputTokens: 10, outputTokens: 1000, costMicros: 1000 });
});

it.each([["google/gemini-4-hydrogen", "google-vertex/global"]])(
	"keeps identical privacy controls for %s with its exact provider pin",
	async (model, pin) => {
		let sent: Record<string, unknown> = {};
		await withAiRuntime(
			{
				routes: [],
				handlers: {},
				workerAvailable: false,
				fetch: async (_url, init) => {
					sent = JSON.parse(String(init?.body));
					return Response.json({
						id: "synthetic",
						model,
						choices: [{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" }],
						usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.00001 },
					});
				},
			},
			() =>
				executeApprovedStep({
					route: { ...route, model, downstreamProvider: pin, reasoningEffort: "low" },
					operationId: "synthetic",
					attemptId: "1",
					stepId: "1",
					payload: { selections: [{ section: "summary", text: "Synthetic only" }] },
					outputSchema: z.object({ text: z.string() }),
					signal: new AbortController().signal,
				}),
		);
		expect(sent.provider).toEqual({
			only: [pin],
			allow_fallbacks: false,
			require_parameters: true,
			data_collection: "deny",
			zdr: true,
		});
	},
);
