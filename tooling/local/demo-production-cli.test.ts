import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

it("refuses missing confirmation before app imports, sockets, or environment-file loading", () => {
	const result = spawnSync(process.execPath, ["--import", "tsx", "local/demo-production-cli.ts"], {
		cwd: fileURLToPath(new URL("..", import.meta.url)),
		encoding: "utf8",
		env: {
			PATH: process.env.PATH,
			NODE_ENV: "production",
			DEMO_ACCOUNT_EMAIL: "boss@example.test",
			DEMO_ACCOUNT_PASSWORD: "Private-production-password!",
			OPENROUTER_API_KEY: "must-never-be-printed",
		},
	});
	expect(result.status).toBe(1);
	expect(result.stderr.trim()).toBe("DEMO_PRODUCTION_CONFIRM_REQUIRED");
	expect(result.stdout).toBe("");
});
