import { expect, it } from "vite-plus/test";
import { privacyTestDatabase } from "../privacy/testing/database";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { syntheticRuntime } from "./testing/runtime";
const database = privacyTestDatabase();
it("a held response with a provider ID retains measured cost without personal output after deletion admission", async () => {
	await database
		.admin()
		.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv','alice','Synthetic','cv','{}')");
	await database
		.admin()
		.query(
			"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent','alice','synthetic','1','1','review','1')",
		);
	await database
		.admin()
		.query(
			"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
		);
	const revision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id='cv'")
	).rows[0].updated_at.toISOString();
	const operation = await database.run(() =>
		withAiRuntime(syntheticRuntime, () =>
			operationService.start("alice", {
				requestKey: "held-deletion",
				kind: "review",
				sources: [{ kind: "resume", id: "cv", revision }],
				route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
				consentVersion: "1",
				parameters: {},
			}),
		),
	);
	const started = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<Response>();
	const pending = database.run(() =>
		withAiRuntime(
			{
				...syntheticRuntime,
				fetch: async () => {
					started.resolve();
					return finish.promise;
				},
			},
			() => runAiOperations(),
		),
	);
	await started.promise;
	await database.admin().query("UPDATE \"user\" SET data_deletion_requested_at=now() WHERE id='alice'");
	if (!syntheticRuntime.fetch) throw new Error("Scripted transport missing");
	finish.resolve(await syntheticRuntime.fetch("https://openrouter.ai/api/v1/chat/completions"));
	await pending;
	expect(
		(
			await database
				.admin()
				.query("SELECT cost_micros::int,output,response_id FROM ai_operation_attempt WHERE operation_id=$1", [
					operation.id,
				])
		).rows,
	).toEqual([{ cost_micros: 10, output: null, response_id: null }]);
	expect(
		(await database.admin().query("SELECT result FROM ai_operation WHERE id=$1", [operation.id])).rows[0].result,
	).toBeNull();
});
