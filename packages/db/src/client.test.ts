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

it("binds an existing transaction without opening another one and refuses owner changes", async () => {
	const { withOwnerTransaction, withOwnerDatabase, db } = await import("./client");
	const execute = vi.fn().mockResolvedValue(undefined);
	const transaction = { execute } as unknown as import("./client").OwnerTransaction;
	await withOwnerTransaction("demo", transaction, async () => {
		expect(db.execute).toBeDefined();
		await withOwnerDatabase("demo", async (tx) => {
			expect(tx).toBe(transaction);
		});
		await expect(withOwnerDatabase("other", async () => {})).rejects.toThrow("Cannot change database owner");
		await expect(withOwnerTransaction("demo", {} as typeof transaction, async () => {})).rejects.toThrow(
			"Cannot replace",
		);
	});
	expect(execute).toHaveBeenCalledTimes(1);
});
