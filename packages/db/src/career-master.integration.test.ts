import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = fileURLToPath(new URL("../../../migrations", import.meta.url));
const beforeT003 = "20261108115423_chemical_nextwave";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("career master migration", () => {
	it("preserves legacy facts/preferences and independent CVs while enforcing owner-compatible links", async () => {
		const databaseUrl = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!databaseUrl) throw new Error("A disposable database admin connection is required");
		const admin = new Pool({ connectionString: databaseUrl });
		const name = `t003_migration_${randomUUID().replaceAll("-", "")}`;
		const baseline = await mkdtemp(path.join(tmpdir(), "t003-baseline-"));
		await admin.query(`CREATE DATABASE "${name}"`);
		const url = new URL(databaseUrl);
		url.pathname = `/${name}`;
		const pool = new Pool({ connectionString: url.toString(), max: 1 });
		const db = drizzle({ client: pool });
		try {
			for (const migration of await readdir(migrationsFolder)) {
				if (migration <= beforeT003)
					await symlink(path.join(migrationsFolder, migration), path.join(baseline, migration));
			}
			await migrate(db, { migrationsFolder: baseline });
			await pool.query(`INSERT INTO "user" (id,name,email,username,display_username) VALUES
				('alice','Alice','alice@example.test','alice','alice'),('bob','Bob','bob@example.test','bob','bob')`);
			const preferences = { targetRoles: ["مهندس"], priorities: "Keep original", memoryMode: "off" };
			const source = { kind: "manual", id: "original", quote: "خبرة" };
			const revisions = [{ text: "Original text", at: "2026-01-01T00:00:00Z" }];
			await pool.query(`INSERT INTO career_profile (user_id,data) VALUES ('alice',$1)`, [preferences]);
			await pool.query(
				`INSERT INTO career_fact (id,user_id,text,category,source,source_key,revisions) VALUES ('fact','alice','خبرة','experience',$1,'stable-key',$2)`,
				[source, JSON.stringify(revisions)],
			);
			await pool.query(
				`INSERT INTO resume (id,user_id,name,slug,data) VALUES ('a','alice','Arabic','a','{"original":"العربية"}'),('b','bob','English','b','{"original":"English"}')`,
			);
			await migrate(db, { migrationsFolder });
			expect(
				(await pool.query(`SELECT data,profile_revision,section_order,welcome_completed_at FROM career_profile`)).rows,
			).toEqual([{ data: preferences, profile_revision: 0, section_order: [], welcome_completed_at: null }]);
			expect(
				(
					await pool.query(
						`SELECT id,text,source,source_key,revisions,structured,proposed_structured,confirmation,revision,draft_revision FROM career_fact`,
					)
				).rows,
			).toEqual([
				{
					id: "fact",
					text: "خبرة",
					source,
					source_key: "stable-key",
					revisions,
					structured: null,
					proposed_structured: null,
					confirmation: "pending",
					revision: 1,
					draft_revision: 0,
				},
			]);
			expect(
				(await pool.query(`SELECT id,COALESCE(base_resume_id,id) AS base,variant_kind,data FROM resume ORDER BY id`))
					.rows,
			).toEqual([
				{ id: "a", base: "a", variant_kind: "base", data: { original: "العربية" } },
				{ id: "b", base: "b", variant_kind: "base", data: { original: "English" } },
			]);
			await expect(
				pool.query(`UPDATE resume SET base_resume_id='b',variant_kind='language' WHERE id='a'`),
			).rejects.toMatchObject({ code: "23503" });
			await expect(
				pool.query(
					`INSERT INTO resume_fact_link (user_id,resume_id,fact_id,accepted_revision) VALUES ('bob','b','fact',1)`,
				),
			).rejects.toMatchObject({ code: "23503" });
			await expect(pool.query(`UPDATE career_fact SET revision=0 WHERE id='fact'`)).rejects.toMatchObject({
				code: "23514",
			});
			await expect(pool.query(`UPDATE career_fact SET draft_revision=-1 WHERE id='fact'`)).rejects.toMatchObject({
				code: "23514",
			});
			await pool.query("BEGIN");
			await pool.query(`UPDATE career_profile SET profile_revision=1 WHERE user_id='alice'`);
			await pool.query("ROLLBACK");
			expect((await pool.query(`SELECT profile_revision FROM career_profile`)).rows).toEqual([{ profile_revision: 0 }]);
			await migrate(db, { migrationsFolder });
			expect((await pool.query(`SELECT count(*)::int AS count FROM career_fact`)).rows).toEqual([{ count: 1 }]);
		} finally {
			await pool.end();
			await admin.query(`DROP DATABASE "${name}"`);
			await admin.end();
			await rm(baseline, { recursive: true, force: true });
		}
	}, 30_000);
});
