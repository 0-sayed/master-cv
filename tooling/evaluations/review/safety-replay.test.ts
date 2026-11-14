import type { BenchmarkCall } from "./runner";
import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries } from "./canaries";
import { tasksVerifier } from "./contracts/verifier/verifier";
import { required } from "./required";
import { rescoreTaskSessions } from "./safety-replay";

const c = required(loadJudgeCanaries().find((c) => c.category === "summary" && c.language === "en"));
const call = (key: string, output: unknown, verdict: unknown) =>
	({
		key,
		caseId: c.id,
		output: JSON.stringify(output),
		verifierVerdict: verdict,
		model: "writer",
		provider: "openai",
		reasoning: "low",
		verifierFaultRetries: 1,
	}) as BenchmarkCall;
const safe = tasksVerifier.fakeVerdict(c, c.gold as Record<string, unknown>);

it("separates guard rejects, semantic rejects and final verifier faults using latest sessions", () => {
	const unsafe = required(c.mutants.find((m) => m.id === "invented-metric")).output as Record<string, unknown>;
	const accepted = tasksVerifier.fakeVerdict({ ...c, gold: unsafe }, unsafe);
	const faulty = structuredClone(safe) as typeof safe & { absence: { id: string; verdict: string }[] };
	faulty.absence = [{ id: "unrequested", verdict: "unclear" }];
	const calls = [
		call("a", unsafe, accepted),
		call("a", c.gold, safe),
		call("b", unsafe, accepted),
		call("c", c.gold, faulty),
	];
	const result = rescoreTaskSessions(calls, [c]);
	expect(result.sessions).toHaveLength(3);
	expect(result.table[0]).toMatchObject({
		observed: 3,
		safetyAccepted: 1,
		guardRejects: 1,
		verifierFaults: 1,
		semanticRejects: 0,
	});
	expect(result.sessions.find((s) => s.key === "c")).toMatchObject({
		safetyAccepted: false,
		semanticRejected: false,
		verifierFault: "VERIFIER_UNKNOWN_ABSENCE",
	});
});

it("keeps semantic failures visible when a separate protocol field is invalid", () => {
	const bad = structuredClone(safe) as Record<string, unknown>;
	bad.coverage = { status: "uncovered", reason: "An unsafe assertion." };
	bad.absence = [{ id: "unrequested", verdict: "unclear" }];
	const result = rescoreTaskSessions([call("a", c.gold, bad)], [c]);
	expect(result.table[0]).toMatchObject({
		observed: 1,
		safetyAccepted: 0,
		guardRejects: 0,
		verifierFaults: 1,
		semanticRejects: 1,
	});
});

it("writes offline CLI diagnostics only under explicit output and reports measured fault counts", async () => {
	const { mkdtemp, writeFile, readFile, rm, mkdir } = await import("node:fs/promises");
	const { join } = await import("node:path");
	const { captureCommand } = await import("./subprocess");
	const { loadStudyCases } = await import("./study");
	const out = await mkdtemp("/tmp/t006-safety-replay-test-");
	const source = join(out, "snapshot");
	await mkdir(source);
	try {
		const fixture = required(loadStudyCases("tasks-v1").find((c) => c.kind === "task" && c.category === "summary"));
		if (fixture.kind !== "task") throw new Error("TASK_REQUIRED");
		const smokeCall = {
			...call("smoke", fixture.gold, tasksVerifier.fakeVerdict(fixture, fixture.gold as Record<string, unknown>)),
			caseId: fixture.id,
		};
		const verdict = structuredClone(safe);
		verdict.absence = [{ id: "unrequested", verdict: "unclear" }];
		const canary = {
			results: [
				{
					key: "saved",
					caseId: c.id,
					category: c.category,
					language: c.language,
					defect: "gold",
					provider: "Together",
					outcome: "valid",
					verdict,
				},
			],
		};
		for (const [name, value] of Object.entries({
			"canaries.json": canary,
			"fixtures.json": [c],
			"diagnosis.json": { rows: [{ key: "saved", output: c.gold }] },
			"results.json": { calls: [smokeCall], stopReason: null },
			"manifest.json": { models: [{ model: "writer", reasoning: "low", provider: "openai" }] },
		}))
			await writeFile(join(source, name), JSON.stringify(value));
		await writeFile(join(source, "calls.jsonl"), JSON.stringify({ type: "scored", data: smokeCall }) + "\n");
		const result = captureCommand(
			process.execPath,
			[
				"--import",
				"tsx",
				"evaluations/review/safety-replay-cli.ts",
				"--source",
				source,
				"--historical-fixtures",
				join(source, "fixtures.json"),
				"--diagnosis",
				join(source, "diagnosis.json"),
				"-o",
				join(out, "reports"),
			],
			{ out },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("");
		const diagnostic = JSON.parse(await readFile(join(out, "reports", "canary-replay.json"), "utf8"));
		expect(diagnostic).toMatchObject({ total: 1, protocolFaults: 1, qualifiesCurrentStudy: false });
		expect(diagnostic.promptEffect).toContain("1 saved audit faults");
		const smoke = JSON.parse(await readFile(join(out, "reports", "smoke-rescore.json"), "utf8"));
		expect(smoke.table).toHaveLength(6);
		expect(smoke.table.reduce((n: number, r: { observed: number }) => n + r.observed, 0)).toBe(1);
		expect(smoke.table.reduce((n: number, r: { safetyAccepted: number }) => n + r.safetyAccepted, 0)).toBe(1);
		expect(JSON.parse(await readFile(join(source, "canaries.json"), "utf8"))).toEqual(canary);
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});
