import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

if (!process.env.DATABASE_MIGRATION_URL) throw new Error("DATABASE_MIGRATION_URL is required");

const pool = new Pool({
	connectionString: process.env.DATABASE_MIGRATION_URL,
	max: 1,
	connectionTimeoutMillis: 10_000,
});
try {
	const client = await pool.connect();
	try {
		await client.query("SELECT pg_advisory_lock(721830451)");
		try {
			await migrate(drizzle({ client }), { migrationsFolder: "/app/migrations" });
		} finally {
			await client.query("SELECT pg_advisory_unlock(721830451)");
		}
	} finally {
		client.release();
	}
} finally {
	await pool.end();
}
