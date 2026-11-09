import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const { Pool } = createRequire(new URL("../../packages/db/package.json", import.meta.url))("pg");

/** Provision only an explicitly selected local synthetic database. Never grants ownership or migration membership. */
export async function provisionRuntimeRole(migrationUrl, role = "master_cv_runtime") {
	const url = new URL(migrationUrl);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host"))
		throw new Error("Local database required");
	if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw new Error("Invalid runtime role name");
	const pool = new Pool({ connectionString: url.toString(), max: 1 });
	const password = randomBytes(32).toString("hex");
	try {
		if ((await pool.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount) {
			throw new Error("Runtime role already exists; preserving its credentials");
		}
		await pool.query("BEGIN");
		await pool.query(
			`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`,
		);
		await pool.query(`GRANT CONNECT ON DATABASE "${url.pathname.slice(1).replaceAll('"', '""')}" TO "${role}"`);
		await pool.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
		await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
		await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
		await pool.query(`REVOKE UPDATE,DELETE ON career_fact_revision FROM "${role}"`);
		await pool.query(`GRANT EXECUTE ON FUNCTION master_cv_queue_owners() TO "${role}"`);
		await pool.query(`GRANT EXECUTE ON FUNCTION master_cv_stale_agent_owners() TO "${role}"`);
		await pool.query("COMMIT");
		url.username = role;
		url.password = password;
		return url.toString();
	} catch (error) {
		await pool.query("ROLLBACK");
		throw error;
	} finally {
		await pool.end();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (existsSync(".env.runtime.local")) throw new Error("Preserving existing .env.runtime.local; no role created");
	if (!process.env.DATABASE_MIGRATION_URL)
		throw new Error("DATABASE_MIGRATION_URL must select a local synthetic database");
	const runtimeUrl = await provisionRuntimeRole(process.env.DATABASE_MIGRATION_URL);
	writeFileSync(
		".env.runtime.local",
		`DATABASE_URL=${runtimeUrl}\nDATABASE_MIGRATION_URL=${process.env.DATABASE_MIGRATION_URL}\n`,
		{ mode: 0o600, flag: "wx" },
	);
	console.info("Created restricted local role; private configuration written to .env.runtime.local");
}
