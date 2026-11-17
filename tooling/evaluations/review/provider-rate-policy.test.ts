import { afterEach, expect, it, vi } from "vite-plus/test";
import { ProviderRatePolicy, normalizeCapacityResponse } from "./provider-rate-policy";
import { required } from "./required";
afterEach(() => vi.useRealTimers());
it("reserves the documented Build token allowance atomically before concurrent requests", async () => {
	vi.useFakeTimers();
	const rate = new ProviderRatePolicy();
	const sent: number[] = [];
	const a = rate.beforeRequest("openai", 500000).then(() => sent.push(Date.now()));
	const b = rate.beforeRequest("openai", 500000).then(() => sent.push(Date.now()));
	await vi.advanceTimersByTimeAsync(0);
	expect(sent).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(59999);
	expect(sent).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1);
	await Promise.all([a, b]);
	expect(sent).toHaveLength(2);
	expect(required(sent[1]) - required(sent[0])).toBe(60000);
});
it("honors provider Retry-After and lower token headers across all workers", async () => {
	vi.useFakeTimers();
	const rate = new ProviderRatePolicy();
	rate.observe(
		"openai",
		new Response("", { status: 429, headers: { "retry-after": "7", "x-ratelimit-limit-tokens": "10000" } }),
		"",
	);
	let sent = false;
	const call = rate.beforeRequest("openai", 1000).then(() => {
		sent = true;
	});
	await vi.advanceTimersByTimeAsync(6999);
	expect(sent).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	await call;
	expect(sent).toBe(true);
	expect(rate.snapshot("openai").tokensPerMinute).toBe(8000);
});
it("treats in-flight credit holds as throttling while preserving real insufficient-credit errors", async () => {
	const body = JSON.stringify({
		error: {
			code: 402,
			metadata: { limit_source: "openrouter_in_flight_budget", reason: "in_flight_budget_exhausted" },
		},
	});
	const response = normalizeCapacityResponse(new Response(body, { status: 402 }), body);
	expect(response.status).toBe(429);
	expect((await response.json()).error.metadata.limit_source).toBe("openrouter_in_flight_budget");
	const insufficient = new Response("credit exhausted", { status: 402 });
	expect(normalizeCapacityResponse(insufficient, "credit exhausted")).toBe(insufficient);
});
it("keeps Together pauses separate from OpenAI and respects the dynamic reset header", async () => {
	vi.useFakeTimers();
	const rate = new ProviderRatePolicy();
	rate.observe("together", new Response("", { status: 429, headers: { "x-ratelimit-reset": "4" } }), "");
	let judge = false;
	const call = rate.beforeRequest("together", 100).then(() => {
		judge = true;
	});
	await rate.beforeRequest("openai", 100);
	await vi.advanceTimersByTimeAsync(3999);
	expect(judge).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	await call;
	expect(judge).toBe(true);
});

it("honors exhausted OpenAI quota reset durations before admitting the next worker", async () => {
	vi.useFakeTimers();
	const rate = new ProviderRatePolicy();
	rate.observe(
		"openai",
		new Response("", { headers: { "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "1m2s" } }),
		"",
	);
	let sent = false;
	const request = rate.beforeRequest("openai", 100).then(() => {
		sent = true;
	});
	await vi.advanceTimersByTimeAsync(61999);
	expect(sent).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	await request;
	expect(sent).toBe(true);
});
