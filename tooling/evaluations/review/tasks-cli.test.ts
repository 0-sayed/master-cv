import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { required } from "./required";
import * as study from "./study";
import { captureCommand } from "./subprocess";

const cli = (args: string[]) =>
	captureCommand(process.execPath, ["--import", "tsx", "evaluations/review/cli.ts", ...args], {
		out: required(args[args.indexOf("-o") + 1]),
		timeout: 60_000,
	});
it("offline CLI acceptance for tasks-v1 smoke with repeated approval provenance persisted", async () => {
	expect(study.loadStudyCases).toBeTypeOf("function");
	const out = await mkdtemp("/tmp/t006-tasks-cli-");
	try {
		const items = study.studyReviewItems("tasks-v1", study.loadStudyCases("tasks-v1"));
		const entries = items
			.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)))
			.map((c) => ({ id: c.id, hash: study.fixtureHash(c), sourceReviewed: true, goldReviewed: true }));
		const files = [join(out, "a.json"), join(out, "b.json")];
		for (const [i, path] of files.entries())
			await writeFile(
				path,
				JSON.stringify({
					version: 1,
					reviewer: `synthetic-reviewer-${i}`,
					reviewedAt: "2026-11-13T12:00:00.000Z",
					fixtures: i ? entries.slice(20) : entries.slice(0, 20),
				}),
			);
		const result = cli([
			"--study",
			"tasks-v1",
			"--fake",
			"--stage",
			"smoke",
			"--budget-usd",
			"100",
			"--openai-budget-usd",
			"100",
			"--approval-file",
			required(files[0]),
			"--approval-file",
			required(files[1]),
			"-o",
			out,
		]);
		expect(result.status, JSON.stringify({ stderr: result.stderr, stdout: result.stdout, error: result.error })).toBe(
			0,
		);
		expect(result.stdout).toBe("");
		const folder = required((await readdir(out, { withFileTypes: true })).find((f) => f.isDirectory()));
		const manifest = JSON.parse(await readFile(join(out, folder.name, "manifest.json"), "utf8"));
		const artifact = JSON.parse(await readFile(join(out, folder.name, "results.json"), "utf8"));
		expect(manifest.study).toBe("tasks-v1");
		expect(manifest.variants).toEqual(
			manifest.models.map((m: { model: string; reasoning: string }) => `${m.model}@${m.reasoning}`),
		);
		expect(manifest.approvalProvenance.map((p: { reviewer: string }) => p.reviewer)).toEqual([
			"synthetic-reviewer-0",
			"synthetic-reviewer-1",
		]);
		expect(artifact.study).toMatchObject({ name: "tasks-v1", approvalProvenance: manifest.approvalProvenance });
		expect(artifact.calls).toHaveLength(126);
		expect(artifact.study.judgeCanaries).toMatchObject({ mode: "fake", recall: 1, honestFalseRejects: 0 });
		expect(artifact.study.judgeCanaries.results).toHaveLength(72);
		expect(artifact.priorSpendUsd).toBe(artifact.study.judgeCanaries.openRouterMicros / 1e6);
		expect(artifact.priorOpenaiSpendUsd).toBe(artifact.study.judgeCanaries.openaiMicros / 1e6);
		expect(JSON.parse(await readFile(join(out, folder.name, "canaries.json"), "utf8"))).toEqual(
			artifact.study.judgeCanaries,
		);
		expect(artifact.stopReason).toBeNull();
		expect(new Set(artifact.calls.map((c: { category: string }) => c.category)).size).toBe(6);
		// Keep the historical core freeze unchanged. Exercise the cross-study gate
		// through the current tasks CLI rather than trying to launch that stale freeze.
		const mismatchedStudy = structuredClone(artifact);
		mismatchedStudy.study.name = "core";
		const mismatchedPath = join(out, "mismatched-study.json");
		await writeFile(mismatchedPath, JSON.stringify(mismatchedStudy));
		const cross = cli([
			"--study",
			"tasks-v1",
			"--fake",
			"--dry-run",
			"--smoke-file",
			mismatchedPath,
			"-o",
			join(out, "cross"),
		]);
		expect(cross.status).toBe(1);
		expect(JSON.parse(await readFile(join(out, "cross", "error.json"), "utf8")).code).toBe("LIVE_SMOKE_MISMATCH");
		const pruned = cli([
			"--study",
			"tasks-v1",
			"--fake",
			"--dry-run",
			"--variants",
			manifest.variants.slice(0, 4).join(","),
			"--smoke-file",
			join(out, folder.name, "results.json"),
			"-o",
			join(out, "pruned"),
		]);
		expect(pruned.status).toBe(1);
		expect(JSON.parse(await readFile(join(out, "pruned", "error.json"), "utf8")).code).toBe("LIVE_SMOKE_MISMATCH");
		const exportDir = join(out, "review");
		const review = captureCommand(
			process.execPath,
			["--import", "tsx", "evaluations/review/owner-review-cli.ts", "--study", "tasks-v1", "-o", exportDir],
			{ out },
		);
		expect(review.status, review.stderr).toBe(0);
		expect(JSON.parse(await readFile(join(exportDir, "owner-review-items.json"), "utf8"))).toEqual(items);
	} finally {
		await rm(out, { recursive: true, force: true });
	}
}, 90_000);

