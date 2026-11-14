import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { registerDiagnosticSecrets } from "./diagnostics";

/** Never inherit the app credential or a shell credential for a paid benchmark. */
export async function readBenchmarkKey(envFile: string | undefined): Promise<string> {
	if (!envFile) throw new Error("ENV_FILE_REQUIRED");
	const values = parseEnv(await readFile(resolve(envFile), "utf8"));
	registerDiagnosticSecrets(values);
	const key = values.OPENROUTER_BENCHMARK_KEY?.trim();
	if (!key) throw new Error("BENCHMARK_KEY_REQUIRED");
	return key;
}
