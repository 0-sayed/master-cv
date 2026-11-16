import { expect, it } from "vite-plus/test";
import { assertCompletePartition, unitGroups, unitTestArguments } from "./ci-unit.mjs";

const workspaces = [
	"web",
	"@reactive-resume/api",
	"@reactive-resume/tooling",
	"@reactive-resume/pdf",
	"server",
	"new-workspace",
];

it("keeps every other workspace, including future packages, in the serial remainder", () => {
	const groups = unitGroups(workspaces);
	expect(groups).toEqual({
		tooling: ["@reactive-resume/tooling"],
		web: ["web"],
		api: ["@reactive-resume/api"],
		remaining: ["@reactive-resume/pdf", "server", "new-workspace"],
	});
});

it("forwards native tooling shards while preserving serial execution inside each runner", () => {
	expect(unitTestArguments("tooling", "2/4", workspaces)).toEqual([
		"exec",
		"turbo",
		"run",
		"test:ci",
		"--concurrency=1",
		"--filter=@reactive-resume/tooling",
		"--",
		"--shard=2/4",
	]);
	expect(unitTestArguments("remaining", undefined, workspaces)).toEqual([
		"exec",
		"turbo",
		"run",
		"test:ci",
		"--concurrency=1",
		"--filter=@reactive-resume/pdf",
		"--filter=server",
		"--filter=new-workspace",
	]);
});

it.each(["0/4", "5/4", "1/3", undefined])("rejects an incomplete or invalid tooling shard %s", (shard) => {
	expect(() => unitTestArguments("tooling", shard, workspaces)).toThrow("Expected a tooling shard from 1/4 to 4/4");
});

it("rejects unknown groups and sharding outside tooling", () => {
	expect(() => unitTestArguments("missing", undefined, workspaces)).toThrow("Unknown unit group");
	expect(() => unitTestArguments("web", "1/4", workspaces)).toThrow("Only tooling is sharded");
});

it("accepts exactly one copy of every discovered file", () => {
	expect(() => assertCompletePartition(["a", "b", "c"], [["b"], ["a", "c"]])).not.toThrow();
});

it.each([
	[["a"], ["b"]],
	[
		["a", "b"],
		["b", "c"],
	],
	[
		["a", "b"],
		["c", "extra"],
	],
	[["a", "b", "c"], []],
])("rejects missing, duplicate, extra or empty shard inventories: %j", (...shards) => {
	expect(() => assertCompletePartition(["a", "b", "c"], shards)).toThrow();
});
