import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries } from "./canaries";
import { loadModels } from "./config";
import { required } from "./required";
import { routeFor, verifierModelFor, type RawRecord } from "./runner";
import { verifyBenchmark } from "./verifier";

const c = required(loadJudgeCanaries().find((c) => c.category === "cover-letter" && c.language === "en"));
const model = verifierModelFor(required(loadModels().find((m) => m.provider === "openai")));
async function judge(cachedJudgments: RawRecord[] = [], rejectEvery = false, acceptFirst = false) {
	const raw: RawRecord[] = [];
	const requests: Record<string, unknown>[] = [];
	const result = await verifyBenchmark({
		options: {
			models: [model],
			cases: [],
			runs: 1,
			fake: true,
			budgetUsd: 100,
			onRaw: async (r) => {
				raw.push(r);
			},
			fakeTransport: async (_url, init, next) => {
				requests.push(JSON.parse(String(init?.body)));
				const response = await next();
				const envelope = await response.json();
				const verdict = JSON.parse(envelope.choices[0].message.content);
				if (rejectEvery || (!acceptFirst && cachedJudgments.length + requests.length === 1)) {
					verdict.verdicts[0].verdict = "unsupported";
					verdict.verdicts[0].reason = "Unsupported candidate fact.";
				}
				envelope.choices[0].message.content = JSON.stringify(verdict);
				return Response.json(envelope);
			},
		},
		model,
		c,
		route: routeFor(model, "synthetic", true, c),
		output: c.gold as Record<string, unknown>,
		parentKey: "recorded-session",
		runIndex: 0,
		promptHash: "prompt",
		fixtureHash: "fixture",
		cachedJudgments,
	});
	return { result, raw, requests };
}
it("buys exactly two independent judgments after rejection and replays all three without transport", async () => {
	const first = await judge();
	expect(first.requests).toHaveLength(3);
	expect(first.result.accepted).toBe(true);
	expect(new Set(first.raw.map((r) => r.key)).size).toBe(3);
	const replay = await judge(first.raw);
	expect(replay.requests).toHaveLength(0);
	expect(replay.raw).toHaveLength(0);
	expect(replay.result.verdict).toEqual(first.result.verdict);
	expect(replay.result.result.costMicros).toEqual(first.result.result.costMicros);
});
it("resumes the missing third judgment without buying the completed judgments", async () => {
	const first = await judge();
	const resumed = await judge(first.raw.slice(0, 2));
	expect(resumed.requests).toHaveLength(1);
	expect(resumed.result.accepted).toBe(true);
	expect(resumed.result.result.costMicros).toBe(first.result.result.costMicros);
});
it("does not re-judge an accepted result and retains a repeatedly caught defect", async () => {
	const accepted = await judge([], false, true);
	expect(accepted.requests).toHaveLength(1);
	const rejected = await judge([], true);
	expect(rejected.requests).toHaveLength(2);
	expect(rejected.result.accepted).toBe(false);
});
