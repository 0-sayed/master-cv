import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { readBenchmarkKey } from "./credentials";

it("requires an explicit file and only accepts its benchmark key", async () => {
	const directory = await mkdtemp(join(tmpdir(), "benchmark-key-"));
	const file = join(directory, "keys.env");
	try {
		await expect(readBenchmarkKey(undefined)).rejects.toThrow("ENV_FILE_REQUIRED");
		await writeFile(file, "OPENROUTER_API_KEY=fake-app-only\n");
		await expect(readBenchmarkKey(file)).rejects.toThrow("BENCHMARK_KEY_REQUIRED");
		await writeFile(file, "OPENROUTER_API_KEY=fake-app-only\nOPENROUTER_BENCHMARK_KEY=fake-benchmark-only\n");
		expect(await readBenchmarkKey(file)).toBe("fake-benchmark-only");
	} finally {
		await rm(directory, { recursive: true });
	}
});
