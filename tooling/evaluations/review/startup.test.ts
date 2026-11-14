import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { fixtureHash, loadStudyCases, studyReviewItems } from "./study";
import { captureCommand } from "./subprocess";

// These approvals exist only inside the synthetic subprocess fixture; never owner consent.
async function fixture() {
	const out = await mkdtemp("/tmp/review-startup-");
	const approval = join(out, "synthetic-review.json");
	const keyFile = join(out, "dummy.env");
	const guard = join(out, "guard.mjs");
	await writeFile(keyFile, "OPENROUTER_BENCHMARK_KEY=fake-startup-secret-only\n");
	await writeFile(
		approval,
		JSON.stringify({
			version: 1,
			reviewer: "synthetic-test-only",
			reviewedAt: "2026-11-13T12:00:00.000Z",
			fixtures: studyReviewItems("tasks-v1", loadStudyCases("tasks-v1"))
				.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)))
				.map((c) => ({ id: c.id, hash: fixtureHash(c), sourceReviewed: true, goldReviewed: true })),
		}),
	);
	await writeFile(
		guard,
		`process.loadEnvFile = () => {}; globalThis.fetch = () => { throw new Error("offline transport failure Bearer fake-startup-secret-only\\nsecond line", {cause: new Error("getaddrinfo ENOTFOUND openrouter.ai")}); };`,
	);
	const run = (flags: string[]) =>
		captureCommand(
			process.execPath,
			[
				"--import",
				"tsx",
				"--import",
				guard,
				"evaluations/review/cli.ts",
				"--study",
				"tasks-v1",
				"--stage",
				"smoke",
				"--runs",
				"3",
				"--approval-file",
				approval,
				"--env-file",
				keyFile,
				"--budget-usd",
				"13",
				"--openai-budget-usd",
				"40",
				"-o",
				out,
				...flags,
			],
			{ out },
		);
	return { out, keyFile, run };
}
it("live startup preserves a sanitized transport cause instead of discarding an uncoded error", async () => {
	const f = await fixture();
	try {
		const result = f.run([]);
		expect(result.status).toBe(1);
		const raw = await readFile(join(f.out, "error.json"), "utf8");
		const error = JSON.parse(raw);
		expect(error.code).toBe("BENCHMARK_CONFIGURATION_OR_IO_ERROR");
		expect(error.message).toContain("offline transport failure");
		expect(error.message).toContain("getaddrinfo ENOTFOUND openrouter.ai");
		expect(error.stackTop).toMatch(/startup|runner/);
		expect(error.message).not.toMatch(/[\r\n]/u);
		expect(raw + result.stderr).not.toContain("fake-startup-secret-only");
		expect(result.stderr.trim().split("\n")).toHaveLength(1);
		expect(result.stdout).toBe("");
	} finally {
		await rm(f.out, { recursive: true, force: true });
	}
});
it("startup-check follows live gates and parses the explicit key without network or inference", async () => {
	const f = await fixture();
	try {
		const result = f.run(["--startup-check"]);
		expect(result.status, result.stderr).toBe(0);
		const raw = await readFile(join(f.out, "startup-check.json"), "utf8");
		expect(JSON.parse(raw)).toMatchObject({
			mode: "startup-check",
			paidCalls: 0,
			networkRequests: 0,
			credential: "[REDACTED]",
			study: "tasks-v1",
			phase: "smoke",
			controls: { checked: 1056, pass: true },
			judgeCanaries: { calls: 72 },
			calls: 126,
		});
		expect(raw).not.toContain("fake-startup-secret-only");
		expect(result.stdout).toBe("");
		await writeFile(f.keyFile, "OPENROUTER_API_KEY=fake-app-only\n");
		const bad = f.run(["--startup-check"]);
		expect(bad.status).toBe(1);
		expect(JSON.parse(await readFile(join(f.out, "error.json"), "utf8")).code).toBe("BENCHMARK_KEY_REQUIRED");
	} finally {
		await rm(f.out, { recursive: true, force: true });
	}
});
it("reports parse failures to stderr and the explicit output directory", async () => {
	const f = await fixture();
	try {
		const result = f.run(["--unknown-option"]);
		expect(result.status).toBe(1);
		expect(JSON.parse(await readFile(join(f.out, "error.json"), "utf8")).message).toContain("unknown-option");
		expect(result.stderr.trim().split("\n")).toHaveLength(1);
	} finally {
		await rm(f.out, { recursive: true, force: true });
	}
});
