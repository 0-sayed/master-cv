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
	[false, false, 0, true],
	[true, true, 0, true],
	[true, false, 1, true],
	[false, true, 1, true],
	[false, false, 1, false],
] as const)(
	"requires matching table and graph completion: table=%s graph=%s",
	(tableDone, graphDone, status, otpAfterPaid) => {
		const source = fileURLToPath(new URL("..", import.meta.url));
		const root = mkdtempSync(join(tmpdir(), "master-cv-roadmap-"));
		try {
			cpSync(join(source, "Planning"), join(root, "Planning"), { recursive: true });
			for (const entry of readdirSync(source)) {
				if (!["Planning", "docs", ".git", ".archon"].includes(entry) && !entry.startsWith(".env"))
					symlinkSync(join(source, entry), join(root, entry));
			}
			// Ignored local plans must not hide broken links in the CI snapshot.
			const documents = spawnSync(
				"git",
				["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "docs"],
				{
					cwd: source,
					encoding: "utf8",
				},
			);
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
			if (!otpAfterPaid) {
				const brief = join(root, "Planning/roadmap/tasks/T014-mobile-authentication.md");
				writeFileSync(
					table,
					readFileSync(table, "utf8").replace("`T003`, `T009`, `T015`, `T017`", "`T003`, `T009`, `T017`"),
				);
				writeFileSync(brief, readFileSync(brief, "utf8").replace("T003, T009, T015, T017", "T003, T009, T017"));
				writeFileSync(graph, readFileSync(graph, "utf8").replace("    T015 --> T014\n", ""));
			}
			const result = spawnSync("python3", [join(root, "Planning/roadmap/check.py")], { encoding: "utf8" });
			expect(result.status, result.stdout + result.stderr).toBe(status);
			if (status === 1)
				expect(result.stdout + result.stderr).toContain(otpAfterPaid ? "completion" : "T014: dependency contract");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
);
