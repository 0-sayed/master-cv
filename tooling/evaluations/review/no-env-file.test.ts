import { spawnSync } from "node:child_process";
import { expect, it } from "vite-plus/test";

it("blocks environment loading without replacing process credentials or transport", () => {
	const result = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		process.loadEnvFile = () => { throw new Error("ENV_FILE_READ"); };
		process.env.OPENROUTER_BENCHMARK_KEY = "synthetic-test-token";
		const transport = async () => new Response("offline");
		globalThis.fetch = transport;
		await import(${JSON.stringify(new URL("./no-env-file.mjs", import.meta.url).href)});
		process.loadEnvFile();
		if (globalThis.fetch !== transport) throw new Error("TRANSPORT_REPLACED");
		if (process.env.OPENROUTER_BENCHMARK_KEY !== "synthetic-test-token") throw new Error("KEY_REPLACED");
	`,
		],
		{ encoding: "utf8" },
	);
	expect(result.status, result.stderr).toBe(0);
	expect(result.stdout).toBe("");
});
