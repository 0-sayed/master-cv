import { expect, it } from "vite-plus/test";
import { completionTokenLimit } from "@reactive-resume/api/features/ai/route-policy";
import { resolveReviewVerifierRoute } from "@reactive-resume/api/features/ai/verifier-policy";
import { resolveWriterRoute } from "@reactive-resume/api/features/ai/writer-policy";
import { realAiConfig } from "./real-ai-config";

it("refuses production and missing keys", () => {
	expect(() => realAiConfig({ NODE_ENV: "production", OPENROUTER_API_KEY: "fake" })).toThrow("DEV_ONLY");
	expect(() => realAiConfig({})).toThrow("OPENROUTER_API_KEY_REQUIRED");
});
it("pins the provisional writer and verifier bundle with bounded budgets", () => {
	const config = realAiConfig({ OPENROUTER_API_KEY: "fake", LOCAL_REAL_AI_OWNER_ID: "local-owner" });
	expect(config.port).toBe(3060);
	expect(config.appUrl).toBe("http://localhost:3060");
	expect(config.route).toMatchObject({
		model: "openai/gpt-6-luna",
		downstreamProvider: "azure",
		reasoningEffort: "low",
		maxRepairs: 0,
		maxCalls: 2,
		dayCapMicros: 3000000,
	});
	expect(config.route.verifier?.policy).toEqual({
		model: "deepseek/deepseek-v4.1-flash-1017",
		downstreamProvider: "together",
		reasoningEffort: "low",
	});
	expect(config.allowance).toEqual({ ownerId: "local-owner", limit: 50 });
	expect(realAiConfig({ OPENROUTER_API_KEY: "fake" }).allowance).toBeUndefined();
});
it("only permits explicitly enabled loopback stub URLs", () => {
	for (const url of ["https://example.com/api/v1", "http://127.0.0.1:3099/api/v1"]) {
		expect(() => realAiConfig({ OPENROUTER_API_KEY: "fake", OPENROUTER_BASE_URL: url })).toThrow("LOCAL_STUB_ONLY");
	}
	expect(() =>
		realAiConfig({
			OPENROUTER_API_KEY: "fake",
			FLAG_ALLOW_UNSAFE_AI_BASE_URL: "true",
			OPENROUTER_BASE_URL: "https://example.com/api/v1",
		}),
	).toThrow("LOCAL_STUB_ONLY");
	expect(
		realAiConfig({
			OPENROUTER_API_KEY: "fake",
			FLAG_ALLOW_UNSAFE_AI_BASE_URL: "true",
			OPENROUTER_BASE_URL: "http://127.0.0.1:3099/api/v1",
		}).stubBaseUrl,
	).toBe("http://127.0.0.1:3099/api/v1");
});

it("approves extraction high separately without allowing arbitrary writer upgrades", () => {
	const { route } = realAiConfig({ OPENROUTER_API_KEY: "fake" });
	expect(resolveWriterRoute(route, { kind: "review.extraction", parameters: {} })).toMatchObject({
		model: "openai/gpt-6-luna",
		reasoningEffort: "high",
		downstreamProvider: "azure",
		maxCallCostMicros: 100000,
	});
	expect(() =>
		resolveWriterRoute(
			route,
			{ kind: "review.wording", parameters: {} },
			{
				"review.wording": { model: "openai/gpt-6.1-terra", reasoningEffort: "high" },
			},
		),
	).toThrow("AI_WRITER_ROUTE_UNAPPROVED");
});

it("approves the existing result-question mode on Terra medium separately", () => {
	const { route } = realAiConfig({ OPENROUTER_API_KEY: "fake" });
	expect(resolveWriterRoute(route, { kind: "review.wording", parameters: { action: "result" } })).toMatchObject({
		model: "openai/gpt-6.1-terra",
		reasoningEffort: "medium",
		downstreamProvider: "azure",
		maxCallCostMicros: 100000,
	});
});

it.each([
	["summary", "openai/gpt-6.1-terra", "medium", 768, 1536],
	["job-evidence", "openai/gpt-6.1-terra", "medium", 512, 1024],
	["tailoring", "openai/gpt-6.1-terra", "medium", 512, 1024],
	["translation", "openai/gpt-6-luna", "low", 768, 960],
	["cover-letter", "openai/gpt-6.1-terra", "medium", 1536, 3072],
	["interview-prep", "openai/gpt-6.1-terra", "medium", 1536, 3072],
])(
	"resolves the owner-selected %s writer and measured completion budget",
	(task, model, reasoningEffort, visible, total) => {
		const { route } = realAiConfig({ OPENROUTER_API_KEY: "fake" });
		const selected = resolveWriterRoute(route, { kind: `review.${task}`, parameters: {} });
		expect(selected).toMatchObject({ model, reasoningEffort, maxOutputTokens: visible });
		expect(completionTokenLimit(selected)).toBe(total);
		expect(resolveReviewVerifierRoute(selected)).toMatchObject({
			model: "deepseek/deepseek-v4.1-flash-1017",
			reasoningEffort: "low",
			maxOutputTokens: 16384,
		});
		expect(completionTokenLimit(resolveReviewVerifierRoute(selected))).toBe(20480);
	},
);

it("keeps task output allowances inside the approved bundle and rejects invalid limits", () => {
	const { route } = realAiConfig({ OPENROUTER_API_KEY: "fake" });
	expect(
		resolveWriterRoute({ ...route, maxOutputTokens: 256 }, { kind: "review.cover-letter", parameters: {} })
			.maxOutputTokens,
	).toBe(256);
	for (const maxOutputTokens of [0, -1, 16385, 1.5]) {
		expect(() =>
			resolveWriterRoute(
				route,
				{ kind: "review.summary", parameters: {} },
				{
					"review.summary": { model: "openai/gpt-6.1-terra", reasoningEffort: "medium", maxOutputTokens },
				},
			),
		).toThrow();
	}
});
