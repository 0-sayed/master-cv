import { expect, it } from "vite-plus/test";
import { assertJudgeCanaries, loadJudgeCanaries, runJudgeCanaries, type JudgeCanaryReceipt } from "./canaries";
import { loadModels } from "./config";
import { scoreBenchmark } from "./metrics";
import { required } from "./required";
import { runBenchmark, type RawRecord } from "./runner";

const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
const writer = required(models.find((m) => m.reasoning === "low"));
const cases = loadJudgeCanaries().filter((c) => c.category === "summary");
const options = {
	models: [writer],
	cases,
	runs: 1,
	fake: true,
	budgetUsd: 10,
	openaiBudgetUsd: 10,
	sessionConcurrency: 3,
};

it("resumes calibration after concurrent credit exhaustion without rebuying completed probes", async () => {
	let receipt: JudgeCanaryReceipt | undefined;
	let requests = 0;
	await expect(
		runJudgeCanaries({
			phase: "smoke",
			studyHash: "credit-test",
			options: {
				...options,
				models,
				fakeTransport: async (_u, _i, next) =>
					++requests === 8
						? Response.json({ error: { code: 402, message: "Insufficient credits" } }, { status: 402 })
						: next(),
			},
			onProgress: async (value) => {
				receipt = value;
			},
		}),
	).rejects.toThrow("ACCOUNT_ERROR");
	const previous = required(receipt);
	const completed = new Set(
		previous.results.filter((r) => r.outcome === "valid" && !r.voteFault).map((r) => `canary:${r.key}`),
	);
	const recovered = required(
		await runJudgeCanaries({
			phase: "smoke",
			studyHash: "credit-test",
			previous,
			options: {
				...options,
				models,
				recoverSystemic: true,
				fakeTransport: async (_u, _i, next, ctx) => {
					expect(completed.has(ctx.key)).toBe(false);
					return next();
				},
			},
		}),
	);
	expect(() => assertJudgeCanaries(recovered, { models, mode: "fake", studyHash: "credit-test" })).not.toThrow();
	expect(recovered.results).toHaveLength(72);
	const again = await runJudgeCanaries({
		phase: "smoke",
		studyHash: "credit-test",
		previous: recovered,
		options: {
			...options,
			models,
			recoverSystemic: true,
			fakeTransport: () => {
				throw new Error("MUST_NOT_REBUY");
			},
		},
	});
	expect(again?.openRouterMicros).toBe(recovered.openRouterMicros);
});

it.each([402, 429])(
	"stops concurrent sessions on credit exhaustion (%i), then resumes without buying completed calls",
	async (status) => {
		const raw: RawRecord[] = [];
		let bought = 0;
		const interrupted = await runBenchmark({
			...options,
			onRaw: async (row) => {
				raw.push(row);
			},
			fakeTransport: async (_u, _i, next, ctx) => {
				if (ctx.role === "writer" && ++bought === 2)
					return Response.json(
						{
							error: {
								code: status === 429 ? "insufficient_quota" : 402,
								type: status === 429 ? "insufficient_quota" : "insufficient_credits",
								message: "Insufficient credits",
							},
						},
						{ status },
					);
				return next();
			},
		});
		expect(interrupted.stopReason).toBe("ACCOUNT_ERROR");
		const finished = interrupted.calls.filter((c) => c.outcome === "valid" && c.verifierAccepted);
		expect(scoreBenchmark(interrupted.calls).every((g) => g.schemaFailures === 0)).toBe(true);
		const completedKeys = new Set(finished.map((c) => c.key));
		const paidWriterKeys = new Set(raw.filter((r) => r.status === 200 && !r.key.includes(":verify")).map((r) => r.key));
		const sends: string[] = [];
		const resumed = await runBenchmark({
			...options,
			previousCalls: interrupted.calls,
			rawRecords: raw,
			recoverSystemic: true,
			fakeTransport: async (_u, _i, next, ctx) => {
				sends.push(ctx.key);
				expect(completedKeys.has(ctx.key)).toBe(false);
				if (ctx.role === "writer") expect(paidWriterKeys.has(ctx.key)).toBe(false);
				return next();
			},
		});
		expect(resumed.stopReason).toBeNull();
		expect(resumed.calls).toHaveLength(cases.length);
		expect(
			resumed.calls.map((c) => ({
				caseId: c.caseId,
				outcome: c.outcome,
				fault: c.verifierFault,
				accepted: c.verifierAccepted,
			})),
		).toEqual(
			expect.arrayContaining(
				cases.map((c) => expect.objectContaining({ caseId: c.id, outcome: "valid", fault: null, accepted: true })),
			),
		);
		expect(sends.length).toBeGreaterThan(0);
		const again = await runBenchmark({
			...options,
			previousCalls: resumed.calls,
			rawRecords: raw,
			recoverSystemic: true,
			fakeTransport: () => {
				throw new Error("MUST_NOT_REBUY");
			},
		});
		expect(again.calls).toEqual(resumed.calls);
		expect(again.reservedUsd).toBe(resumed.reservedUsd);
		expect(again.reservedOpenaiUsd).toBe(resumed.reservedOpenaiUsd);
	},
);
