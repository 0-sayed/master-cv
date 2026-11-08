import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

it.each([
	[false, false, 0],
	[true, true, 0],
	[true, false, 1],
	[false, true, 1],
] as const)("requires matching table and graph completion: table=%s graph=%s", (tableDone, graphDone, status) => {
	const source = fileURLToPath(new URL("..", import.meta.url));
	const root = mkdtempSync(join(tmpdir(), "master-cv-roadmap-"));
	try {
		cpSync(join(source, "Planning"), join(root, "Planning"), { recursive: true });
		for (const entry of readdirSync(source)) {
			if (entry !== "Planning" && entry !== ".git" && entry !== ".archon")
				symlinkSync(join(source, entry), join(root, entry));
		}
		const table = join(root, "Planning/roadmap/tasks.md");
		writeFileSync(
			table,
			readFileSync(table, "utf8").replace(/\| \[[ x]\](\s*\|[^\n]*`T000`)/, `| [${tableDone ? "x" : " "}]$1`),
		);
		const graph = join(root, "Planning/roadmap/dependencies.mmd");
		const graphText = readFileSync(graph, "utf8")
			.replace(/class T000 done;\s*/u, "")
			.replace(/class T000,/u, "class ");
		writeFileSync(graph, graphText + `\n    class T000 ${graphDone ? "done" : "pending"};\n`);
		const result = spawnSync("python3", [join(root, "Planning/roadmap/check.py")], { encoding: "utf8" });
		expect(result.status, result.stdout + result.stderr).toBe(status);
		if (status === 1) expect(result.stdout + result.stderr).toContain("completion");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
