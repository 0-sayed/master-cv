import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, basename } from "node:path";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function evaluationOutputFolder(options: { out: string; resume?: string | undefined; temporary?: boolean }) {
	const archive = "/mnt/storage/master-cv-design-archive/ui-audit/personal-career-benchmark";
	const archiveSuffix = relative(archive, resolve(options.out));
	const inArchive = !archiveSuffix.startsWith("..") && !archiveSuffix.startsWith("/");
	const allowed = inArchive
		? archive
		: options.temporary && resolve(options.out).startsWith("/tmp/")
			? resolve("/tmp")
			: fileURLToPath(new URL("../results", import.meta.url));
	const root = resolve(options.out);
	const folder = options.resume
		? resolve(options.resume)
		: join(root, `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`);
	const rootSuffix = relative(allowed, root);
	const suffix = relative(allowed, folder);
	if (
		rootSuffix.startsWith("..") ||
		resolve(allowed, rootSuffix) !== root ||
		!suffix ||
		suffix.startsWith("..") ||
		resolve(allowed, suffix) !== folder
	)
		throw new Error("OUTPUT_MUST_BE_EVALUATION_RESULTS");
	const canonical = (path: string): string => {
		if (existsSync(path)) return realpathSync(path);
		return join(canonical(dirname(path)), basename(path));
	};
	const realSuffix = relative(canonical(allowed), canonical(folder));
	if (realSuffix.startsWith("..") || realSuffix.startsWith("/")) throw new Error("OUTPUT_MUST_BE_EVALUATION_RESULTS");
	return folder;
}
