import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { parseOptions } from "./config";
import { readBenchmarkKeyFile } from "./credentials";
it("reads only an explicit plain benchmark token file and rejects ambiguous credentials", async () => {
	const directory = await mkdtemp("/tmp/benchmark-token-");
	try {
		const path = join(directory, "synthetic-token.txt");
		await writeFile(path, "synthetic-benchmark-token\n");
		expect(await readBenchmarkKeyFile(path)).toBe("synthetic-benchmark-token");
		await writeFile(path, "OPENROUTER_BENCHMARK_KEY=synthetic");
		await expect(readBenchmarkKeyFile(path)).rejects.toThrow("BENCHMARK_TOKEN_INVALID");
		expect(parseOptions(["--key-file", path]).keyFile).toBe(path);
		expect(() => parseOptions(["--key-file", path, "--env-file", "unused"])).toThrow("DUPLICATE_CREDENTIAL_SOURCE");
	} finally {
		await rm(directory, { recursive: true });
	}
});
