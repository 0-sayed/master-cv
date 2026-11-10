import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAllowlist, closeParser, collectFindings } from "./scan.mjs";

export const root = fileURLToPath(new URL("../..", import.meta.url));
export const sourceRoots = ["apps/web/src", "packages/ui/src"];
export function sourceFiles(directory) {
	return readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const path = resolve(directory, entry.name);
			return entry.isDirectory() ? sourceFiles(path) : /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name) ? [path] : [];
		})
		.sort();
}

export function check(rootDirectory = root) {
	try {
		const findings = sourceRoots
			.flatMap((directory) => sourceFiles(resolve(rootDirectory, directory)))
			.flatMap((path) => collectFindings(relative(rootDirectory, path), readFileSync(path, "utf8")));
		const { entries } = JSON.parse(
			readFileSync(resolve(rootDirectory, "tooling/design-tokens/allowlist.json"), "utf8"),
		);
		return checkAllowlist(findings, entries);
	} finally {
		closeParser();
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const diagnostics = check();
	for (const diagnostic of diagnostics) {
		console.error(
			`${diagnostic.file}:${diagnostic.line}: design-tokens/${diagnostic.kind} ${JSON.stringify(diagnostic.literal)} (${diagnostic.context})\n  ${diagnostic.replacement}`,
		);
	}
	if (diagnostics.length) {
		console.error(`Design tokens: ${diagnostics.length} unapproved or stale occurrences.`);
		process.exitCode = 1;
	} else console.log("Design tokens: passed (exact occurrence-bounded allowances).");
}
