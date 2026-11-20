import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ensureAiBudget } from "./ai-budget.mjs";

const route = JSON.parse(
	await readFile(new URL("../../../apps/server/src/startup/ai-route.json", import.meta.url), "utf8"),
);
const validRoute = Object.fromEntries(
	["routeId", "routeRevision", "requestCapMicros", "dayCapMicros", "concurrency"].map((key) => [key, route[key]]),
);

describe("ensureAiBudget", () => {
	it("rejects non-loopback database URLs", async () => {
		await expect(ensureAiBudget("postgresql://user:secret@db.example.com/app", validRoute)).rejects.toThrow(
			"Local database required",
		);
	});

	it.each([
		{ ...validRoute, requestCapMicros: 0 },
		{ ...validRoute, dayCapMicros: 0 },
		{ ...validRoute, requestCapMicros: validRoute.dayCapMicros + 1 },
		{ ...validRoute, concurrency: 0 },
	])("rejects invalid budget values", async (invalidRoute) => {
		await expect(ensureAiBudget("postgresql://user:secret@127.0.0.1/app", invalidRoute)).rejects.toThrow(
			"Invalid AI budget",
		);
	});

	it.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)(
		"inserts eight UTC days once using the approved route values",
		async () => {
			const connection = process.env.COVER_LETTER_TEST_DATABASE_URL;
			if (!connection) throw new Error("Disposable local database required");
			const testRoute = { ...validRoute, routeId: `${validRoute.routeId}-${randomUUID()}` };
			const databaseName = `ai_budget_seed_${randomUUID().replaceAll("-", "")}`;
			const admin = new Pool({ connectionString: connection, max: 1 });
			await admin.query(`CREATE DATABASE "${databaseName}"`);
			const url = new URL(connection);
			url.pathname = `/${databaseName}`;
			const database = url.toString();
			const pool = new Pool({ connectionString: database, max: 1 });
			try {
				await migrate(drizzle({ client: pool }), {
					migrationsFolder: fileURLToPath(new URL("../../../migrations", import.meta.url)),
				});
				expect(await ensureAiBudget(database, testRoute)).toBe(8);
				expect(await ensureAiBudget(database, testRoute)).toBe(0);
				const rows = await pool.query(
					"SELECT route_revision, cap_micros, request_cap_micros, concurrency FROM ai_platform_budget WHERE route_id=$1 ORDER BY window_date",
					[testRoute.routeId],
				);
				expect(rows.rowCount).toBe(8);
				expect(rows.rows).toEqual(
					Array.from({ length: 8 }, () => ({
						route_revision: route.routeRevision,
						cap_micros: String(route.dayCapMicros),
						request_cap_micros: String(route.requestCapMicros),
						concurrency: route.concurrency,
					})),
				);
			} finally {
				await pool.end();
				await admin.query(`DROP DATABASE "${databaseName}"`);
				await admin.end();
			}
		},
	);
});
