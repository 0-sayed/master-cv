import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

it("keeps exact job revisions immutable and enforces owner-compatible selection/provenance under RLS", async () => {
	const connection = process.env.COVER_LETTER_TEST_DATABASE_URL;
	if (!connection) throw new Error("Disposable database required; job ownership tests must not skip");
	const url = new URL(connection);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host"))
		throw new Error("Expected disposable Postgres");
	const suffix = randomUUID().replaceAll("-", "");
	const database = `job_variants_${suffix}`;
	const role = `job_variants_runtime_${suffix}`;
	const admin = new Pool({ connectionString: connection });
	await admin.query(`CREATE DATABASE "${database}"`);
	url.pathname = `/${database}`;
	const pool = new Pool({ connectionString: url.toString(), max: 1 });
	try {
		await migrate(drizzle({ client: pool }), {
			migrationsFolder: fileURLToPath(new URL("../../../migrations", import.meta.url)),
		});
		await pool.query(
			`CREATE ROLE "${role}" NOSUPERUSER NOBYPASSRLS NOINHERIT; GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
		);
		await pool.query(
			`INSERT INTO "user" (id,name,email,username,display_username) VALUES ('alice','Alice','alice@example.test','alice','alice'),('bob','Bob','bob@example.test','bob','bob')`,
		);
		await pool.query(
			`INSERT INTO resume (id,user_id,name,slug,data) VALUES ('a','alice','CV','a','{}'),('b','bob','CV','b','{}')`,
		);
		const asOwner = async (query: string, parameters: unknown[] = [], owner = "alice") => {
			await pool.query("BEGIN");
			try {
				await pool.query(`SET LOCAL ROLE "${role}"`);
				await pool.query("SELECT set_config('app.user_id',$1,true)", [owner]);
				const result = await pool.query(query, parameters);
				await pool.query("COMMIT");
				return result;
			} catch (error) {
				await pool.query("ROLLBACK");
				throw error;
			}
		};
		expect((await asOwner("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows).toEqual([
			{ rolsuper: false, rolbypassrls: false },
		]);
		await asOwner("INSERT INTO job_target (id,user_id) VALUES ('job','alice')");
		const text = " \r\n React و SAP  ";
		await asOwner(
			"INSERT INTO job_target_revision (user_id,job_id,revision,role,employer,text,digest) VALUES ('alice','job','r1','Engineer','', $1,'hash')",
			[text],
		);
		expect((await asOwner("SELECT text FROM job_target_revision")).rows).toEqual([{ text }]);
		expect((await asOwner("SELECT text FROM job_target_revision", [], "bob")).rows).toEqual([]);
		expect((await asOwner("UPDATE job_target_revision SET text='changed' WHERE job_id='job'")).rowCount).toBe(0);
		await expect(
			asOwner(
				"INSERT INTO job_target_revision (user_id,job_id,revision,role,employer,text,digest) VALUES ('alice','job','r1','Engineer','','duplicate','hash')",
			),
		).rejects.toMatchObject({ code: "23505" });
		await expect(asOwner("INSERT INTO job_target (id,user_id) VALUES ('foreign','bob')")).rejects.toMatchObject({
			code: "42501",
		});
		await expect(
			asOwner(
				"INSERT INTO resume_job_selection (user_id,resume_id,job_id,job_revision) VALUES ('alice','b','job','r1')",
			),
		).rejects.toMatchObject({ code: "23503" });
		await expect(
			asOwner(
				"INSERT INTO resume_job_selection (user_id,resume_id,job_id,job_revision) VALUES ('bob','b','job','r1')",
				[],
				"bob",
			),
		).rejects.toMatchObject({ code: "23503" });
		await asOwner(
			"INSERT INTO resume_job_selection (user_id,resume_id,job_id,job_revision) VALUES ('alice','a','job','r1')",
		);
		expect(
			(await asOwner("UPDATE resume_job_selection SET job_revision='foreign' WHERE resume_id='a'", [], "bob")).rowCount,
		).toBe(0);
		await expect(
			asOwner(
				"INSERT INTO resume_variant_source (user_id,resume_id,source_resume_id,source_revision,request_key,request_hash) VALUES ('alice','a','b','source','key','hash')",
			),
		).rejects.toMatchObject({ code: "23503" });
		await asOwner("DELETE FROM job_target WHERE id='job'");
		expect((await asOwner("SELECT * FROM job_target_revision")).rows).toEqual([]);
		expect((await asOwner("SELECT * FROM resume_job_selection")).rows).toEqual([]);
		expect((await asOwner("SELECT id FROM resume")).rows).toEqual([{ id: "a" }]);
	} finally {
		await pool.end();
		await admin.query(`DROP DATABASE "${database}"`);
		await admin.query(`DROP ROLE IF EXISTS "${role}"`);
		await admin.end();
	}
}, 30000);
