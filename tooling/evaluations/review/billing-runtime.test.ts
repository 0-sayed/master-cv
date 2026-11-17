import { expect, it } from "vite-plus/test";
import { responseCharge, unknownExposureLimit, settleRecordedCalls, settleFinishedCharge } from "./billing-runtime";
import { Budget } from "./budget";
import { loadModels } from "./config";
import recorded from "./fixtures/recorded-billing.json";
import { required } from "./required";

const price = { inputPerMillion: 0.5, outputPerMillion: 1.5 };
it("uses reported bills even when generated content is invalid JSON", () => {
	const body = JSON.stringify({
		id: "gen-broken",
		usage: {
			prompt_tokens: 100,
			completion_tokens: 20,
			cost: 0.002,
			is_byok: true,
			cost_details: { upstream_inference_cost: 0.003 },
		},
		choices: [{ message: { content: "{" } }],
	});
	expect(responseCharge(body, 200, price, true)).toMatchObject({
		router: 2000,
		openai: 3000,
		source: "response-usage",
	});
});
it("prices every output token including reasoning from the captured price snapshot", () => {
	const body = JSON.stringify({
		usage: {
			prompt_tokens: 100,
			completion_tokens: 200,
			completion_tokens_details: { reasoning_tokens: 150 },
			is_byok: true,
			cost: 0,
		},
	});
	expect(responseCharge(body, 200, price, true)).toMatchObject({
		router: 0,
		openai: 350,
		source: "usage-price-snapshot",
	});
	expect(responseCharge(body, 200, price, false).router).toBe(0);
});
it("uses exposure rather than the number of unresolved calls", () => {
	expect(unknownExposureLimit(40, 15)).toBe(5000000);
	expect(unknownExposureLimit(0.01, 0.01)).toBe(2000);
});
it("settles a recorded connection failure at zero without requesting another generation", async () => {
	const call = {
		key: "network",
		costMicros: null,
		openRouterCostMicros: null,
		openaiCostMicros: 0,
		unknownExposureMicros: 66150,
	};
	const result = await settleRecordedCalls(
		[call],
		[],
		[{ key: "network", failure: { httpStatus: null, bytesReceived: false, generationId: null } }],
		[],
	);
	expect(result[0]).toMatchObject({
		costMicros: 0,
		openRouterCostMicros: 0,
		openaiCostMicros: 0,
		unknownExposureMicros: 0,
	});
	expect(result[0]?.billingNotes).toContain("recorded connection failure before response: zero cost (Sayed D39)");
});
it("does not infer a free call from absent or partial response evidence", async () => {
	const call = { key: "unknown", costMicros: null, openRouterCostMicros: null, openaiCostMicros: 0 };
	expect((await settleRecordedCalls([call], [], [], []))[0]?.costMicros).toBeNull();
	expect(
		(
			await settleRecordedCalls(
				[call],
				[],
				[{ key: "unknown", failure: { httpStatus: 200, bytesReceived: true, generationId: "gen-partial" } }],
				[],
			)
		)[0]?.costMicros,
	).toBeNull();
});

it("recovers the saved writer and verifier parse-failure bills without parsing their generated JSON", () => {
	const charges = recorded.responses.map((r) => responseCharge(r.body, r.status, undefined, r.provider === "openai"));
	expect(charges).toEqual([
		{ router: 0, openai: 337, source: "response-usage" },
		{ router: 0, openai: 812, source: "response-usage" },
		{ router: 0, openai: 429, source: "response-usage" },
		{ router: 3521, openai: 0, source: "response-usage" },
	]);
});

it("settles the saved timeout and preserves completed rows by identity", async () => {
	const key = required(recorded.failures[0]).key;
	const held = { key, costMicros: null, openRouterCostMicros: null, openaiCostMicros: 0 };
	const finished = { key: "finished", costMicros: 337, openRouterCostMicros: 0, openaiCostMicros: 337 };
	const settled = await settleRecordedCalls([finished, held], recorded.responses, recorded.failures, loadModels());
	expect(settled[0]).toBe(finished);
	expect(settled[1]?.costMicros).toBe(0);
	expect((await settleRecordedCalls(settled, recorded.responses, recorded.failures, loadModels()))[1]).toBe(settled[1]);
});

