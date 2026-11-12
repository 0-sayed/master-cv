import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withDatabasePool } from "@reactive-resume/db/client";

/** Each suite owns a disposable migrated database and a restricted runtime connection. */
export function aiTestDatabase() {
	const suffix = randomUUID().replaceAll("-", "");
	const name = `t005_${suffix}`;
	const role = `t005_runtime_${suffix}`;
	let admin: Pool;
	let fixture: Pool;
	let runtime: Pool;
	beforeAll(async () => {
		const connectionString = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!connectionString) throw new Error("Disposable database admin connection required");
		const url = new URL(connectionString);
		if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
			throw new Error("Local synthetic database required");
		admin = new Pool({ connectionString });
		await admin.query(`CREATE DATABASE "${name}"`);
		url.pathname = `/${name}`;
		fixture = new Pool({ connectionString: url.toString() });
		await migrate(drizzle({ client: fixture }), {
			migrationsFolder: fileURLToPath(new URL("../../../../../../migrations", import.meta.url)),
		});
		await fixture.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${suffix}' NOSUPERUSER NOBYPASSRLS NOINHERIT`);
		await fixture.query(
			`GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
		);
		await fixture.query(
			`REVOKE UPDATE,DELETE ON career_fact_revision FROM "${role}"; REVOKE UPDATE,DELETE,TRUNCATE ON ai_usage_ledger FROM "${role}"; REVOKE ALL ON ai_platform_budget FROM "${role}"; REVOKE DELETE ON ai_operation,ai_operation_attempt FROM "${role}"`,
		);
		await fixture.query(
			`GRANT EXECUTE ON FUNCTION master_cv_ai_queue_owners(),master_cv_ai_admit_budget(text,bigint,bigint),master_cv_ai_reconcile_budget(text) TO "${role}"`,
		);
		await fixture.query(
			`INSERT INTO "user"(id,name,email,username,display_username) VALUES ('alice','Alice','alice@example.test','alice','alice'),('bob','Bob','bob@example.test','bob','bob')`,
		);
		url.username = role;
		url.password = suffix;
		runtime = new Pool({ connectionString: url.toString(), max: 8 });
	}, 30_000);
	afterAll(async () => {
		await runtime?.end();
		await fixture?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
			await admin.query(`DROP ROLE IF EXISTS "${role}"`);
			await admin.end();
		}
	});
	return { run: <T>(work: () => T) => withDatabasePool(runtime, work), admin: () => fixture };
}
