import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withDatabasePool } from "@reactive-resume/db/client";
import { provisionRuntimeRole } from "@reactive-resume/db/runtime-role";

/** Each suite owns its database and restricted runtime; no ambient configuration. */
export function privacyTestDatabase(options: { restrictedMigrationOwner?: boolean } = {}) {
	const suffix = randomUUID().replaceAll("-", "");
	const name = `privacy_${suffix}`;
	const role = `privacy_runtime_${suffix}`;
	let admin: Pool;
	let fixture: Pool;
	let runtime: Pool;
	const migrationRole = `privacy_migrator_${suffix}`;
	const actors: { pool: Pool; role: string }[] = [];
	beforeAll(async () => {
		const connectionString = process.env.INTEGRATIONS_TEST_DATABASE_URL;
		if (!connectionString) throw new Error("Disposable database admin connection required");
		const url = new URL(connectionString);
		if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55432" || url.search)
			throw new Error("Designated local synthetic database required");
		admin = new Pool({ connectionString });
		await admin.query(`CREATE DATABASE "${name}"`);
		url.pathname = `/${name}`;
		fixture = new Pool({ connectionString: url.toString() });
		let migrator = fixture;
		if (options.restrictedMigrationOwner) {
			await admin.query(
				`CREATE ROLE "${migrationRole}" LOGIN PASSWORD 'synthetic-migration-password' NOSUPERUSER NOBYPASSRLS`,
			);
			await admin.query(`ALTER DATABASE "${name}" OWNER TO "${migrationRole}"`);
			const migrationUrl = new URL(url);
			migrationUrl.username = migrationRole;
			migrationUrl.password = "synthetic-migration-password";
			migrator = new Pool({ connectionString: migrationUrl.toString() });
		}
		await migrate(drizzle({ client: migrator }), {
			migrationsFolder: fileURLToPath(new URL("../../../../../../migrations", import.meta.url)),
		});
		if (migrator !== fixture) await migrator.end();
		// Same production provisioning helper, including append-only privilege restrictions.
		runtime = new Pool({ connectionString: await provisionRuntimeRole(url.toString(), role), max: 8 });
		await fixture.query(
			`INSERT INTO "user"(id,name,email,username,display_username) VALUES ('alice','Alice','alice@example.test','alice','alice'),('bob','Bob','bob@example.test','bob','bob')`,
		);
	}, 60_000);
	afterAll(async () => {
		for (const actor of actors) await actor.pool.end();
		await runtime?.end();
		await fixture?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
			await admin.query(`DROP ROLE IF EXISTS "${role}"`);
			for (const actor of actors) await admin.query(`DROP ROLE "${actor.role}"`);
			if (options.restrictedMigrationOwner) await admin.query(`DROP ROLE "${migrationRole}"`);
			await admin.end();
		}
	});
	return {
		actor: async (grants: string[]) => {
			const actorRole = `privacy_actor_${randomUUID().replaceAll("-", "")}`;
			await fixture.query(`CREATE ROLE "${actorRole}" LOGIN PASSWORD 'synthetic-operator-password'`);
			await fixture.query(`GRANT CONNECT ON DATABASE "${name}" TO "${actorRole}"`);
			await fixture.query(`GRANT USAGE ON SCHEMA public TO "${actorRole}"`);
			for (const grant of grants) await fixture.query(`GRANT EXECUTE ON FUNCTION ${grant} TO "${actorRole}"`);
			const connection = fixture.options.connectionString;
			if (!connection) throw new Error("Fixture connection unavailable");
			const url = new URL(connection);
			url.username = actorRole;
			url.password = "synthetic-operator-password";
			const pool = new Pool({ connectionString: url.toString() });
			actors.push({ pool, role: actorRole });
			return { role: actorRole, run: <T>(work: () => T) => withDatabasePool(pool, work), pool };
		},
		run: <T>(work: () => T) => withDatabasePool(runtime, work),
		admin: () => fixture,
		runtime: () => runtime,
		queryAs: async (userId: string, text: string, values: unknown[] = []) => {
			const client = await runtime.connect();
			try {
				await client.query("BEGIN");
				await client.query("SELECT set_config('app.user_id',$1,true)", [userId]);
				const result = await client.query(text, values);
				await client.query("COMMIT");
				return result;
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			} finally {
				client.release();
			}
		},
	};
}
