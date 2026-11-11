import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("T005 existing runtime migration", () => {
	it("upgrades an existing append-only runtime role without permitting ledger rewrites or budget access", async () => {
		const connection = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!connection) throw new Error("Disposable local database required");
		const suffix = randomUUID().replaceAll("-", "");
		const name = `t005_migration_${suffix}`;
		const role = `t005_legacy_${suffix}`;
		const admin = new Pool({ connectionString: connection });
		const migrations = fileURLToPath(new URL("../../../migrations", import.meta.url));
		const baseline = await mkdtemp(path.join(tmpdir(), "t005-migration-"));
		await admin.query(`CREATE DATABASE "${name}"`);
		const url = new URL(connection);
		url.pathname = `/${name}`;
		const pool = new Pool({ connectionString: url.toString(), max: 1 });
		try {
			for (const directory of await readdir(migrations))
				if (directory < "20261111193937_t005_ai_runtime")
					await symlink(path.join(migrations, directory), path.join(baseline, directory));
			const db = drizzle({ client: pool });
			await migrate(db, { migrationsFolder: baseline });
			await pool.query(
				`CREATE ROLE "${role}" NOSUPERUSER NOBYPASSRLS NOINHERIT; GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"; REVOKE UPDATE,DELETE ON career_fact_revision FROM "${role}"; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${role}"`,
			);
			await migrate(db, { migrationsFolder: migrations });
			const rights = await pool.query(
				"SELECT has_table_privilege($1,'ai_usage_ledger','SELECT') AS read,has_table_privilege($1,'ai_usage_ledger','INSERT') AS append,has_table_privilege($1,'ai_usage_ledger','UPDATE') AS update,has_table_privilege($1,'ai_usage_ledger','DELETE') AS delete,has_table_privilege($1,'ai_usage_ledger','TRUNCATE') AS truncate,has_table_privilege($1,'ai_platform_budget','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS budget,has_function_privilege($1,'master_cv_ai_admit_budget(text,bigint,bigint)','EXECUTE') AS admission",
				[role],
			);
			expect(rights.rows).toEqual([
				{ read: true, append: true, update: false, delete: false, truncate: false, budget: false, admission: true },
			]);
			expect((await pool.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1", [role])).rows).toEqual([
				{ rolsuper: false, rolbypassrls: false },
			]);
		} finally {
			await pool.end();
			await admin.query(`DROP DATABASE "${name}"`);
			await admin.query(`DROP ROLE IF EXISTS "${role}"`);
			await admin.end();
			await rm(baseline, { recursive: true, force: true });
		}
	});
});
