import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";

it("rejects tracked conflict markers while allowing clean files", () => {
	const workflow = readFileSync(new URL("../.github/workflows/autofix.yml", import.meta.url), "utf8");
	const script = workflow.match(/      - name: Reject conflict markers\n        run: \|\n([\s\S]*?)(?=\n      -)/)?.[1];
	if (!script) throw new Error("Conflict marker validation is missing");
	const root = mkdtempSync(join(tmpdir(), "master-cv-conflicts-"));
	try {
		expect(spawnSync("git", ["init", "--quiet", root]).status).toBe(0);
		const path = join(root, "source.txt");
		writeFileSync(path, "clean source\n");
		expect(spawnSync("git", ["add", "source.txt"], { cwd: root }).status).toBe(0);
		expect(spawnSync("bash", ["-eu", "-c", script], { cwd: root }).status).toBe(0);
		writeFileSync(
			path,
			["<".repeat(7) + " HEAD", "ours", "=".repeat(7), "theirs", ">".repeat(7) + " branch", ""].join("\n"),
		);
		expect(spawnSync("bash", ["-eu", "-c", script], { cwd: root }).status).toBe(1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
