import { expect, it } from "vite-plus/test";
import { cases, goldOutput } from "./corpus";
import { replayCalls } from "./fairness-replay";
import { required } from "./required";
import { runBenchmark } from "./runner";

it("replays literal outputs without accepting a verdict produced from the old verifier input", async () => {
	const { loadModels } = await import("./config");
	const c = required(cases.find((c) => c.requiresQuestion));
	const fake = await runBenchmark({
		models: [required(loadModels()[0])],
		cases: [c],
		runs: 1,
		fake: true,
		budgetUsd: 5,
	});
	const before = required(fake.calls[0]);
	const text = JSON.stringify(goldOutput(c));
	const replay = replayCalls([{ ...before, output: text }]);
	expect(replay[0]).toMatchObject({
		key: before.key,
		verifierStatus: "needs-reverification",
		schemaValid: true,
		emptyAnswer: false,
	});
	expect(replay[0]?.output).toBe(text);
	expect(replay[0]).not.toHaveProperty("verifierAccepted");
	expect(() => replayCalls([{ ...before, fixtureHash: "changed" }])).toThrow("REPLAY_FIXTURE_MISMATCH");
});
