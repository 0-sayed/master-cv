import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { executeApprovedStep } from "@reactive-resume/api/features/ai/adapter";
import { withAiRuntime } from "@reactive-resume/api/features/ai/route-policy";
import { resolveReviewVerifierRoute } from "@reactive-resume/api/features/ai/verifier-policy";
import { resolveWriterRoute } from "@reactive-resume/api/features/ai/writer-policy";
import { createRealAiRuntime } from "./real-ai-runtime";

it.each([
	{ kind: "review.wording", parameters: {}, model: "openai/gpt-6-luna", effort: "low", tokens: 5120 },
	{ kind: "review.extraction", parameters: {}, model: "openai/gpt-6-luna", effort: "high", tokens: 20480 },
	{
		kind: "review.wording",
		parameters: { action: "result" },
		model: "openai/gpt-6.1-terra",
		effort: "medium",
		tokens: 8192,
	},
])(
	"dispatches configured $kind @ $effort with completion bounds and metered cost",
	async ({ kind, parameters, model, effort, tokens }) => {
		const runtime = createRealAiRuntime({ OPENROUTER_API_KEY: "fake-local-only" });
		const approved = runtime.routes[0];
		if (!approved) throw new Error("Missing approved bundle");
		const route = resolveWriterRoute(approved, { kind, parameters });
		let body: Record<string, unknown> | undefined;
		const result = await withAiRuntime(
			{
				...runtime,
				fetch: async (_url, init) => {
					body = JSON.parse(String(init?.body));
					return Response.json({
						id: "synthetic",
						choices: [
							{ index: 0, message: { role: "assistant", content: '{"text":"Synthetic"}' }, finish_reason: "stop" },
						],
						usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.00001 },
					});
				},
			},
			() =>
				executeApprovedStep({
					route,
					operationId: "synthetic",
					attemptId: "synthetic",
					stepId: "writer",
					payload: { selections: [{ section: "skills", text: "Synthetic TypeScript skills" }] },
					outputSchema: z.object({ text: z.string() }),
					signal: new AbortController().signal,
				}),
		);
		expect(result).toMatchObject({ outcome: "valid", costMicros: 10, inputTokens: 10, outputTokens: 5 });
		expect(body).toMatchObject({
			model,
			reasoning: { effort, exclude: true },
			max_tokens: tokens,
			provider: { only: ["azure"], allow_fallbacks: false, data_collection: "deny", zdr: true },
		});
	},
);

it("sends writer and verifier through the production adapter to a local stub with privacy and metering", async () => {
	const requests: { model: string; provider: unknown; reasoning: unknown }[] = [];
	const stub = createServer(async (request, response) => {
		expect(request.url).toBe("/api/v1/chat/completions");
		expect(request.headers.authorization).toBe("Bearer fake-local-only");
		let body = "";
		for await (const chunk of request) body += chunk;
		requests.push(JSON.parse(body));
		response.setHeader("Content-Type", "application/json");
		response.end(
			JSON.stringify({
				id: "stub",
				model: requests.at(-1)?.model,
				choices: [
					{ index: 0, message: { role: "assistant", content: '{"text":"Synthetic sample"}' }, finish_reason: "stop" },
				],
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.00001 },
			}),
		);
	});
	stub.listen(0, "127.0.0.1");
	await once(stub, "listening");
	const address = stub.address();
	if (!address || typeof address === "string") throw new Error("Missing stub address");
	try {
		const runtime = createRealAiRuntime({
			OPENROUTER_API_KEY: "fake-local-only",
			OPENROUTER_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
			FLAG_ALLOW_UNSAFE_AI_BASE_URL: "true",
		});
		const writer = runtime.routes[0];
		if (!writer) throw new Error("Missing writer");
		for (const route of [writer, resolveReviewVerifierRoute(writer)]) {
			const result = await withAiRuntime(runtime, () =>
				executeApprovedStep({
					route,
					operationId: "synthetic",
					attemptId: "attempt",
					stepId: "step",
					payload: { selections: [{ section: "skills", text: "Synthetic TypeScript skills" }] },
					outputSchema: z.object({ text: z.string() }),
					signal: new AbortController().signal,
				}),
			);
			expect(result).toMatchObject({ outcome: "valid", costMicros: 10, inputTokens: 10, outputTokens: 5 });
		}
		expect(requests.map((request) => request.model)).toEqual([
			"openai/gpt-6-luna",
			"deepseek/deepseek-v4.1-flash-1017",
		]);
		for (const [index, request] of requests.entries()) {
			expect(request.provider).toEqual({
				only: [index === 0 ? "azure" : "together"],
				allow_fallbacks: false,
				require_parameters: true,
				data_collection: "deny",
				zdr: true,
			});
			expect(request.reasoning).toEqual({ effort: "low", exclude: true });
		}
		expect(() => runtime.fetch?.("https://example.com", {})).toThrow("LOCAL_STUB_PATH_DENIED");
	} finally {
		await new Promise<void>((resolve, reject) => stub.close((error) => (error ? reject(error) : resolve())));
	}
});
