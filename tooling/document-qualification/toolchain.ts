import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import pins from "./versions.json";

function workspaceRoot() {
	let directory = process.cwd();
	while (!existsSync(join(directory, "pnpm-workspace.yaml"))) {
		const parent = dirname(directory);
		if (parent === directory) throw new Error("Document toolchain requires a workspace root");
		directory = parent;
	}
	return directory;
}

/** Verify executable AND linked Poppler library, independent of PATH and version banners. */
export async function verifiedPoppler(executable?: string) {
	const root = resolve(
		process.env.DOCUMENT_TOOLCHAIN_DIRECTORY ?? join(workspaceRoot(), ".superpowers/document-toolchain"),
	);
	const binaryPath = executable ?? join(root, "usr/bin/pdftotext");
	const libraryDirectory = join(root, "usr/lib/x86_64-linux-gnu");
	const artifacts = [
		{ path: binaryPath, sha256: pins.poppler.artifacts.binary },
		{ path: join(libraryDirectory, "libpoppler.so.118"), sha256: pins.poppler.artifacts.library },
	];
	for (const artifact of artifacts) {
		const actual = createHash("sha256")
			.update(await readFile(artifact.path))
			.digest("hex");
		if (actual !== artifact.sha256) throw new Error(`Pinned toolchain checksum mismatch: ${artifact.path}`);
	}
	return {
		binaryPath,
		libraryDirectory,
		revision: pins.poppler.revision,
		artifacts,
		env: {
			...process.env,
			LD_LIBRARY_PATH: [libraryDirectory, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
		},
	};
}
