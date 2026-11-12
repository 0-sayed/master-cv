import { describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiTestDatabase } from "./testing/database";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("review budget regressions", () => {
	const database = aiTestDatabase();
	it("deleting two admitted owners frees global slots for a third owner", async () => {
		const admin = database.admin();
		await admin.query(
			`INSERT INTO "user"(id,name,email,username,display_username) VALUES ('carol','Carol','carol@example.test','carol','carol')`,
		);
		await admin.query(
			`INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)`,
		);
		for (const owner of ["alice", "bob", "carol"]) {
			await admin.query(
				`INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version) VALUES ($1,$1,$1,'fp','review','[]','{"routeId":"synthetic","routeRevision":"1"}','1','1','1')`,
				[owner],
			);
		}
		const admit = (owner: string) =>
			database.run(() =>
				withOwnerDatabase(
					owner,
					async (tx) =>
						(
							await tx.execute<{ admitted: boolean }>(
								sql`SELECT master_cv_ai_admit_budget(${owner},10000,100000) AS admitted`,
							)
						).rows[0]?.admitted,
				),
			);
		expect(await admit("alice")).toBe(true);
		expect(await admit("bob")).toBe(true);
		expect(await admit("carol")).toBe(false);
		await admin.query(`DELETE FROM "user" WHERE id IN ('alice','bob')`);
		expect(await admit("carol")).toBe(true);
		expect(
			(await admin.query(`SELECT active,reserved_micros::int FROM ai_platform_budget WHERE id='budget'`)).rows,
		).toEqual([{ active: 1, reserved_micros: 10000 }]);
	});
	it("rejects runtime accounting rewrites and cannot erase another owner's reservation", async () => {
		for (const assignment of ["budget_id=NULL", "reserved_micros=0", "actual_micros=0", "budget_closed=true"]) {
			await expect(
				database.run(() =>
					withOwnerDatabase("carol", (tx) =>
						tx.execute(sql.raw(`UPDATE ai_operation SET ${assignment} WHERE id='carol'`)),
					),
				),
			).rejects.toThrow();
		}
		await database
			.admin()
			.query(
				`INSERT INTO "user"(id,name,email,username,display_username) VALUES ('intruder','Intruder','intruder@example.test','intruder','intruder')`,
			);
		expect(
			(
				await database.run(() =>
					withOwnerDatabase("intruder", (tx) =>
						tx.execute(sql`UPDATE ai_operation SET reserved_micros=0 WHERE id='carol' RETURNING id`),
					),
				)
			).rows,
		).toEqual([]);
		await database.run(() =>
			withOwnerDatabase("intruder", (tx) => tx.execute(sql`SELECT master_cv_ai_reconcile_budget('carol')`)),
		);
		expect(
			(await database.admin().query("SELECT reserved_micros::int FROM ai_platform_budget WHERE id='budget'")).rows,
		).toEqual([{ reserved_micros: 10000 }]);
	});
	it("rejects attaching the privileged deletion trigger to a forged runtime table", async () => {
		await expect(
			database.run(() =>
				withOwnerDatabase("intruder", async (tx) => {
					await tx.execute(sql`CREATE TEMP TABLE forged_deletion(id text)`);
					await tx.execute(
						sql`CREATE TRIGGER forged_deletion BEFORE DELETE ON forged_deletion FOR EACH ROW EXECUTE FUNCTION master_cv_ai_delete_owner()`,
					);
				}),
			),
		).rejects.toThrow();
	});

	it("derives settlement from immutable completed attempts rather than supplied actual cost", async () => {
		await database.admin().query("UPDATE ai_operation SET state='running',actual_micros=0 WHERE id='carol'");
		await database
			.admin()
			.query(
				"INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id,cost_micros,finished_at) VALUES ('cost','carol','carol',1,'generate',700,now())",
			);
		await database.admin().query("UPDATE ai_operation SET state='failed' WHERE id='carol'");
		await database.run(() =>
			withOwnerDatabase("carol", (tx) => tx.execute(sql`SELECT master_cv_ai_reconcile_budget('carol')`)),
		);
		expect(
			(
				await database
					.admin()
					.query("SELECT actual_micros::int,reserved_micros::int,budget_closed FROM ai_operation WHERE id='carol'")
			).rows,
		).toEqual([{ actual_micros: 700, reserved_micros: 0, budget_closed: true }]);
	});

	it("ignores historical and orphaned counters when counting current live admission", async () => {
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency,active) VALUES ('yesterday','synthetic','1',(now() AT TIME ZONE 'UTC')::date-1,100000,10000,2,2)",
			);
		await database.admin().query("UPDATE ai_platform_budget SET active=2 WHERE id='budget'");
		await database
			.admin()
			.query(
				`INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version) VALUES ('fresh','carol','fresh','fp','review','[]','{"routeId":"synthetic","routeRevision":"1"}','1','1','1')`,
			);
		expect(
			(
				await database.run(() =>
					withOwnerDatabase("carol", (tx) =>
						tx.execute(sql`SELECT master_cv_ai_admit_budget('fresh',10000,100000) AS admitted`),
					),
				)
			).rows,
		).toEqual([{ admitted: true }]);
	});
});