it("queries generation metadata once per paid response before using token prices", async () => {
	let lookups = 0;
	const call = { key: "paid", costMicros: null };
	const raw = { key: "paid", status: 200, body: '{"id":"gen-partial","choices":[', provider: "openai" };
	const settled = await settleRecordedCalls([call], [raw, raw], [], [], async (id, byok) => {
		expect(id).toBe("gen-partial");
		expect(byok).toBe(true);
		lookups++;
		return { router: 0, openai: 125, source: "generation-stats" };
	});
	expect(lookups).toBe(1);
	expect(settled[0]).toMatchObject({ costMicros: 125, billingNotes: ["paid: generation-stats"] });
});

it("settles actual OpenRouter usage without charging the reservation fee buffer", async () => {
	const call = { key: "paid", costMicros: null };
	const raw = { key: "paid", status: 200, provider: "together", body: '{"id":"gen-paid","usage":{"cost":0.01}}' };
	expect((await settleRecordedCalls([call], [raw], [], []))[0]).toMatchObject({
		costMicros: 10000,
		openRouterCostMicros: 10000,
		openaiCostMicros: 0,
	});
});

it("uses the captured prices instead of a changed catalog when settling old token usage", async () => {
	const raw = {
		key: "paid",
		model: "model",
		provider: "openai",
		status: 200,
		billingPrice: price,
		body: '{"id":"gen-priced","usage":{"cost":0,"is_byok":true,"prompt_tokens":100,"completion_tokens":100}}',
	};
	const settled = await settleRecordedCalls(
		[{ key: "paid", costMicros: null }],
		[raw],
		[],
		[{ model: "model", provider: "openai", inputPerMillion: 1000, outputPerMillion: 1000 }],
	);
	expect(settled[0]).toMatchObject({ costMicros: 200, openRouterCostMicros: 0, openaiCostMicros: 200 });
});

it("settles an unbilled verifier attempt without erasing the paid writer charge", async () => {
	const call = { key: "held", costMicros: null, openRouterCostMicros: null, openaiCostMicros: 350 };
	const attempts = [{ key: "held:verify", failure: { httpStatus: null, bytesReceived: false, generationId: null } }];
	expect((await settleRecordedCalls([call], [], attempts, []))[0]).toMatchObject({
		costMicros: 350,
		openRouterCostMicros: 0,
		openaiCostMicros: 350,
	});
});
it("keeps a dispatched verifier charge unknown until billing evidence arrives", async () => {
	const call = { key: "held", costMicros: null, openRouterCostMicros: null, openaiCostMicros: 350 };
	const attempts = [
		{ key: "held:verify", failure: { httpStatus: null, bytesReceived: false, generationId: null, requestSent: true } },
	];
	expect((await settleRecordedCalls([call], [], attempts, []))[0]).toMatchObject(call);
});
it("does not settle a missing verifier receipt from a known writer receipt", async () => {
	const call = {
		key: "held",
		costMicros: null,
		openRouterCostMicros: null,
		openaiCostMicros: 350,
		verifierJudgments: [{ attempts: [{ key: "held:verify", costMicros: null }] }],
	};
	const raw = {
		key: "held",
		status: 200,
		provider: "openai",
		body: JSON.stringify({ usage: { cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.00035 } } }),
	};
	expect((await settleRecordedCalls([call], [raw], [], []))[0]).toMatchObject(call);
});

it("settles a verifier generation bill while retaining the known OpenAI charge", async () => {
	const call = { key: "held", costMicros: null, openRouterCostMicros: null, openaiCostMicros: 350 };
	const attempts = [
		{ key: "held:verify", failure: { httpStatus: 200, bytesReceived: true, generationId: "gen-held" } },
	];
	const lookedUp: string[] = [];
	const result = await settleRecordedCalls([call], [], attempts, [], async (id, byok) => {
		expect(byok).toBe(false);
		lookedUp.push(id);
		return { router: 1200, openai: 0, source: "generation-stats" };
	});
	expect(lookedUp).toEqual(["gen-held"]);
	expect(result[0]).toMatchObject({ costMicros: 1550, openRouterCostMicros: 1200, openaiCostMicros: 350 });
});

