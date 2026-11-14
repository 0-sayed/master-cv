import { afterEach, expect, it, vi } from "vite-plus/test";
import { z } from "zod";
import { usdToMicros } from "@reactive-resume/api/features/ai/adapter";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { captureResponse } from "./attempt";
import { loadModels } from "./config";
import { ProviderCooldown } from "./cooldown";
import { cases } from "./corpus";
import { executeApprovedStep, withAiRuntime } from "./production";
import { required } from "./required";
import { routeFor, runBenchmark, type RawRecord } from "./runner";
import { smokeCases, validateSmoke } from "./study";

const model = required(loadModels()[0]);
const options = { models: [model], cases: cases.slice(0, 1), runs: 1, fake: true, budgetUsd: 9, openaiBudgetUsd: 40 };
afterEach(() => vi.useRealTimers());
it("waits for lagging BYOK and provider metadata even when the router cost is already known", async () => {
	vi.useFakeTimers();
	let polls = 0;
	const pending = captureResponse(
		async (_url, init) => {
			if (init?.method !== "GET") return Response.json({ id: "lag", usage: { cost: 0 } });
			polls++;
			return Response.json({
				data: {
					id: "lag",
					total_cost: 0,
					...(polls < 3
						? {}
						: {
								provider_name: "OpenAI",
								upstream_inference_cost: 0.000123,
								is_byok: true,
								tokens_prompt: 10,
								tokens_completion: 20,
							}),
				},
			});
		},
		"https://offline.invalid",
		{ body: JSON.stringify({ provider: { only: ["openai"] } }) },
	);
	await vi.runAllTimersAsync();
	const result = await (await pending).json();
	expect(polls).toBe(3);
	expect(result.provider).toBe("OpenAI");
	expect(result.usage.cost_details.upstream_inference_cost).toBe(0.000123);
	expect(result.usage.is_byok).toBe(true);
});
it("converts reported decimal USD without a phantom microdollar", () => {
	expect(usdToMicros(0.000123)).toBe(123);
	expect(usdToMicros(0.0000001)).toBe(1);
	expect(usdToMicros(0.000123000001)).toBe(124);
	expect(usdToMicros(-1)).toBeNull();
	expect(usdToMicros(Number.POSITIVE_INFINITY)).toBeNull();
});
it("the matrix encoded-output fault reaches payload validation", async () => {
	const { createFaultTransport } = await import("./faults");
	const fake = createFaultTransport({ fault: "encoded-output", role: "writer", session: 1 });
	const result = await runBenchmark({ ...options, fakeTransport: fake.transport });
	expect(result.calls[0]?.guardError).toBe("AI_PAYLOAD_ENCODING");
});
it("uses calibrated pair exposure rather than the reservation ceiling for an isolated hold", async () => {
	vi.useFakeTimers();
	const pending = runBenchmark({
		...options,
		calibration: [
			{
				model: model.model,
				provider: model.provider,
				reasoning: model.reasoning,
				inputTokens: 1,
				outputTokens: 1,
				samples: 12,
				pairOpenRouterCostMicros: 2,
				pairOpenaiCostMicros: 3,
				referenceInputTokens: 100000,
			},
		],
		fakeTransport: async (_url, init, next, context) => {
			if (init?.method === "GET") return Response.json({ error: { code: 404 } }, { status: 404 });
			const data = await (await next()).json();
			if (context.role === "writer") delete data.usage.cost_details;
			return Response.json(data);
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(result.stopReason).toBeNull();
	expect(result.calls[0]?.unknownExposureMicros).toBe(7);
	expect(result.incomplete).toHaveLength(1);
});
async function step(transport: typeof fetch) {
	return withAiRuntime({ routes: [], handlers: {}, workerAvailable: false, fetch: transport }, () =>
		executeApprovedStep({
			route: routeFor(model, "synthetic"),
			operationId: "offline",
			attemptId: "1",
			stepId: "1",
			payload: { selections: [{ section: "summary", text: "Synthetic" }] },
			outputSchema: z.object({ text: z.string() }),
			signal: new AbortController().signal,
		}),
	);
}
it("expires verifier cooldown by time", () => {
	vi.useFakeTimers();
	const cooldown = new ProviderCooldown();
	cooldown.record(model, true, "transient");
	expect(cooldown.blocked(model)).toBe(true);
	vi.advanceTimersByTime(40_000);
	expect(cooldown.blocked(model)).toBe(false);
});
it.each([401, 402, 403])("classifies account HTTP %i systemically", async (status) => {
	const result = await step(async () => Response.json({ error: { code: status } }, { status }));
	expect(result.outcome).toBe("ACCOUNT_ERROR");
	expect(result.openaiCostMicros).toBe(0);
});
it.each(["invalid_prompt", "context_length_exceeded"])("keeps 400 %s session-local", async (code) => {
	const result = await step(async () =>
		Response.json({ error: { code: 400, metadata: { provider_error_code: code } } }, { status: 400 }),
	);
	expect(result.outcome).toBe("refusal");
});
it("does not poison BYOK billing after unbilled HTML errors", async () => {
	vi.useFakeTimers();
	let count = 0;
	const pending = step(async () =>
		++count === 1
			? new Response("<html>bad gateway</html>", { status: 502 })
			: Response.json({
					id: "good",
					provider: "OpenAI",
					choices: [{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" }],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 20,
						cost: 0,
						is_byok: true,
						cost_details: { upstream_inference_cost: 0.00002 },
					},
				}),
	);
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(result.outcome).toBe("valid");
	expect(result.openaiCostMicros).toBe(20);
});
it("does not silently accept OpenRouter funded OpenAI fallback", async () => {
	const result = await step(async () =>
		Response.json({
			id: "wrong-payer",
			provider: "OpenAI",
			choices: [{ index: 0, message: { role: "assistant", content: '{"text":"safe"}' }, finish_reason: "stop" }],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 20,
				cost: 0.00002,
				is_byok: false,
				cost_details: { upstream_inference_cost: 0 },
			},
		}),
	);
	expect(result.outcome).toBe("PAYER_MISMATCH");
	expect(result.openRouterCostMicros).toBe(20);
	expect(result.openaiCostMicros).toBe(0);
});
it("classifies explicit null-content refusal", async () => {
	const result = await step(async () =>
		Response.json({
			id: "refused",
			provider: "OpenAI",
			choices: [{ index: 0, message: { role: "assistant", content: null, refusal: "Policy" }, finish_reason: "stop" }],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 0,
				cost: 0,
				is_byok: true,
				cost_details: { upstream_inference_cost: 0 },
			},
		}),
	);
	expect(result.outcome).toBe("refusal");
});
it("keeps writer schema errors as smoke data and rejects incomplete variants by name", async () => {
	const all = loadModels();
	const selected = smokeCases(cases, all);
	const result = await runBenchmark({ ...options, models: all, cases: selected, phase: "smoke" });
	const first = required(result.calls[0]);
	first.outcome = "invalid";
	first.schemaValid = false;
	expect(() => validateSmoke(result, all, selected)).not.toThrow();
	for (const model of all) {
		const copy = structuredClone(result);
		const call = required(
			copy.calls.find(
				(c) => c.model === model.model && c.provider === model.provider && c.reasoning === model.reasoning,
			),
		);
		// Restore the previous variant, then invalidate exactly this variant's one session.
		Object.assign(required(copy.calls.find((c) => c.key === first.key)), { outcome: "valid", schemaValid: true });
		Object.assign(call, { outcome: "invalid", schemaValid: false });
		expect(() => validateSmoke(copy, all, selected)).not.toThrow();
		copy.calls = copy.calls.filter((c) => c.key !== call.key);
		expect(() => validateSmoke(copy, all, selected)).toThrow(`${model.model}@${model.reasoning}/${model.provider}`);
	}
});

it("keeps account and payer stops sticky until explicit systemic recovery", async () => {
	for (const fault of ["ACCOUNT_ERROR", "PAYER_MISMATCH"]) {
		const baseline = await runBenchmark(options);
		const previous = { ...required(baseline.calls[0]), outcome: fault };
		const result = await runBenchmark({ ...options, previousCalls: [previous] });
		expect(result.stopReason).toBe(fault);
	}
});
it("drains a cancellation and resumes without double billing", async () => {
	const controller = new AbortController();
	const raw: RawRecord[] = [];
	const first = await runBenchmark({
		...options,
		cases: cases.slice(0, 3),
		signal: controller.signal,
		onRaw: async (r) => {
			raw.push(r);
			if (r.key.endsWith(":verify")) controller.abort();
		},
	});
	expect(first.stopReason).toBe("INTERRUPTED");
	const resumed = await runBenchmark({
		...options,
		cases: cases.slice(0, 3),
		previousCalls: first.calls,
		rawRecords: raw,
	});
	expect(resumed.stopReason).toBeNull();
	expect(resumed.incomplete).toEqual([]);
	const baseline = await runBenchmark({ ...options, cases: cases.slice(0, 3) });
	expect(resumed.reservedUsd).toBe(baseline.reservedUsd);
	expect(resumed.reservedOpenaiUsd).toBe(baseline.reservedOpenaiUsd);
});
it("recovers five exhausted verifier 429s in-run using exactly one writer", async () => {
	vi.useFakeTimers();
	let writers = 0;
	let verifiers = 0;
	const pending = runBenchmark({
		...options,
		fakeTransport: async (_url, _init, next, context) => {
			if (context.role === "writer") writers++;
			else if (++verifiers <= 5)
				return Response.json(
					{ error: { code: 429, metadata: { error_type: "upstream_provider_shared_pool" } } },
					{ status: 429 },
				);
			return next();
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(result.stopReason).toBeNull();
	expect(result.incomplete).toEqual([]);
	expect(writers).toBe(1);
	expect(verifiers).toBe(6);
});
it("keeps 404 and schema failures local until a repeated schema provider error code", async () => {
	vi.useFakeTimers();
	let count = 0;
	const pending = runBenchmark({
		...options,
		fakeTransport: async (_url, _init, next, context) => {
			if (context.role === "writer" && ++count <= 2)
				return Response.json(
					{ error: { code: 400, metadata: { provider_error_code: "invalid_json_schema" } } },
					{ status: 400 },
				);
			return next();
		},
	});
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(count).toBe(2);
	expect(result.stopReason).toBe("REQUEST_SCHEMA_ERROR");
});
it("records encoded writer content as a session guard rejection", async () => {
	const result = await runBenchmark({
		...options,
		cases: cases.filter((c) => c.id === "r2-h01-wording"),
		fakeTransport: async (_url, _init, next, context) => {
			const response = await next();
			if (context.role !== "writer") return response;
			const data = await response.json();
			const output = JSON.parse(data.choices[0].message.content);
			output.proposals[0].text += " &amp;";
			output.proposals[0].claims = splitReviewClaims(output.proposals[0].text, ["selected"]);
			data.choices[0].message.content = JSON.stringify(output);
			return Response.json(data);
		},
	});
	expect(result.stopReason).toBeNull();
	expect(result.calls).toHaveLength(1);
	expect(result.calls[0]?.guardAccepted).toBe(false);
	expect(result.calls[0]?.guardError).toBe("AI_PAYLOAD_ENCODING");
});
it("requires fake mode for seeded chaos", async () => {
	const { parseOptions } = await import("./config");
	expect(() => parseOptions(["--chaos"])).toThrow("CHAOS_REQUIRES_FAKE");
	expect(parseOptions(["--fake", "--chaos", "--seed", "19"])).toMatchObject({ fake: true, chaos: true, seed: 19 });
});
it("rounds the OpenRouter fee once across cached-writer verifier retries", async () => {
	let calls = 0;
	const result = await runBenchmark({
		...options,
		fakeTransport: async (_url, _init, next, context) => {
			const data = await (await next()).json();
			if (context.role === "verifier") {
				data.usage.cost = 0.000001;
				if (++calls === 1) data.choices[0].finish_reason = "length";
			}
			return Response.json(data);
		},
	});
	expect(calls).toBe(2);
	expect(result.reservedUsd).toBe(0.000003);
	const again = await runBenchmark({ ...options, previousCalls: result.calls });
	expect(again.reservedUsd).toBe(result.reservedUsd);
});
