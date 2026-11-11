import { beforeAll, describe, expect, it } from "vite-plus/test";
import { runAiOperations } from "../ai/operation-worker";
import { withAiRuntime } from "../ai/route-policy";
import { aiTestDatabase } from "../ai/testing/database";
import { syntheticRuntime } from "../ai/testing/runtime";
import { assistantOperations } from "./operations";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("assistant operation compatibility", () => {
	const database = aiTestDatabase();
	const run = <T>(work: () => T) => database.run(() => withAiRuntime(syntheticRuntime, work));
	let revision: string;
	beforeAll(async () => {
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv','alice','Synthetic','cv','{}')");
		revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv'")
		).rows[0].updated_at.toISOString();
		await database
			.admin()
			.query(
				"INSERT INTO ai_providers(id,user_id,label,provider,model,encrypted_api_key,api_key_salt,api_key_hash,api_key_preview,enabled,test_status,config_revision) VALUES ('provider','alice','Synthetic','openai-compatible','synthetic','encrypted','salt','hash','preview',true,'success','1')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO agent_threads(id,user_id,title,ai_provider_id,working_resume_id) VALUES ('thread','alice','Synthetic','provider','cv')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose) VALUES ('consent','alice','synthetic','1','1','review')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
			);
	});
	const request = (requestKey: string) => ({
		requestKey,
		kind: "review",
		sources: [{ kind: "resume" as const, id: "cv", revision }],
		route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
		parameters: {},
	});
	it("links existing threads atomically and returns persisted status/results without Redis", async () => {
		const operation = await run(() => assistantOperations.start("alice", "thread", request("assistant")));
		expect(await run(() => assistantOperations.status("alice", "thread"))).toMatchObject({
			capability: "unsupported",
			operation,
		});
		await expect(run(() => assistantOperations.status("bob", "thread"))).rejects.toMatchObject({ code: "NOT_FOUND" });
		await run(() => runAiOperations());
		expect(await run(() => assistantOperations.status("alice", "thread"))).toMatchObject({
			capability: "completed",
			operation: { state: "waiting_review", resultId: operation.id },
		});
		expect(await run(() => assistantOperations.result("alice", "thread"))).toEqual({ text: "Synthetic review" });
		const messages = await database.admin().query("SELECT ui_message FROM agent_messages WHERE thread_id='thread'");
		expect(messages.rows).toEqual([
			{ ui_message: { id: operation.id, role: "assistant", parts: [{ type: "text", text: "Synthetic review" }] } },
		]);
		expect(await run(() => assistantOperations.stop("alice", "thread"))).toMatchObject({ state: "waiting_review" });
	});
	it("confirms queued cancellation and rejects revised providers without orphan reservations", async () => {
		await run(() => assistantOperations.start("alice", "thread", request("cancel")));
		expect(await run(() => assistantOperations.stop("alice", "thread"))).toMatchObject({ state: "cancelled" });
		await database.admin().query("UPDATE ai_providers SET config_revision='2' WHERE id='provider'");
		await expect(
			run(() => assistantOperations.start("alice", "thread", request("changed-provider"))),
		).rejects.toMatchObject({ data: { reason: "AI_PROVIDER_CHANGED" } });
		expect(
			(
				await database
					.admin()
					.query("SELECT count(*)::int AS count FROM ai_operation WHERE request_key='changed-provider'")
			).rows[0].count,
		).toBe(0);
	});
});
