import type { AiRuntime, ApprovedRoute } from "../route-policy";
import { z } from "zod";

export const syntheticRoute: ApprovedRoute = {
	routeId: "synthetic",
	routeRevision: "1",
	configRevision: "1",
	endpoint: "https://openrouter.ai/api/v1",
	model: "synthetic/model",
	downstreamProvider: "Test",
	apiKey: "synthetic-never-real",
	noticeVersion: "1",
	evidenceVersion: "synthetic-only",
	maxCalls: 3,
	maxRepairs: 1,
	callTimeoutMs: 30000,
	deadlineMs: 120000,
	maxInputCodePoints: 32000,
	maxOutputTokens: 4096,
	requestCapMicros: 10000,
	maxCallCostMicros: 3333,
	dayCapMicros: 100000,
};
export const syntheticRuntime: AiRuntime = {
	routes: [syntheticRoute],
	workerAvailable: true,
	handlers: {
		review: {
			promptVersion: "1",
			schemaVersion: "1",
			parameters: z.strictObject({}),
			output: z.strictObject({ text: z.string().min(1) }),
			buildInput: () =>
				Promise.resolve({
					selections: [{ section: "skills", confirmed: true, text: "Synthetic TypeScript skills" }],
					contactValues: [],
				}),
			resultState: "waiting_review",
		},
	},
	fetch: () =>
		Promise.resolve(
			new Response(
				JSON.stringify({
					id: "synthetic-response",
					model: "synthetic/model",
					provider: "Test",
					choices: [
						{ index: 0, message: { role: "assistant", content: '{"text":"Synthetic review"}' }, finish_reason: "stop" },
					],
					usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, cost: 0.00001 },
				}),
				{ headers: { "content-type": "application/json" } },
			),
		),
};
