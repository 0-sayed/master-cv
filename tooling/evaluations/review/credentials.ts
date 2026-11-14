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

/** Owner-only explicit plain token; this path never parses or loads an environment file. */
export async function readBenchmarkKeyFile(path: string): Promise<string> {
	const key = (await readFile(resolve(path), "utf8")).trim();
	if (!key || /[\s=]/u.test(key)) throw new Error("BENCHMARK_TOKEN_INVALID");
	registerDiagnosticSecrets({ OPENROUTER_BENCHMARK_KEY: key });
	return key;
}
