import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Keep command capture under -o; sandboxed workers may forbid subprocess pipes. */
export function captureCommand(command: string, args: string[], options: { out: string; timeout?: number }) {
	mkdirSync(options.out, { recursive: true });
	const folder = mkdtempSync(join(options.out, ".command-"));
	const descriptors: number[] = [];
	try {
		const stdout = join(folder, "stdout");
		const stderr = join(folder, "stderr");
		const output = openSync(stdout, "w");
		descriptors.push(output);
		const errors = openSync(stderr, "w");
		descriptors.push(errors);
		const result = spawnSync(command, args, {
			stdio: ["ignore", output, errors],
			timeout: options.timeout ?? 60_000,
		});
		return { ...result, stdout: readFileSync(stdout, "utf8"), stderr: readFileSync(stderr, "utf8") };
	} finally {
		for (const descriptor of descriptors) closeSync(descriptor);
		rmSync(folder, { recursive: true, force: true });
	}
}
