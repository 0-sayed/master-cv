import { spawnSync } from "node:child_process";
import { appendFileSync, globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertNoAiCredentials } from "./test-ai-guard.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const toolingShards = 4;

function discoverWorkspaces() {
	const { workspaces } = JSON.parse(readFileSync(resolve(repository, "package.json"), "utf8"));
	return workspaces
		.flatMap((pattern) => globSync(`${pattern}/package.json`, { cwd: repository }))
		.map((file) => JSON.parse(readFileSync(resolve(repository, file), "utf8")))
		.filter((workspace) => workspace.scripts?.["test:ci"])
		.map((workspace) => workspace.name);
}

export function unitGroups(workspaces) {
	const groups = { tooling: [], web: [], api: [], remaining: [] };
	for (const name of workspaces) {
		const group =
			name === "@reactive-resume/tooling"
				? "tooling"
				: name === "web"
					? "web"
					: name === "@reactive-resume/api"
						? "api"
						: "remaining";
		groups[group].push(name);
	}
	return groups;
}

export function unitTestArguments(group, shard, workspaces = discoverWorkspaces()) {
	const groups = unitGroups(workspaces);
	if (!Object.hasOwn(groups, group)) throw new Error(`Unknown unit group: ${group}`);
	if (!groups[group].length) throw new Error(`No test:ci workspaces in group: ${group}`);
	if (group === "tooling" && !/^[1-4]\/4$/.test(shard ?? ""))
		throw new Error("Expected a tooling shard from 1/4 to 4/4");
	if (group !== "tooling" && shard !== undefined) throw new Error("Only tooling is sharded");
	return [
		"exec",
		"turbo",
		"run",
		"test:ci",
		"--concurrency=1",
		...groups[group].map((name) => `--filter=${name}`),
		...(group === "tooling" ? ["--", `--shard=${shard}`] : []),
	];
}

/** Equal sets alone miss duplicate execution; require each discovered identity exactly once. */
export function assertCompletePartition(all, shards) {
	const actual = shards.flat();
	if (
		!all.length ||
		shards.some((shard) => !shard.length) ||
		new Set(all).size !== all.length ||
		new Set(actual).size !== actual.length ||
		actual.length !== all.length ||
		actual.some((file) => !all.includes(file))
	)
		throw new Error("Unit partitions must contain every discovered test exactly once");
}

async function checkCoverage() {
	const workspaces = discoverWorkspaces();
	const groups = unitGroups(workspaces);
	assertCompletePartition(workspaces, Object.values(groups));
	// `list --filesOnly` ignores --shard in Vitest 5. Use its actual sequencer without running tests.
	const { createVitest } = await import("vite-plus/test/node");
	const context = await createVitest({ root: resolve(repository, "tooling"), run: true, watch: false });
	try {
		const files = await context.globTestSpecifications();
		const identity = (file) => `${file.project.name}:${file.moduleId}`;
		const sequencer = new context.config.sequence.sequencer(context);
		const shards = [];
		for (let index = 1; index <= toolingShards; index++) {
			context.config.shard = { index, count: toolingShards };
			shards.push((await sequencer.shard(files)).map(identity));
		}
		assertCompletePartition(files.map(identity), shards);
		const summary = [
			`Unit coverage: ${workspaces.length} test:ci workspaces, each assigned once.`,
			...Object.entries(groups).map(([group, names]) => `${group}: ${names.join(", ")}`),
			`Tooling: ${files.length} files = ${shards.map((shard) => shard.length).join(" + ")} across four Vitest shards, no omissions or duplicates.`,
		].join("\n");
		console.info(summary);
		if (process.env.GITHUB_STEP_SUMMARY)
			appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Unit partition coverage\n\n${summary}\n`);
	} finally {
		await context.close();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	assertNoAiCredentials();
	if (process.argv[2] === "--check") await checkCoverage();
	else {
		const args = unitTestArguments(process.argv[2], process.argv[3]);
		const result = spawnSync("pnpm", args, { cwd: repository, stdio: "inherit" });
		if (result.error) throw result.error;
		process.exitCode = result.status ?? 1;
	}
}
