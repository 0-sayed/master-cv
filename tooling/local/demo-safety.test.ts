import type { LookupAddress } from "node:dns";
import { spawnSync } from "node:child_process";
import * as dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { assertDemoEnvironment } from "./demo-safety";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

const local = {
	NODE_ENV: "development",
	DATABASE_URL: "postgresql://runtime:synthetic@127.0.0.1:25532/demo",
	APP_URL: "http://127.0.0.1:23100",
};
afterEach(() => vi.restoreAllMocks());

describe("local demo environment guard", () => {
	it.each([
		{ NODE_ENV: "production" },
		{ STORAGE_BACKEND: "s3" },
		{ STORAGE_BACKEND: "r2" },
		{ STORAGE_BACKEND: "blob" },
		{ DATABASE_URL: undefined },
		{ DATABASE_URL: "postgresql://runtime:secret@remote.example.test/demo" },
		{ APP_URL: "https://remote.example.test" },
		{ DATABASE_URL: "malformed-secret" },
		{ DATABASE_URL: "postgresql://127.0.0.1,remote.example.test/demo" },
		{ DATABASE_URL: local.DATABASE_URL + "?host=remote.example.test" },
		{ DATABASE_URL: local.DATABASE_URL + "?hostaddr=192.0.2.1" },
		{ DATABASE_URL: local.DATABASE_URL + "?options=-c%20role=postgres" },
		{ OPENAI_API_KEY: "synthetic-secret" },
		{ AI_API_KEY: "synthetic-secret" },
	])("refuses unsafe configuration without exposing its values: %s", async (patch) => {
		await expect(assertDemoEnvironment({ ...local, ...patch })).rejects.toThrow(/^DEMO_[A-Z_]+$/);
	});
	it.each(["127.0.0.1", "127.12.1.1", "[::1]"])("accepts numeric loopback %s", async (host) => {
		await expect(
			assertDemoEnvironment({
				...local,
				DATABASE_URL: `postgresql://runtime:synthetic@${host}:25532/demo`,
				APP_URL: `http://${host}:23100`,
			}),
		).resolves.toMatchObject({ appUrl: `http://${host}:23100` });
	});
	it("requires every localhost resolution to be loopback", async () => {
		vi.mocked(
			dns.lookup as (host: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>,
		).mockImplementation(async () => [
			{ address: "127.0.0.1", family: 4 },
			{ address: "::1", family: 6 },
		]);
		await expect(
			assertDemoEnvironment({ ...local, DATABASE_URL: "postgresql://runtime:synthetic@localhost/demo" }),
		).resolves.toBeDefined();
		vi.mocked(
			dns.lookup as (host: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>,
		).mockImplementation(async () => [
			{ address: "127.0.0.1", family: 4 },
			{ address: "192.0.2.1", family: 4 },
		]);
		await expect(
			assertDemoEnvironment({ ...local, DATABASE_URL: "postgresql://runtime:synthetic@localhost/demo" }),
		).rejects.toThrow("DEMO_LOOPBACK_REQUIRED");
	});
	it("fails before the absent application runner can import or connect", () => {
		const result = spawnSync(process.execPath, ["local/demo-seed.mjs"], {
			cwd: process.cwd(),
			env: {
				PATH: process.env.PATH ?? "",
				NODE_ENV: "development",
				DATABASE_URL: "postgresql://secret:do-not-print@remote.example.test/demo",
				APP_URL: local.APP_URL,
			},
			encoding: "utf8",
		});
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr.trim()).toBe("DEMO_LOOPBACK_REQUIRED");
	});
});

it("accepts the supported Docker-published loopback URL", async () => {
	await expect(
		assertDemoEnvironment({
			NODE_ENV: "development",
			DATABASE_URL: "postgresql://runtime:synthetic@127.0.0.1:25532/demo",
			APP_URL: "http://127.0.0.1:23100",
		}),
	).resolves.toMatchObject({ appUrl: "http://127.0.0.1:23100" });
});