it("settles a verifier response without bytes or a generation identifier at zero", async () => {
	const call = { key: "held", costMicros: null, openRouterCostMicros: null, openaiCostMicros: 350 };
	const attempts = [{ key: "held:verify", failure: { httpStatus: 200, bytesReceived: false, generationId: null } }];
	expect((await settleRecordedCalls([call], [], attempts, []))[0]).toMatchObject({
		costMicros: 350,
		openRouterCostMicros: 0,
		openaiCostMicros: 350,
	});
});

it("repairs the recorded negative outage settlement from the three paid verifier receipts", async () => {
	const key = "f542b91ed0bd9340700fd218f1237c943bd352ee3c1d79bf85611947efb582b1";
	const broken = {
		key,
		costMicros: -464502,
		openRouterCostMicros: -464804,
		openaiCostMicros: 302,
		priorAttemptOpenRouterMicros: 472722,
		priorAttemptOpenaiMicros: 0,
		totalOpenRouterBaseMicros: 7918,
	};
	const raws = [0.008479116, 0.01031478, 0.0079179].map((cost, i) => ({
		key: `${key}:verify${i ? `:judge:${i + 1}` : ""}`,
		status: 200,
		provider: "together",
		body: JSON.stringify({ id: `gen-outage-${i}`, usage: { cost } }),
	}));
	const [settled] = await settleRecordedCalls([broken], raws, [], []);
	expect(settled).toMatchObject({
		costMicros: 27015,
		openRouterCostMicros: 26713,
		openaiCostMicros: 302,
		priorAttemptOpenRouterMicros: 0,
		priorAttemptOpenaiMicros: 0,
		totalOpenRouterBaseMicros: 26713,
	});
	expect(settled?.billingNotes).toContain("repaired negative settlement from recorded paid receipts (Sayed D39)");
});

it("records a finished charge above its reservation and applies the cap only to the next request", () => {
	const budget = new Budget(100);
	budget.reserve(60);
	expect(settleFinishedCharge(budget, 60, 120, "OpenRouter")).toContain("exceeded reservation by 60 microdollars");
	expect(budget.consumed).toBe(120);
	expect(() => budget.reserve(1)).toThrow("BUDGET_LIMIT");
});

it("keeps unknown charges held and rejects invalid settled amounts", () => {
	const budget = new Budget(100);
	budget.reserve(60);
	expect(settleFinishedCharge(budget, 60, null, "OpenRouter")).toBeNull();
	expect(budget.consumed).toBe(60);
	for (const amount of [-1, Number.NaN, 0.5])
		expect(() => settleFinishedCharge(budget, 60, amount, "OpenRouter")).toThrow("INVALID_SETTLED_COST");
	expect(budget.consumed).toBe(60);
});

it("repairs the outage attempt without pretending its earlier partial response is fully settled", async () => {
	const key = "f542b91ed0bd9340700fd218f1237c943bd352ee3c1d79bf85611947efb582b1";
	const broken = {
		key,
		costMicros: -464502,
		openRouterCostMicros: -464804,
		openaiCostMicros: 302,
		priorAttemptOpenRouterMicros: 472722,
		totalOpenRouterBaseMicros: 7918,
	};
	const raw = {
		key: `${key}:verify:judge:3`,
		status: 200,
		provider: "together",
		body: JSON.stringify({ id: "gen-1794903661-fNtMQSYKV85cSP2lKeWP", usage: { cost: 0.0079179 } }),
	};
	const attempts = [{ key: raw.key, failure: { httpStatus: 200, bytesReceived: true, generationId: null } }];
	const [repaired] = await settleRecordedCalls([broken], [raw], attempts, []);
	expect(repaired).toMatchObject({
		costMicros: 8220,
		openRouterCostMicros: 7918,
		openaiCostMicros: 302,
		priorAttemptOpenRouterMicros: 472722,
		totalOpenRouterBaseMicros: 7918,
	});
	expect(repaired?.billingNotes).toContain(
		"repaired negative settlement from recorded attempt charge; prior unknown charge remains held (Sayed D39)",
	);
	expect((await settleRecordedCalls([required(repaired)], [raw], attempts, []))[0]).toBe(repaired);
});
