import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("pg", async () => {
	const { EventEmitter } = await import("node:events");
	return { Pool: class extends EventEmitter {} };
});
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => ({}) }));
vi.mock("@reactive-resume/env/server", () => ({ env: { DATABASE_URL: "postgresql://fixture.invalid/test" } }));

afterEach(() => {
	globalThis.__pool = undefined;
	globalThis.__drizzle = undefined;
	vi.restoreAllMocks();
	vi.resetModules();
});

it("handles pool and client failures without logging connection objects or private messages", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	const { getPool } = await import("./client");
	const pool = getPool();
	const failure = Object.assign(new Error("private CV and postgres://private-password"), {
		code: "57P01",
		client: { password: "private-password" },
	});
	pool.emit("error", failure);
	const client = new EventEmitter();
	pool.emit("connect", client);
	client.emit("error", failure);
	expect(log.mock.calls).toEqual([
		[{ event: "postgres_connection_error", code: "57P01" }],
		[{ event: "postgres_connection_error", code: "57P01" }],
	]);
});

it("does not trust arbitrary values in a connection error's code", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	const { getPool } = await import("./client");
	getPool().emit("error", { code: "private-data\ninjected" });
	expect(log.mock.calls).toEqual([[{ event: "postgres_connection_error", code: "unknown" }]]);
});
