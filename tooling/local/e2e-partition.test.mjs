import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { discoverTests, partitionTests, testList } from "./e2e-partition.mjs";

it("assigns every discovered test exactly once, including through Playwright's test-list filter", () => {
	const discovered = discoverTests();
	const bins = partitionTests(discovered, 6);
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
