import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vite-plus/test";
// @boundaries-ignore root shared Vitest config audit
import { createVitestProjectConfig } from "../../vitest.shared.mts";

const guard = fileURLToPath(new URL("./test-ai-guard.mjs", import.meta.url));
it("loads the guard through Playwright's CommonJS transform and blocks credentials and fetch", () => {
	const out = mkdtempSync(join(tmpdir(), "playwright-guard-"));
	try {
		const config = join(out, "playwright.config.cts");
		const playwright = import.meta.resolve("@playwright/test");
		writeFileSync(
			config,
			`import ${JSON.stringify(guard)};
import { defineConfig } from ${JSON.stringify(fileURLToPath(playwright))};
let blocked = false;
try { fetch("https://openrouter.ai/api/v1/chat/completions"); } catch (e) { blocked = e.message === "TEST_OPENROUTER_NETWORK_FORBIDDEN"; }
if (!blocked) throw new Error("GUARD_NOT_INSTALLED");
process.loadEnvFile("/forbidden-test-environment");
export default defineConfig({ testDir: ${JSON.stringify(out)} });`,
		);
		writeFileSync(
			join(out, "guard.spec.ts"),
			`import { test } from ${JSON.stringify(fileURLToPath(playwright))}; test("offline discovery", () => {});`,
		);
		for (const key of [null, "OPENROUTER_API_KEY", "OPENROUTER_BENCHMARK_KEY"]) {
			const log = join(out, "output");
			const fd = openSync(log, "w");
			let result;
			try {
				result = spawnSync(
					process.execPath,
					[
						fileURLToPath(import.meta.resolve("@playwright/test/cli")),
						"test",
						"--list",
						"--reporter=list",
						"--config",
						config,
					],
					{
						env: { PATH: process.env.PATH, NODE_ENV: "test", ...(key ? { [key]: "fake-secret-never-print" } : {}) },
						stdio: ["ignore", fd, fd],
					},
				);
			} finally {
				closeSync(fd);
			}
			const output = readFileSync(log, "utf8");
			expect(result.status, output).toBe(key ? 1 : 0);
			expect(output).toContain(key ? `TEST_AI_CREDENTIAL_FORBIDDEN: ${key}` : "offline discovery");
			expect(output).not.toContain("fake-secret-never-print");
		}
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});
describe("test credential isolation", () => {
	it.each(["OPENROUTER_API_KEY", "OPENROUTER_BENCHMARK_KEY"])(
		"rejects %s even when empty without leaking values",
		(key) => {
			for (const value of ["", "fake-secret-never-print"]) {
				const result = spawnSync(process.execPath, [guard], {
					env: { PATH: process.env.PATH, [key]: value },
					encoding: "utf8",
				});
				expect(result.status).toBe(1);
				expect(result.stderr).toContain(`TEST_AI_CREDENTIAL_FORBIDDEN: ${key}`);
				expect(result.stderr).not.toContain("fake-secret-never-print");
			}
		},
	);
	it("accepts a credential-free environment", () => {
		expect(spawnSync(process.execPath, [guard], { env: { PATH: process.env.PATH } }).status).toBe(0);
	});
});

it("disables Vite dotenv loading before configuration resolution for every test mode", async () => {
	const { testViteEnvironment } = await import("./test-ai-guard.mjs");
	for (const environment of [{ VITEST: "true" }, { VITEST: "1", NODE_ENV: "production" }, { NODE_ENV: "test" }]) {
		expect(testViteEnvironment("/workspace", environment)).toBe(false);
	}
	expect(testViteEnvironment("/workspace", {})).toBe("/workspace");
	expect(testViteEnvironment("/workspace", {}, "test")).toBe(false);
});

it("blocks actual OpenRouter fetch before dispatch", async () => {
	expect(() => fetch("https://openrouter.ai/api/v1/chat/completions")).toThrow("TEST_OPENROUTER_NETWORK_FORBIDDEN");
});

it("disables native dotenv loading before application imports", () => {
	// This path deliberately does not exist. A disabled loader must never open it.
	expect(() => process.loadEnvFile("/forbidden-environment/.env.test")).not.toThrow();
	expect(Object.hasOwn(process.env, "OPENROUTER_API_KEY")).toBe(false);
	expect(Object.hasOwn(process.env, "OPENROUTER_BENCHMARK_KEY")).toBe(false);
});

it("preserves relative URL behavior of an injected local transport", async () => {
	const { installTestNetworkGuard } = await import("./test-ai-guard.mjs");
	const original = globalThis.fetch;
	const local = vi.fn(async () => new Response("local"));
	try {
		globalThis.fetch = local;
		installTestNetworkGuard();
		expect(await (await fetch("/local-only")).text()).toBe("local");
		expect(local).toHaveBeenCalledTimes(1);
	} finally {
		globalThis.fetch = original;
	}
});

it("all checked-in Vitest entry points inherit dotenv isolation", async () => {
	const { globSync, readFileSync } = await import("node:fs");
	const root = fileURLToPath(new URL("../..", import.meta.url));
	const configs = globSync(["apps/*/vitest.config.ts", "packages/*/vitest.config.ts", "tooling/vitest*.config.ts"], {
		cwd: root,
	});
	expect(configs.length).toBeGreaterThan(20);
	expect(createVitestProjectConfig({ name: "isolation-audit", dirname: root }).envDir).toBe(false);
	expect(readFileSync(`${root}/vite.config.ts`, "utf8")).toMatch(/envDir: false/u);
	expect(readFileSync(`${root}/apps/web/vite.config.ts`, "utf8")).toMatch(
		/envDir: testViteEnvironment\(workspaceRoot, process.env, mode\)/u,
	);
	for (const path of configs) {
		const text = readFileSync(`${root}/${path}`, "utf8");
		expect(text, path).toMatch(/createVitestProjectConfig|\.\/vitest\.config/u);
		expect(text, path).not.toMatch(/envDir\s*:/u);
	}
});
