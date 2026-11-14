import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { getTaskContract } from "./contracts";
import { createFaultTransport, faultNames } from "./faults";
import { required } from "./required";
import { runBenchmark } from "./runner";
import { loadStudyCases, smokeCases } from "./study";

const fixtures = loadStudyCases("tasks-v1").filter((c) => !c.holdout);
const models = loadModels(new URL("./models-tasks.json", import.meta.url).pathname);
afterEach(() => vi.useRealTimers());
for (const category of [
	"summary",
	"job-evidence",
	"tailoring",
	"translation",
	"cover-letter",
	"interview-prep",
] as const)
	for (const provider of ["openai", "together"] as const)
		for (const role of ["writer", "verifier"] as const)
			it.each(faultNames)(`${category}/${provider}/${role}/%s fails closed`, async (fault) => {
				vi.useFakeTimers();
				const c = required(fixtures.find((c) => c.category === category));
				const model = required(models.find((m) => m.provider === provider));
				const fake = createFaultTransport({ fault, role, session: 1 });
				const pending = runBenchmark({
					models: [model],
					cases: [c],
					runs: 1,
					fake: true,
					budgetUsd: 100,
					openaiBudgetUsd: 100,
					fakeTransport: fake.transport,
				});
				await vi.runAllTimersAsync();
				const result = await pending;
				expect(fake.injections.length).toBeGreaterThan(0);
				if (fault === "truncated-long-output" && role === "writer") expect(result.calls[0]?.writerTruncated).toBe(true);
				if (fault === "deadline-timeout")
					expect(fake.injections[0]?.deadlineMs).toBe(getTaskContract(category).deadlineMs);
				if (["schema-invalid", "finish-length", "truncated-long-output", "refusal", "content-filter"].includes(fault))
					if (role === "writer") expect(result.calls.every((c) => !c.safetyAccepted)).toBe(true);
					else expect(result.calls[0]?.verifierFaultRetries).toBe(1);
			});
it("chaos tasks-v1 seed 19 completes all 126 sessions with stable resume spending", async () => {
	vi.useFakeTimers();
	const fake = createFaultTransport({ fault: "none", role: "writer", session: 3, chaos: true, seed: 19 });
	const options = {
		models,
		cases: smokeCases(fixtures, models),
		phase: "smoke" as const,
		runs: 1,
		fake: true,
		budgetUsd: 13,
		openaiBudgetUsd: 40,
		fakeTransport: fake.transport,
	};
	const pending = runBenchmark(options);
	await vi.runAllTimersAsync();
	const result = await pending;
	expect(fake.injections.length).toBeGreaterThan(0);
	expect(result.stopReason).toBeNull();
	expect(result.incomplete).toEqual([]);
	expect(result.calls).toHaveLength(126);
	const sends = fake.receipts.length;
	const resumed = await runBenchmark({ ...options, previousCalls: result.calls });
	expect(fake.receipts).toHaveLength(sends);
	expect(resumed.reservedUsd).toBe(result.reservedUsd);
	expect(resumed.reservedOpenaiUsd).toBe(result.reservedOpenaiUsd);
});
