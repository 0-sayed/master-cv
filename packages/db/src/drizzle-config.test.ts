import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

it.each([undefined, "", "   "])(
	"permits config introspection but refuses migration without an explicit URL: %s",
	async (value) => {
		vi.stubEnv("DATABASE_URL", "postgresql://runtime:fixture@localhost/fixture");
		vi.stubEnv("DATABASE_MIGRATION_URL", value);
		const { default: config } = await import("../drizzle.config");
		expect(config).toMatchObject({ dbCredentials: { url: "" } });
		const result = spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"], {
			cwd: fileURLToPath(new URL("../", import.meta.url)),
			env: {
				...process.env,
				DATABASE_URL: "postgresql://runtime:fixture@localhost/fixture",
				DATABASE_MIGRATION_URL: value ?? "",
			},
			encoding: "utf8",
			timeout: 10_000,
		});
		expect(result.error).toBeUndefined();
		expect(result.status).not.toBe(0);
		expect(result.stdout + result.stderr).toMatch(/Please provide required params for Postgres driver/);
	},
);

it("uses the explicitly selected migration connection", async () => {
	vi.stubEnv("DATABASE_URL", "postgresql://runtime:fixture@localhost/fixture");
	vi.stubEnv("DATABASE_MIGRATION_URL", "postgresql://migrator:fixture@localhost/fixture");
	const { default: config } = await import("../drizzle.config");
	expect(config).toMatchObject({ dbCredentials: { url: "postgresql://migrator:fixture@localhost/fixture" } });
});
