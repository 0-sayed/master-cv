import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
			if (!["Planning", "docs", ".git", ".archon"].includes(entry) && !entry.startsWith(".env"))
				symlinkSync(join(source, entry), join(root, entry));
		}
		// Ignored local plans must not hide broken links in the CI snapshot.
		const documents = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "docs"], {
			cwd: source,
			encoding: "utf8",
		});
		expect(documents.status, documents.stderr).toBe(0);
		for (const document of documents.stdout.split("\0").filter(Boolean)) {
			if (!existsSync(join(source, document))) continue;
			mkdirSync(dirname(join(root, document)), { recursive: true });
			cpSync(join(source, document), join(root, document));
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
