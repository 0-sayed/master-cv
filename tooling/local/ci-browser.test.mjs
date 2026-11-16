import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import {
	ciBrowserEnvironment,
	ciBrowserWorkers,
	ciBrowserTestCommand,
	createCiBrowserDirectory,
} from "./ci-browser.mjs";

it("keeps Chromium singleton sockets within the Unix path limit inside the repository", async () => {
	const directory = await createCiBrowserDirectory();
	try {
		expect(directory.startsWith(new URL("../../.cache/", import.meta.url).pathname)).toBe(true);
		expect(Buffer.byteLength(`${directory}/org.chromium.Chromium.123456/SingletonSocket`) + 1).toBeLessThanOrEqual(108);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

it("uses one local worker when reproducing a weighted CI partition", () => {
	expect(ciBrowserWorkers({ args: ["--partition=3/10"], cores: 16, freeMemory: 23 * 1024 ** 3 })).toBe(1);
});

it("runs weighted CI partitions through the same partitioner as GitHub", () => {
	expect(ciBrowserTestCommand(["--workers=1", "--partition=3/10"])).toEqual([
		"exec",
		"node",
		"tooling/local/e2e-partition.mjs",
		"3",
		"10",
		"--workers=1",
	]);
});

it("preserves ordinary spec selection and native Playwright shards", () => {
	expect(ciBrowserTestCommand(["account-data-rights.spec.ts", "--shard=1/2"])).toEqual([
		"exec",
		"playwright",
		"test",
		"account-data-rights.spec.ts",
		"--shard=1/2",
	]);
});

it.each(["--partition=0/6", "--partition=7/6", "--partition=4"])("rejects invalid %s", (arg) => {
	expect(() => ciBrowserTestCommand([arg])).toThrow("--partition must be N/M");
});

it.each([
	[16, 23, 3],
	[8, 23, 3],
	[7, 23, 3],
	[16, 5, 3],
	[1, 23, 1],
	[16, 1, 1],
])("chooses local workers for %i cores and %i GB of free memory", (cores, gb, expected) => {
	expect(ciBrowserWorkers({ args: [], cores, freeMemory: gb * 1024 ** 3 })).toBe(expected);
});

it.each(["--workers=4", "--workers", "-j", "-j4", "-j=4"])("preserves explicit %s", (arg) => {
	expect(ciBrowserWorkers({ args: [arg, "4"], cores: 16, freeMemory: 23 * 1024 ** 3 })).toBeNull();
});

it("leaves GitHub Actions worker selection unchanged", () => {
	expect(ciBrowserWorkers({ args: [], githubActions: "true", cores: 16, freeMemory: 23 * 1024 ** 3 })).toBeNull();
	expect(ciBrowserWorkers({ args: [], githubActions: "false", cores: 8, freeMemory: 23 * 1024 ** 3 })).toBe(3);
});

const fixture = {
	parent: {
		PATH: "/fixture/bin",
		HOME: "/fixture",
		PLAYWRIGHT_CHANNEL: "chrome",
		E2E_REUSE_SERVER: "true",
		GOOGLE_CLIENT_SECRET: "synthetic",
		FLAG_ENABLE_GUEST_LOGIN: "true",
	},
	databaseUrl: "postgresql://runtime:synthetic@localhost/fresh_test",
	migrationUrl: "postgresql://migration:synthetic@localhost/fresh_test",
	directory: "/tmp/fresh-ci-browser",
};
it("keeps launched browser temporary files in the synthetic run directory", () => {
	expect(ciBrowserEnvironment({ ...fixture, parent: { ...fixture.parent, TMPDIR: "/external" } }).TMPDIR).toBe(
		fixture.directory,
	);
});
it("preloads isolation for child builds and production runtimes without inherited Node options", () => {
	const env = ciBrowserEnvironment({ ...fixture, parent: { ...fixture.parent, NODE_OPTIONS: "--require /private" } });
	expect(env.NODE_OPTIONS).toMatch(/^--import=file:.*\/tooling\/local\/test-isolation\.mjs$/u);
	expect(env.NODE_OPTIONS).not.toContain("/private");
	expect(env.TEST_INFERENCE_ISOLATION).toBe("true");
	expect(env).not.toHaveProperty("NODE_ENV");
});
it("ignores inherited browser, server, provider and product overrides", () => {
	const env = ciBrowserEnvironment(fixture);
	expect(env).toMatchObject({
		CI: "true",
		TZ: "UTC",
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		APP_URL: "http://localhost:3030",
		PORT: "3030",
		DATABASE_URL: fixture.databaseUrl,
		DATABASE_MIGRATION_URL: fixture.migrationUrl,
	});
	for (const key of ["PLAYWRIGHT_CHANNEL", "E2E_REUSE_SERVER", "GOOGLE_CLIENT_SECRET"])
		expect(env).not.toHaveProperty(key);
});
it("keeps the browser workflow's feature flags, isolated storage and SMTP settings", () => {
	const env = ciBrowserEnvironment(fixture);
	const workflow = readFileSync(new URL("../../.github/workflows/e2e.yml", import.meta.url), "utf8");
	for (const [, key, value] of workflow.matchAll(/^  (FLAG_\w+): "(true|false)"$/gm)) expect(env[key], key).toBe(value);
	expect(env).toMatchObject({
		STORAGE_BACKEND: "local",
		LOCAL_STORAGE_PATH: fixture.directory + "/storage",
		E2E_SMTP_PORT: "3033",
		E2E_MAIL_DIRECTORY: fixture.directory + "/mail",
	});
});

it.each(["OPENROUTER_API_KEY", "OPENROUTER_BENCHMARK_KEY"])(
	"refuses inherited %s before filtering the browser environment",
	(key) => {
		expect(() => ciBrowserEnvironment({ ...fixture, parent: { ...fixture.parent, [key]: "fake-key" } })).toThrow(
			`TEST_AI_CREDENTIAL_FORBIDDEN: ${key}`,
		);
	},
);
it("passes only an explicitly requested public evidence directory to browser children", () => {
	expect(
		ciBrowserEnvironment({ ...fixture, parent: { ...fixture.parent, E2E_PUBLIC_EVIDENCE_DIR: "/owner/evidence" } })
			.E2E_PUBLIC_EVIDENCE_DIR,
	).toBe("/owner/evidence");
	expect(ciBrowserEnvironment(fixture)).not.toHaveProperty("E2E_PUBLIC_EVIDENCE_DIR");
});