it("tasks-v1 CLI dry-run writes its study forecast only through -o", async () => {
	const out = await mkdtemp("/tmp/t006-tasks-dry-");
	try {
		const result = cli(["--study", "tasks-v1", "--fake", "--dry-run", "--stage", "smoke", "-o", out]);
		expect(result.status, JSON.stringify({ stderr: result.stderr, stdout: result.stdout, error: result.error })).toBe(
			0,
		);
		expect(result.stdout).toBe("");
		const forecast = JSON.parse(await readFile(join(out, "forecast.json"), "utf8"));
		expect(forecast).toMatchObject({ study: "tasks-v1", phase: "smoke", calls: 126 });
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});

it("tasks-v1 full rejects absent canary calibration before any credential or network access", async () => {
	const out = await mkdtemp("/tmp/t006-canary-gate-");
	try {
		const result = cli(["--study", "tasks-v1", "--fake", "--stage", "full", "-o", out]);
		expect(result.status).toBe(1);
		expect(JSON.parse(await readFile(join(out, "error.json"), "utf8")).code).toBe("JUDGE_CANARY_GATE");
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});

it("offline preflight blocks environment reads and external requests without requiring fake", async () => {
	const out = await mkdtemp("/tmp/t006-tasks-preflight-");
	try {
		const guard = join(out, "guard.mjs");
		await writeFile(
			guard,
			'process.loadEnvFile = () => { throw new Error("ENV_READ_FORBIDDEN"); }; globalThis.fetch = () => { throw new Error("NETWORK_FORBIDDEN"); };',
		);
		const result = captureCommand(
			process.execPath,
			[
				"--import",
				"tsx",
				"--import",
				guard,
				"evaluations/review/cli.ts",
				"--study",
				"tasks-v1",
				"--preflight",
				"-o",
				out,
			],
			{ out },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(await readFile(join(out, "preflight.json"), "utf8")).requests.length).toBeGreaterThan(0);
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});

it("keeps existing tuning-only configs usable without the pruning flag", async () => {
	const out = await mkdtemp("/tmp/t006-tuning-config-");
	try {
		const models = JSON.parse(await readFile(new URL("./models-tasks.json", import.meta.url), "utf8"));
		const config = join(out, "tuning.json");
		await writeFile(config, JSON.stringify(models.map((m: Record<string, unknown>) => ({ ...m, sets: ["tuning"] }))));
		const result = cli(["--study", "tasks-v1", "--fake", "--dry-run", "--config", config, "-o", out]);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(await readFile(join(out, "forecast.json"), "utf8")).calls).toBe(756);
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});
