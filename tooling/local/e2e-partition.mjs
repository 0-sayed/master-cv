import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const weights = JSON.parse(readFileSync(new URL("./e2e-weights.json", import.meta.url), "utf8"));

function playwright(args) {
	const result = spawnSync("pnpm", ["exec", "playwright", "test", ...args], {
		cwd: repository,
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`Playwright exited ${result.status}: ${result.stderr}\n${result.stdout}`);
	return result.stdout;
}

export function discoverTests(args = []) {
	const report = JSON.parse(playwright(["--list", "--reporter=json", ...args]));
	if (report.errors?.length) throw new Error(JSON.stringify(report.errors));
	const tests = [];
	function visit(suite, parents = []) {
		// File suites supply the file separately; nested suites are describe titles.
		const titlePath = suite.column ? [...parents, suite.title] : parents;
		for (const spec of suite.specs ?? [])
			for (const test of spec.tests)
				tests.push({
					id: `${spec.id}:${test.projectName}`,
					file: spec.file,
					titlePath: [...titlePath, spec.title],
					project: test.projectName,
				});
		for (const child of suite.suites ?? []) visit(child, titlePath);
	}
	for (const suite of report.suites) visit(suite);
	if (!tests.length) throw new Error("Playwright discovered no tests");
	return tests;
}

export function partitionTests(tests, count, timing = weights) {
	if (!Number.isInteger(count) || count < 1) throw new Error("Partition count must be a positive integer");
	if (new Set(tests.map((test) => test.id)).size !== tests.length) throw new Error("Duplicate test discovery identity");
	const groups = new Map();
	for (const test of tests) {
		// Keep file-level setup together, except the two expensive shell journeys.
		const key = test.file === "cross-shell-motion.spec.ts" ? `${test.file}:${test.id}` : `${test.project}:${test.file}`;
		const group = groups.get(key) ?? { key, tests: [], seconds: 0 };
		const measured = timing.specs[test.file];
		group.seconds += measured ? measured.seconds / measured.tests : timing.defaultTestSeconds;
		group.tests.push(test);
		groups.set(key, group);
	}
	const bins = Array.from({ length: count }, () => ({ tests: [], seconds: 0 }));
	for (const group of [...groups.values()].sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key, "en"))) {
		// Explicit separation survives future changes to other spec durations.
		const candidates =
			group.tests[0].file === "cross-shell-motion.spec.ts" && count > 1
				? bins.filter((bin) => !bin.tests.some((test) => test.file === "cross-shell-motion.spec.ts"))
				: bins;
		const bin = candidates.reduce((best, candidate) => (candidate.seconds < best.seconds ? candidate : best));
		bin.tests.push(...group.tests);
		bin.seconds += group.seconds;
	}
	return bins;
}

export function testList(bin) {
	return bin.tests.map((test) => `[${test.project}] › ${test.file} › ${test.titlePath.join(" › ")}`).join("\n") + "\n";
}

function main() {
	const [selection = "all", total = "6", ...args] = process.argv.slice(2);
	const count = Number(total);
	const selected = Number(selection);
	if (selection !== "all" && (!Number.isInteger(selected) || selected < 1 || selected > count))
		throw new Error("Usage: e2e-partition.mjs <all|partition> <count> [Playwright options]");
	const bins = partitionTests(discoverTests(), count);
	for (const [index, bin] of bins.entries())
		console.info(
			`Bin ${index + 1}/${count}: ${Math.round(bin.seconds)}s estimated; ${bin.tests.length} tests; ${[...new Set(bin.tests.map((test) => test.file + (test.file === "cross-shell-motion.spec.ts" ? ` (${test.titlePath[0].split(" ")[0]})` : "")))].join(", ")}`,
		);
	if (selection === "all") return;
	const bin = bins[selected - 1];
	if (!bin.tests.length) throw new Error("Selected partition is empty");
	const directory = mkdtempSync(join(tmpdir(), "e2e-partition-"));
	try {
		const path = join(directory, "tests.txt");
		writeFileSync(path, testList(bin));
		const result = spawnSync("pnpm", ["exec", "playwright", "test", "--test-list", path, ...args], {
			cwd: repository,
			stdio: "inherit",
		});
		if (result.error) throw result.error;
		process.exitCode = result.status ?? 1;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
