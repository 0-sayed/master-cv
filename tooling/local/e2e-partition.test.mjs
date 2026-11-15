import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { discoverTests, partitionTests, runtimeCommands, testList } from "./e2e-partition.mjs";

it("assigns every discovered test exactly once, including through Playwright's test-list filter", () => {
	const discovered = discoverTests();
	const bins = partitionTests(discovered, 10);
	expect(discovered.length).toBeGreaterThan(0);
	const directory = mkdtempSync(join(tmpdir(), "e2e-partition-"));
	try {
		const selected = bins.flatMap((bin, index) => {
			const path = join(directory, `${index}.txt`);
			writeFileSync(path, testList(bin));
			const actual = discoverTests(["--test-list", path]);
			expect(actual.map((test) => test.id).sort()).toEqual(bin.tests.map((test) => test.id).sort());
			return actual.map((test) => test.id);
		});
		expect(new Set(selected).size).toBe(discovered.length);
		expect(selected.sort()).toEqual(discovered.map((test) => test.id).sort());
		const accountBins = bins.filter((bin) => bin.tests.some((test) => test.file === "account-consistency.spec.ts"));
		expect(accountBins).toHaveLength(4);
		for (const bin of accountBins) {
			const accountTests = bin.tests.filter((test) => test.file === "account-consistency.spec.ts");
			expect(new Set(accountTests.map((test) => test.titlePath[0])).size).toBe(1);
			expect(accountTests).toHaveLength(5);
		}
		const estimates = bins.map((bin) => bin.seconds);
		expect(Math.max(...estimates) - Math.min(...estimates)).toBeLessThan(15);
		const motionBins = bins.filter((bin) => bin.tests.some((test) => test.file === "cross-shell-motion.spec.ts"));
		expect(motionBins).toHaveLength(2);
		expect(
			motionBins.map((bin) => bin.tests.filter((test) => test.file === "cross-shell-motion.spec.ts").length),
		).toEqual([1, 1]);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}, 30_000);

it("includes unknown specs using the default weight and keeps four partitions available", () => {
	const tests = Array.from({ length: 9 }, (_, index) => ({
		id: String(index),
		file: `new-${index}.spec.ts`,
		titlePath: ["new"],
		project: "chromium",
	}));
	const bins = partitionTests(tests, 4, { defaultTestSeconds: 7, specs: {} });
	expect(bins).toHaveLength(4);
	expect(bins.flatMap((bin) => bin.tests)).toHaveLength(9);
	expect(bins.reduce((sum, bin) => sum + bin.seconds, 0)).toBe(63);
	expect(partitionTests(tests, 4, { defaultTestSeconds: 7, specs: {} })).toEqual(bins);
});

it("rejects invalid bin counts and duplicate discovery identities", () => {
	expect(() => partitionTests([], 0)).toThrow();
	const test = { id: "duplicate", file: "new.spec.ts", titlePath: ["new"], project: "chromium" };
	expect(() => partitionTests([test, test], 6)).toThrow(/duplicate/i);
});

it("reserves runtime suite time on its owning shard", () => {
	const tests = Array.from({ length: 10 }, (_, index) => ({
		id: String(index),
		file: `new-${index}.spec.ts`,
		titlePath: ["new"],
		project: "chromium",
	}));
	const bins = partitionTests(tests, 2, {
		defaultTestSeconds: 10,
		specs: {},
		runtimeSuites: [{ shard: 2, seconds: 80 }],
	});
	expect(bins.map((bin) => bin.seconds)).toEqual([90, 90]);
	expect(bins.map((bin) => bin.tests.length)).toEqual([9, 1]);
});

it("includes both synthetic runtime configs only on their owning shard with separate artifacts", () => {
	expect(runtimeCommands(3, ["--workers=1"])).toEqual([]);
	expect(runtimeCommands(6, ["--workers=1", "--output", "/tmp/browser"])).toEqual([
		[
			"exec",
			"playwright",
			"test",
			"--config",
			"tests/e2e/t005-runtime.config.ts",
			"--workers=1",
			"--output",
			"/tmp/browser/runtime-browser",
		],
		[
			"exec",
			"playwright",
			"test",
			"--config",
			"tests/e2e/reviewable-ai-runtime.config.ts",
			"--workers=1",
			"--output",
			"/tmp/browser/review-browser",
		],
	]);
});
