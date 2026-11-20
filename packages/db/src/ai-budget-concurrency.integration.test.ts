import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("AI platform budget concurrency", () => {
	it("admits the third and fiftieth jobs at 100, and denies the fourth at 3", async () => {
		const connection = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!connection) throw new Error("Disposable local database required");
		const suffix = randomUUID().replaceAll("-", "");
		const databaseName = `ai_budget_${suffix}`;
		const userId = `ai-budget-${suffix}`;
		const operationPrefix = `ai-budget-${suffix}`;
		const admin = new Pool({ connectionString: connection });
		const migrations = fileURLToPath(new URL("../../../migrations", import.meta.url));
		await admin.query(`CREATE DATABASE "${databaseName}"`);
		const url = new URL(connection);
		url.pathname = `/${databaseName}`;
		const pool = new Pool({ connectionString: url.toString(), max: 1 });
		try {
			const db = drizzle({ client: pool });
			await migrate(db, { migrationsFolder: migrations });
			await pool.query(
				`INSERT INTO "user" (id,name,email,username,display_username)
				 VALUES ($1,$1,$1||'@example.test',$1,$1)`,
				[userId],
			);
			await pool.query("SELECT set_config('app.user_id', $1, false)", [userId]);
			const route = { routeId: operationPrefix, routeRevision: "1" };
			const day = new Date().toISOString().slice(0, 10);
			const budgetId = `${route.routeId}:1:${day}`;
			await pool.query(
				"INSERT INTO ai_platform_budget (id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ($1,$2,'1',$3,10000000,1000,100)",
				[budgetId, route.routeId, day],
			);

			const insertOperation = async (id: string, budget: string | null) => {
				await pool.query(
					`INSERT INTO ai_operation
					 (id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version,state,budget_id)
					 VALUES ($1,$2,$1,$1,'review.extraction','[]'::jsonb,$3::jsonb,'1','1','1','queued',$4)`,
					[id, userId, JSON.stringify(route), budget],
				);
			};
			const admit = async (id: string) => {
				await insertOperation(id, null);
				const result = await pool.query("SELECT master_cv_ai_admit_budget($1,1000,10000000) AS admitted", [id]);
				return result.rows[0]?.admitted;
			};
			const seedLive = async (count: number) => {
				for (let index = 0; index < count; index++) await insertOperation(`${operationPrefix}-live-${index}`, budgetId);
			};

			await seedLive(2);
			expect(await admit(`${operationPrefix}-third`)).toBe(true);
			await pool.query("DELETE FROM ai_operation WHERE id LIKE $1", [`${operationPrefix}%`]);
			await pool.query("UPDATE ai_platform_budget SET active=0,reserved_micros=0 WHERE id=$1", [budgetId]);

			await seedLive(49);
			expect(await admit(`${operationPrefix}-fiftieth`)).toBe(true);
			await pool.query("DELETE FROM ai_operation WHERE id LIKE $1", [`${operationPrefix}%`]);
			await pool.query("UPDATE ai_platform_budget SET active=0,reserved_micros=0,concurrency=3 WHERE id=$1", [
				budgetId,
			]);
			await seedLive(3);
			expect(await admit(`${operationPrefix}-fourth`)).toBe(false);
		} finally {
			await pool.end();
			await admin.query(`DROP DATABASE "${databaseName}"`);
			await admin.end();
		}
	});
});
