import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRuntime } from "./testing/runtime";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("review operation regressions", () => {
	const database = aiTestDatabase();
	beforeAll(async () => {
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
			);
	});
	async function prepare(owner: string) {
		await database
			.admin()
			.query(`INSERT INTO "user"(id,name,email,username,display_username) VALUES ($1,$1,$1||'@example.test',$1,$1)`, [
				owner,
			]);
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ($1,$1,'Synthetic','cv','{}')", [owner]);
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose) VALUES ($1,$1,'synthetic','1','1','review')",
				[owner],
			);
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [owner])
		).rows[0].updated_at.toISOString();
		return {
			requestKey: owner,
			kind: "review",
			sources: [{ kind: "resume" as const, id: owner, revision }],
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
			parameters: {},
		};
	}
	it("starts the execution deadline at first claim after queue wait", async () => {
		const owner = "queued";
		const request = await prepare(owner);
		vi.setSystemTime(Date.now() - 180000);
		const operation = await database.run(() =>
			withAiRuntime(syntheticRuntime, () => operationService.start(owner, request)),
		);
		vi.useRealTimers();
		try {
			await database.run(() => withAiRuntime(syntheticRuntime, () => runAiOperations()));
			expect(await database.run(() => operationService.get(owner, operation.id))).toMatchObject({
				state: "waiting_review",
			});
		} finally {
			vi.useRealTimers();
		}
	});
	it("releases reservations after definitive provider rejection and admits another operation", async () => {
		const request = await prepare("rejected");
		const runtime = {
			...syntheticRuntime,
			fetch: async () =>
				new Response('{"error":{"message":"Unavailable"}}', {
					status: 503,
					headers: { "content-type": "application/json" },
				}),
		};
		await database.run(() =>
			withAiRuntime(runtime, async () => {
				const operation = await operationService.start("rejected", request);
				await runAiOperations();
				expect(await operationService.get("rejected", operation.id)).toMatchObject({ state: "failed" });
			}),
		);
		expect(
			(await database.admin().query("SELECT reserved_micros::int FROM ai_platform_budget WHERE id='budget'")).rows,
		).toEqual([{ reserved_micros: 0 }]);
		expect(
			await database.run(() =>
				withAiRuntime(syntheticRuntime, () => operationService.start("rejected", { ...request, requestKey: "retry" })),
			),
		).toMatchObject({ state: "queued" });
		const retryId = (await database.admin().query("SELECT id FROM ai_operation WHERE request_key='retry'")).rows[0].id;
		await database.run(() => operationService.cancel("rejected", retryId));
	});
	it("bounds unknown reservation retention, conservatively books liability and corrects late evidence once", async () => {
		await prepare("ambiguous");
		const admin = database.admin();
		await admin.query(
			`INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version,state,deadline_at,budget_id,reserved_micros,budget_closed) VALUES ('aged','ambiguous','aged','fp','review','[]','{"routeId":"synthetic","routeRevision":"1","configRevision":"1"}','1','1','1','failed',now()-interval '6 minutes','budget',10000,true)`,
		);
		await admin.query(
			"INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id) VALUES ('unfinished','ambiguous','aged',1,'generate')",
		);
		await admin.query("UPDATE ai_platform_budget SET reserved_micros=reserved_micros+10000 WHERE id='budget'");
		await database.run(() => withAiRuntime(syntheticRuntime, () => runAiOperations()));
		expect(
			(await admin.query("SELECT reserved_micros::int,actual_micros FROM ai_operation WHERE id='aged'")).rows,
		).toEqual([{ reserved_micros: 0, actual_micros: null }]);
		const booked = (await admin.query("SELECT spent_micros::int AS spent FROM ai_platform_budget WHERE id='budget'"))
			.rows[0].spent;
		await admin.query(
			"UPDATE ai_operation_attempt SET cost_micros=10,finished_at=now(),outcome='valid' WHERE id='unfinished'",
		);
		for (let i = 0; i < 2; i++)
			await database.run(() =>
				withOwnerDatabase("ambiguous", (tx) => tx.execute(sql`SELECT master_cv_ai_reconcile_budget('aged')`)),
			);
		expect(
			(await admin.query("SELECT spent_micros::int AS spent FROM ai_platform_budget WHERE id='budget'")).rows[0].spent,
		).toBe(booked - 9990);
	});
});
