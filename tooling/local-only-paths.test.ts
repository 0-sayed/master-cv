import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";

it("ships no source, test or configuration dependency on the ignored execution workspace", async () => {
	const root = new URL("../", import.meta.url);
	const paths = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
		cwd: root,
		encoding: "utf8",
	}).split("\0");
	const forbidden = [".", "superpowers", "/"].join("");
	const localEvidence = new Set([
		"docs/t000-evidence.md",
		"docs/t001-document-compatibility.md",
		"docs/t003-evidence.md",
	]);
	const dependencies: string[] = [];
	for (const path of new Set(paths)) {
		if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|html|css|toml|mdx?)$/.test(path) || localEvidence.has(path)) continue;
		const file = new URL(path, root);
		if (!existsSync(file)) continue;
		const lines = (await readFile(file, "utf8")).split("\n");
		if (
			lines.some(
				(line) => line.includes(forbidden) && !(path === "compose.dev.yml" && line.trim() === "- " + forbidden),
			)
		)
			dependencies.push(path);
	}
	expect(dependencies).toEqual([]);
});
