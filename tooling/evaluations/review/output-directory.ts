import { randomUUID } from "node:crypto";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function evaluationOutputFolder(options: { out: string; resume?: string | undefined; temporary?: boolean }) {
	const allowed =
		options.temporary && resolve(options.out).startsWith("/tmp/")
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
	return folder;
}
