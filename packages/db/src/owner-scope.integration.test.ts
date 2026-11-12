import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { db, withDatabasePool } from "./client";
import { assertRuntimeDatabaseRole, withDatabaseOwner, withOwnerDatabase } from "./owner-scope";
import { resume } from "./schema";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("owner database scope", () => {
	const suffix = randomUUID().replaceAll("-", "");
	const databaseName = `t003_rls_${suffix}`;
	const role = `t003_runtime_${suffix}`;
	const schemaOwner = `t003_migrator_${suffix}`;
	let admin: Pool;
	let fixture: Pool;
	let runtime: Pool;
	let databaseOwner: string;
	beforeAll(async () => {
		const databaseUrl = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!databaseUrl) throw new Error("Disposable database admin connection required");
		const url = new URL(databaseUrl);
		databaseOwner = schemaOwner;
		admin = new Pool({ connectionString: url.toString() });
		await admin.query(`CREATE ROLE "${schemaOwner}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
		await admin.query(`CREATE DATABASE "${databaseName}" OWNER "${schemaOwner}"`);
		url.pathname = `/${databaseName}`;
		fixture = new Pool({ connectionString: url.toString() });
		const migrator = await fixture.connect();
		try {
			await migrator.query(`SET ROLE "${schemaOwner}"`);
			await migrate(drizzle({ client: migrator }), {
				migrationsFolder: fileURLToPath(new URL("../../../migrations", import.meta.url)),
			});
		} finally {
			await migrator.query("RESET ROLE");
			migrator.release();
		}
		await fixture.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${suffix}' NOSUPERUSER NOBYPASSRLS NOINHERIT`);
		await fixture.query(
			`GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
		);
		await fixture.query(`REVOKE UPDATE,DELETE ON career_fact_revision FROM "${role}"`);
		await fixture.query(`REVOKE UPDATE,DELETE,TRUNCATE ON ai_usage_ledger FROM "${role}"`);
		await fixture.query(`REVOKE ALL ON ai_platform_budget FROM "${role}"`);
		await fixture.query(
			`INSERT INTO "user" (id,name,email,username,display_username) VALUES ('alice','Alice','alice@example.test','alice','alice'),('bob','Bob','bob@example.test','bob','bob')`,
		);
		await fixture.query(
			`INSERT INTO resume (id,user_id,name,slug,data) VALUES ('alice-resume','alice','Alice','a','{}'),('bob-resume','bob','Bob','b','{}')`,
		);
		url.username = role;
		url.password = suffix;
		runtime = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 2000 });
	}, 30_000);
	afterAll(async () => {
		await runtime?.end();
		await fixture?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
			await admin.query(`DROP ROLE IF EXISTS "${role}"`);
			await admin.query(`DROP ROLE IF EXISTS "${schemaOwner}"`);
			await admin.end();
		}
	});

	it.each([
		["ai_usage_ledger", "UPDATE", "units"],
		["ai_platform_budget", "SELECT", "spent_micros"],
		["ai_platform_budget", "INSERT", "spent_micros"],
		["ai_platform_budget", "UPDATE", "spent_micros"],
	])("rejects column-only %s %s privileges at startup", async (table, privilege, column) => {
		await expect(assertRuntimeDatabaseRole(runtime)).resolves.toBeUndefined();
		await fixture.query(`GRANT ${privilege} (${column}) ON ${table} TO "${role}"`);
		try {
			await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("Unsafe runtime database role");
		} finally {
			await fixture.query(`REVOKE ${privilege} (${column}) ON ${table} FROM "${role}"`);
		}
	});

	it("deletes an owner with a bound thread and accounts for attempts without app.user_id", async () => {
		const connection = await fixture.connect();
		try {
			await connection.query(`SET ROLE "${schemaOwner}"`);
			await connection.query("SELECT set_config('app.user_id','deleting',false)");
			await connection.query(
				`INSERT INTO "user"(id,name,email,username,display_username) VALUES ('deleting','Deleting','deleting@example.test','deleting','deleting')`,
			);
			await connection.query(
				`INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency,active,reserved_micros) VALUES ('deletion-budget','synthetic','1',current_date,100000,10000,2,1,10000)`,
			);
			await connection.query(
				`INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version,budget_id,reserved_micros) VALUES ('deleting-op','deleting','req','fp','review','[]','{}','1','1','1','deletion-budget',10000)`,
			);
			await connection.query(
				`INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id,cost_micros,finished_at) VALUES ('deleting-attempt','deleting','deleting-op',1,'generate',700,now())`,
			);
			await connection.query(
				`INSERT INTO agent_threads(id,user_id,title,active_operation_id) VALUES ('deleting-thread','deleting','Synthetic','deleting-op')`,
			);
			await connection.query("RESET app.user_id");
			await connection.query(`DELETE FROM "user" WHERE id='deleting'`);
		} finally {
			await connection.query("RESET app.user_id");
			await connection.query("RESET ROLE");
			connection.release();
		}
		expect((await fixture.query("SELECT id FROM agent_threads WHERE id='deleting-thread'")).rows).toEqual([]);
		expect((await fixture.query("SELECT id FROM ai_operation WHERE id='deleting-op'")).rows).toEqual([]);
		expect(
			(
				await fixture.query(
					"SELECT active,reserved_micros::int,spent_micros::int FROM ai_platform_budget WHERE id='deletion-budget'",
				)
			).rows,
		).toEqual([{ active: 0, reserved_micros: 0, spent_micros: 700 }]);
	});

	it("denies missing/foreign owners and permits the authenticated owner's reads and writes", async () => {
		await withDatabasePool(runtime, async () => {
			expect(await db.select({ id: resume.id }).from(resume)).toEqual([]);
			expect(await withOwnerDatabase("alice", (tx) => tx.select({ id: resume.id }).from(resume))).toEqual([
				{ id: "alice-resume" },
			]);
			await withOwnerDatabase("alice", async (tx) => {
				expect((await tx.execute(sql`UPDATE resume SET name='Intruder' WHERE id='bob-resume'`)).rowCount).toBe(0);
				expect((await tx.execute(sql`DELETE FROM resume WHERE id='bob-resume'`)).rowCount).toBe(0);
			});
			await expect(
				withOwnerDatabase("alice", (tx) =>
					tx.execute(sql`INSERT INTO resume (id,user_id,name,slug,data) VALUES ('forged','bob','Forged','f','{}')`),
				),
			).rejects.toThrow();
			await withOwnerDatabase("alice", (tx) => tx.execute(sql`UPDATE resume SET name='Saved' WHERE id='alice-resume'`));
		});
		expect((await fixture.query(`SELECT name FROM resume WHERE id='alice-resume'`)).rows).toEqual([{ name: "Saved" }]);
	});

	it("isolates AI operations and forbids rewriting usage history or foreign attempts", async () => {
		await fixture.query(
			`INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version) VALUES ('op-alice','alice','req','fp','review','[]','{}','1','1','1')`,
		);
		expect((await runtime.query("SELECT id FROM ai_operation")).rows).toEqual([]);
		await withDatabasePool(runtime, () =>
			withOwnerDatabase("bob", async (tx) => {
				expect((await tx.execute(sql`SELECT id FROM ai_operation`)).rows).toEqual([]);
				await expect(
					tx.execute(
						sql`INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id) VALUES ('forged','bob','op-alice',1,'step')`,
					),
				).rejects.toThrow();
			}),
		);
		await withDatabasePool(runtime, () =>
			withOwnerDatabase("alice", async (tx) => {
				await tx.execute(
					sql`INSERT INTO ai_usage_ledger(id,user_id,operation_id,kind) VALUES ('reserve-alice','alice','op-alice','reserve')`,
				);
			}),
		);
		for (const mutation of [
			"UPDATE ai_usage_ledger SET units=1",
			"DELETE FROM ai_usage_ledger",
			"TRUNCATE ai_usage_ledger",
		])
			await expect(runtime.query(mutation)).rejects.toMatchObject({ code: "42501" });
	});

	it("clears identity after rollback and reuses a single connection for nested same-owner transactions", async () => {
		await withDatabasePool(runtime, async () => {
			await expect(
				withOwnerDatabase("alice", async () => {
					throw new Error("rollback");
				}),
			).rejects.toThrow("rollback");
			expect(await db.select({ id: resume.id }).from(resume)).toEqual([]);
			expect(await withOwnerDatabase("bob", () => db.select({ id: resume.id }).from(resume))).toEqual([
				{ id: "bob-resume" },
			]);
			await withOwnerDatabase("alice", async () => {
				await expect(withOwnerDatabase("bob", async () => null)).rejects.toThrow("owner");
				expect(
					await withOwnerDatabase("alice", () => db.transaction((tx) => tx.select({ id: resume.id }).from(resume))),
				).toEqual([{ id: "alice-resume" }]);
			});
			expect((await runtime.query(`SELECT NULLIF(current_setting('app.user_id',true),'') AS owner`)).rows).toEqual([
				{ owner: null },
			]);
		});
	});

	it("discovers stale agents through a non-bypass schema owner without exposing their payloads", async () => {
		await fixture.query(`INSERT INTO agent_threads(id,user_id,title,active_run_id,active_run_started_at)
			VALUES ('bob-stale','bob','Private thread','stale-run',now()-interval '1 hour')`);
		await expect(runtime.query("SELECT * FROM master_cv_stale_agent_owners()")).rejects.toMatchObject({
			code: "42501",
		});
		await fixture.query(`GRANT EXECUTE ON FUNCTION master_cv_stale_agent_owners() TO "${role}"`);
		expect((await runtime.query("SELECT * FROM master_cv_stale_agent_owners()")).rows).toEqual([{ user_id: "bob" }]);
		expect((await runtime.query("SELECT id FROM agent_threads")).rows).toEqual([]);
	});

	it("scopes individual queries without holding a connection across external work", async () => {
		await withDatabasePool(runtime, () =>
			withDatabaseOwner("alice", async () => {
				expect(await db.select({ id: resume.id }).from(resume)).toEqual([{ id: "alice-resume" }]);
				expect((await runtime.query("SELECT 1 AS available")).rows).toEqual([{ available: 1 }]);
				expect(await db.transaction((tx) => tx.select({ id: resume.id }).from(resume))).toEqual([
					{ id: "alice-resume" },
				]);
			}),
		);
	});

	it("rejects privileged runtime identities even though administrators can bypass policies", async () => {
		expect((await fixture.query("SELECT count(*)::int AS count FROM resume")).rows).toEqual([{ count: 2 }]);
		await expect(assertRuntimeDatabaseRole(fixture)).rejects.toThrow("runtime");
		await expect(assertRuntimeDatabaseRole(runtime)).resolves.toBeUndefined();
		await fixture.query("ALTER TABLE career_fact DISABLE ROW LEVEL SECURITY");
		await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("runtime");
		await fixture.query("ALTER TABLE career_fact ENABLE ROW LEVEL SECURITY");
		await fixture.query(`ALTER ROLE "${role}" BYPASSRLS`);
		await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("runtime");
		await fixture.query(`ALTER ROLE "${role}" NOBYPASSRLS`);
		await fixture.query(`ALTER TABLE resume OWNER TO "${role}"`);
		await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("runtime");
		await fixture.query(`ALTER TABLE resume OWNER TO "${databaseOwner.replaceAll('"', '""')}"`);
		// Transferring ownership back removes the former owner's implicit privileges.
		await fixture.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON resume TO "${role}"`);
		await expect(assertRuntimeDatabaseRole(runtime)).resolves.toBeUndefined();
		await fixture.query(`GRANT UPDATE ON career_fact_revision TO "${role}"`);
		await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("runtime");
		await fixture.query(`REVOKE UPDATE ON career_fact_revision FROM "${role}"`);
	});

	it("rejects TRUNCATE privileges on every protected table, including inherited grants", async () => {
		const tables = await fixture.query<{ name: string }>(
			`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
			WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
		);
		expect(tables.rows.length).toBeGreaterThan(0);
		for (const { name } of tables.rows) {
			for (const grantee of [`"${role}"`, "PUBLIC"]) {
				await fixture.query(`GRANT TRUNCATE ON "${name}" TO ${grantee}`);
				try {
					await expect(assertRuntimeDatabaseRole(runtime)).rejects.toThrow("runtime");
				} finally {
					await fixture.query(`REVOKE TRUNCATE ON "${name}" FROM ${grantee}`);
				}
			}
		}
	});

	it("rejects legacy foreign-owner references during migrations by a non-bypass schema owner", async () => {
		const connection = await fixture.connect();
		await connection.query("BEGIN");
		try {
			await connection.query("ALTER TABLE cover_letter_version DISABLE TRIGGER USER");
			await connection.query(
				`INSERT INTO cover_letter(id,user_id,name,style)VALUES('legacy-letter','bob','Private','{}')`,
			);
			await connection.query(
				`INSERT INTO cover_letter_version(id,user_id,cover_letter_id,data)VALUES('legacy-foreign-version','alice','legacy-letter','{}')`,
			);
			await connection.query("ALTER TABLE cover_letter_version ENABLE TRIGGER USER");
			const triggers = await connection.query<{ name: string; table: string }>(
				`SELECT tgname AS name, tgrelid::regclass::text AS table FROM pg_trigger WHERE tgname LIKE 'owner_fk_%'`,
			);
			for (const trigger of triggers.rows)
				await connection.query(`DROP TRIGGER "${trigger.name}" ON "${trigger.table}"`);
			await connection.query(`SET LOCAL ROLE "${schemaOwner}"`);
			const folder = new URL("../../../migrations/", import.meta.url);
			const scans: string[] = [];
			for (const directory of (await readdir(folder)).sort()) {
				const migration = await readFile(new URL(`${directory}/migration.sql`, folder), "utf8");
				scans.push(
					...migration
						.split("--> statement-breakpoint")
						.filter((statement) => statement.includes("Existing foreign-owner reference requires review")),
				);
			}
			await expect(
				(async () => {
					for (const scan of scans) await connection.query(scan);
				})(),
			).rejects.toThrow("Existing foreign-owner reference requires review");
		} finally {
			await connection.query("ROLLBACK");
			connection.release();
		}
		await expect(assertRuntimeDatabaseRole(runtime)).resolves.toBeUndefined();
	});

	it("rejects foreign parent references even when the child claims the current owner", async () => {
		await fixture.query(
			`INSERT INTO career_schedule (id,user_id,kind,next_run_at) VALUES ('bob-schedule','bob','discovery',now())`,
		);
		await withDatabasePool(runtime, () =>
			withOwnerDatabase("alice", async (tx) => {
				await expect(
					tx.execute(
						sql`INSERT INTO career_job (id,user_id,schedule_id,due_at) VALUES ('forged-job','alice','bob-schedule',now())`,
					),
				).rejects.toThrow();
			}),
		);
	});

	it("limits queue discovery to granted metadata and denies a worker's foreign payload read", async () => {
		await fixture.query(`UPDATE career_schedule SET enabled=true WHERE id='bob-schedule'`);
		await fixture.query(
			`INSERT INTO career_job (id,user_id,schedule_id,due_at) VALUES ('bob-job','bob','bob-schedule',now())`,
		);
		await expect(runtime.query("SELECT * FROM master_cv_queue_owners()")).rejects.toMatchObject({ code: "42501" });
		await fixture.query(`GRANT EXECUTE ON FUNCTION master_cv_queue_owners() TO "${role}"`);
		expect((await runtime.query("SELECT * FROM master_cv_queue_owners()")).rows).toEqual([{ user_id: "bob" }]);
		await withDatabasePool(runtime, async () => {
			expect(
				(await withOwnerDatabase("alice", (tx) => tx.execute(sql`SELECT id FROM career_job WHERE id='bob-job'`))).rows,
			).toEqual([]);
			expect(
				(await withOwnerDatabase("bob", (tx) => tx.execute(sql`SELECT id FROM career_job WHERE id='bob-job'`))).rows,
			).toEqual([{ id: "bob-job" }]);
		});
	});

	it("preserves explicit transaction isolation in authenticated request scopes", async () => {
		await withDatabasePool(runtime, () =>
			withDatabaseOwner("alice", async () => {
				const result = await db.transaction((tx) => tx.execute(sql`SHOW transaction_isolation`), {
					isolationLevel: "serializable",
				});
				expect(result.rows).toEqual([{ transaction_isolation: "serializable" }]);
			}),
		);
	});
	it("isolates profiles, facts, snapshots, links, letters and version children for both owners", async () => {
		for (const owner of ["alice", "bob"]) {
			await fixture.query(`INSERT INTO career_profile(user_id,data)VALUES($1,'{}')`, [owner]);
			await fixture.query(
				`INSERT INTO career_fact(id,user_id,text,category,source,source_key)VALUES($1,$2,'Private','experience','{"kind":"manual"}',$1)`,
				[`${owner}-fact`, owner],
			);
			await fixture.query(`INSERT INTO career_fact_revision(user_id,fact_id,revision,structured)VALUES($1,$2,1,'{}')`, [
				owner,
				`${owner}-fact`,
			]);
			await fixture.query(
				`INSERT INTO resume_fact_link(user_id,resume_id,fact_id,accepted_revision)VALUES($1,$2,$3,1)`,
				[owner, `${owner}-resume`, `${owner}-fact`],
			);
			await fixture.query(`INSERT INTO cover_letter(id,user_id,name,style)VALUES($1,$2,'Private','{}')`, [
				`${owner}-letter`,
				owner,
			]);
			await fixture.query(`INSERT INTO cover_letter_version(id,user_id,cover_letter_id,data)VALUES($1,$2,$3,'{}')`, [
				`${owner}-lv`,
				owner,
				`${owner}-letter`,
			]);
			await fixture.query(`INSERT INTO resume_version(id,user_id,resume_id,data)VALUES($1,$2,$3,'{}')`, [
				`${owner}-rv`,
				owner,
				`${owner}-resume`,
			]);
		}
		await withDatabasePool(runtime, async () => {
			for (const table of [
				"career_profile",
				"career_fact",
				"career_fact_revision",
				"resume_fact_link",
				"cover_letter",
				"cover_letter_version",
				"resume_version",
			]) {
				expect((await db.execute(sql`SELECT user_id FROM ${sql.identifier(table)}`)).rows).toEqual([]);
				await withOwnerDatabase("alice", async (tx) => {
					expect((await tx.execute(sql`SELECT user_id FROM ${sql.identifier(table)}`)).rows).toEqual([
						{ user_id: "alice" },
					]);
					if (table !== "career_fact_revision") {
						expect(
							(await tx.execute(sql`UPDATE ${sql.identifier(table)} SET user_id='bob' WHERE user_id='bob'`)).rowCount,
						).toBe(0);
						expect((await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE user_id='bob'`)).rowCount).toBe(0);
					}
				});
			}
			await expect(
				withOwnerDatabase("alice", (tx) =>
					tx.execute(sql`UPDATE career_fact_revision SET removed=true WHERE user_id='alice'`),
				),
			).rejects.toThrow();
			await expect(
				withOwnerDatabase("alice", (tx) => tx.execute(sql`DELETE FROM career_fact_revision WHERE user_id='alice'`)),
			).rejects.toThrow();
			await expect(
				withOwnerDatabase("alice", (tx) =>
					tx.execute(
						sql`INSERT INTO cover_letter_version(id,user_id,cover_letter_id,data)VALUES('foreign-letter-version','alice','bob-letter','{}')`,
					),
				),
			).rejects.toMatchObject({ cause: { code: "23503", message: "Referenced record is unavailable to this owner" } });
			await expect(
				withOwnerDatabase("alice", (tx) =>
					tx.execute(
						sql`INSERT INTO resume_version(id,user_id,resume_id,data)VALUES('foreign-child','alice','bob-resume','{}')`,
					),
				),
			).rejects.toThrow();
			await expect(
				withOwnerDatabase("alice", (tx) =>
					tx.execute(
						sql`INSERT INTO resume_fact_link(user_id,resume_id,fact_id,accepted_revision)VALUES('alice','bob-resume','alice-fact',1)`,
					),
				),
			).rejects.toThrow();
		});
	});

	it("reads only explicitly shared nontrashed CVs and live redirects without granting foreign writes or history", async () => {
		await fixture.query(`INSERT INTO resume(id,user_id,name,slug,data,is_public,trashed_at) VALUES
			('shared','bob','Shared','shared','{}',true,NULL),
			('trashed-shared','bob','Trashed','trashed-shared','{}',true,now())`);
		await fixture.query(`INSERT INTO resume_slug_redirect(id,user_id,resume_id,slug,expires_at) VALUES
			('shared-old','bob','shared','old-shared',now()+interval '1 day'),
			('shared-expired','bob','shared','expired-shared',now()-interval '1 day'),
			('private-old','bob','bob-resume','old-private',now()+interval '1 day'),
			('trashed-old','bob','trashed-shared','old-trashed',now()+interval '1 day')`);
		await fixture.query(
			`INSERT INTO resume_version(id,user_id,resume_id,data)VALUES('shared-history','bob','shared','{}')`,
		);
		try {
			await withDatabasePool(runtime, async () => {
				expect((await db.execute(sql`SELECT id FROM resume ORDER BY id`)).rows).toEqual([{ id: "shared" }]);
				expect((await db.execute(sql`SELECT slug FROM resume_slug_redirect ORDER BY slug`)).rows).toEqual([
					{ slug: "old-shared" },
				]);
				await withOwnerDatabase("alice", async (tx) => {
					expect((await tx.execute(sql`SELECT id FROM resume WHERE id='shared'`)).rows).toEqual([{ id: "shared" }]);
					expect((await tx.execute(sql`UPDATE resume SET name='Intruder' WHERE id='shared'`)).rowCount).toBe(0);
					expect((await tx.execute(sql`DELETE FROM resume WHERE id='shared'`)).rowCount).toBe(0);
					expect((await tx.execute(sql`SELECT id FROM resume_version WHERE resume_id='shared'`)).rows).toEqual([]);
				});
				await expect(
					db.execute(sql`INSERT INTO resume_statistics(id,resume_id)VALUES('forged-stat','shared')`),
				).rejects.toThrow();
			});
			await fixture.query(`UPDATE resume SET is_public=false WHERE id='shared'`);
			await withDatabasePool(runtime, async () => {
				expect((await db.execute(sql`SELECT id FROM resume`)).rows).toEqual([]);
				expect((await db.execute(sql`SELECT slug FROM resume_slug_redirect`)).rows).toEqual([]);
			});
		} finally {
			await fixture.query(`DELETE FROM resume WHERE id IN ('shared','trashed-shared')`);
			await fixture.query(`DELETE FROM resume_slug_redirect WHERE id='private-old'`);
		}
	});
});
