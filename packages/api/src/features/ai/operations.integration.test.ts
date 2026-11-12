import type { OperationRequest } from "@reactive-resume/schema/ai-operation";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { runAiOperations } from "./operation-worker";
import { operationService, claimNextOperation, deliverOperation } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRuntime } from "./testing/runtime";
import { usageService } from "./usage";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("durable AI operations", () => {
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
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent','alice','synthetic','1','1','review','1')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
			);
	});
	const request = (requestKey: string): OperationRequest => ({
		requestKey,
		kind: "review",
		sources: [{ kind: "resume", id: "cv", revision }],
		route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
		parameters: {},
	});
	it("replays duplicate starts and delivers/settles once across workers and reconnects", async () => {
		const starts = await run(() =>
			Promise.all([
				operationService.start("alice", request("first")),
				operationService.start("alice", request("first")),
			]),
		);
		expect(starts[0]).toEqual(starts[1]);
		const id = starts[0]?.id;
		if (!id) throw new Error("Missing operation");
		await expect(
			run(() => operationService.start("alice", { ...request("first"), consentVersion: "different" })),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await run(() => Promise.all([runAiOperations(), runAiOperations()]));
		expect(await run(() => operationService.get("alice", id))).toMatchObject({ state: "waiting_review", resultId: id });
		expect(await run(() => operationService.getResult("alice", id))).toEqual({ text: "Synthetic review" });
		expect(await run(() => operationService.cancel("alice", id))).toMatchObject({ state: "waiting_review" });
		expect((await run(() => usageService.getStartUsage("alice"))).operations).toEqual({
			limit: 5,
			used: 1,
			reserved: 0,
			remaining: 4,
		});
		await expect(run(() => operationService.getResult("bob", id))).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			(await database.admin().query("SELECT count(*)::int AS count FROM ai_operation_attempt")).rows[0].count,
		).toBe(1);
		expect(await run(() => operationService.start("alice", request("first")))).toMatchObject({
			id,
			state: "waiting_review",
		});
	});
	it("preflights the same concurrency and platform limits without reserving anything", async () => {
		const queued = await run(() => operationService.start("alice", request("preflight-active")));
		expect(await run(() => operationService.preflight("alice", request("preflight-blocked")))).toMatchObject({
			available: false,
			reason: "AI_CONCURRENCY_LIMIT",
		});
		await run(() => operationService.cancel("alice", queued.id));
		await database
			.admin()
			.query("UPDATE ai_platform_budget SET reserved_micros=cap_micros-spent_micros WHERE id='budget'");
		expect(await run(() => operationService.preflight("alice", request("preflight-budget")))).toMatchObject({
			available: false,
			reason: "AI_BUDGET_LIMIT",
		});
		await database.admin().query("UPDATE ai_platform_budget SET reserved_micros=0 WHERE id='budget'");
		await database.run(() =>
			withAiRuntime(
				{
					...syntheticRuntime,
					routes: syntheticRuntime.routes.map((route) => ({
						...route,
						requestCapMicros: 5000,
						maxCallCostMicros: 1000,
					})),
				},
				async () => {
					expect(await operationService.preflight("alice", request("preflight-manifest-cap"))).toMatchObject({
						available: false,
						reason: "AI_BUDGET_LIMIT",
					});
				},
			),
		);
		expect(await run(() => operationService.preflight("alice", request("preflight-ready")))).toMatchObject({
			available: true,
			operationCost: 1,
		});
		expect(
			(
				await database
					.admin()
					.query(
						"SELECT count(*)::int AS count FROM ai_operation WHERE request_key LIKE 'preflight-%' AND request_key <> 'preflight-active'",
					)
			).rows[0].count,
		).toBe(0);
	});
	it("releases a queued cancellation without reserving imaginary platform expense", async () => {
		const operation = await run(() => operationService.start("alice", request("cancel-queued")));
		expect(await run(() => operationService.cancel("alice", operation.id))).toMatchObject({ state: "cancelled" });
		await run(() => runAiOperations());
		expect(
			(await database.admin().query("SELECT active,reserved_micros::int FROM ai_platform_budget WHERE id='budget'"))
				.rows,
		).toEqual([{ active: 0, reserved_micros: 0 }]);
		expect((await run(() => usageService.getStartUsage("alice"))).operations.used).toBe(1);
	});
	it("recovers an unstarted expired lease and refuses publication by the old worker", async () => {
		const operation = await run(() => operationService.start("alice", request("expired-unstarted")));
		const lease = await run(() => claimNextOperation("alice"));
		if (!lease) throw new Error("Missing lease");
		await database
			.admin()
			.query("UPDATE ai_operation SET lease_until=now()-interval '1 minute' WHERE id=$1", [operation.id]);
		await run(() => runAiOperations());
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({ state: "waiting_review" });
		await expect(run(() => deliverOperation(lease, { text: "Stale" }))).rejects.toMatchObject({ code: "CONFLICT" });
	});
	it("confirms cancellation during a call without charging the user, while retaining platform expense", async () => {
		const operation = await run(() => operationService.start("alice", request("cancel-running")));
		const cancelling = {
			...syntheticRuntime,
			fetch: async (...args: Parameters<typeof fetch>) => {
				expect(await operationService.cancel("alice", operation.id)).toMatchObject({ state: "cancel_requested" });
				if (!syntheticRuntime.fetch) throw new Error("Missing synthetic transport");
				return syntheticRuntime.fetch(...args);
			},
		};
		await database.run(() => withAiRuntime(cancelling, () => runAiOperations()));
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "cancelled",
			resultId: null,
		});
		expect((await run(() => usageService.getStartUsage("alice"))).operations.used).toBe(2);
		expect(
			(await database.admin().query("SELECT actual_micros::int FROM ai_operation WHERE id=$1", [operation.id])).rows,
		).toEqual([{ actual_micros: 10 }]);
	});
	it("fails an ambiguous crashed attempt without another provider call or user charge", async () => {
		const operation = await run(() => operationService.start("alice", request("crashed-call")));
		const lease = await run(() => claimNextOperation("alice"));
		if (!lease) throw new Error("Missing lease");
		await database
			.admin()
			.query(
				"INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id,lease_token) VALUES ('ambiguous','alice',$1,1,'generate',$2)",
				[operation.id, lease.token],
			);
		await database
			.admin()
			.query("UPDATE ai_operation SET lease_until=now()-interval '1 minute' WHERE id=$1", [operation.id]);
		let calls = 0;
		await database.run(() =>
			withAiRuntime(
				{
					...syntheticRuntime,
					fetch: async () => {
						calls++;
						throw new Error("Must not call");
					},
				},
				() => runAiOperations(),
			),
		);
		expect(calls).toBe(0);
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			failureCode: "AI_OUTCOME_UNKNOWN",
		});
		expect(
			(await database.admin().query("SELECT reserved_micros::int FROM ai_platform_budget WHERE id='budget'")).rows,
		).toEqual([{ reserved_micros: 10000 }]);
	});
	it("blocks changed sources and revoked consent before publication, preserving the source", async () => {
		const operation = await run(() => operationService.start("alice", request("revoked")));
		await database.admin().query("UPDATE ai_processing_consent SET revoked_at=now() WHERE id='consent'");
		await run(() => runAiOperations());
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
		await expect(run(() => operationService.start("alice", request("revoked-new")))).rejects.toMatchObject({
			data: { reason: "AI_CONSENT_REQUIRED" },
		});
		await database.admin().query("UPDATE ai_processing_consent SET revoked_at=NULL WHERE id='consent'");
		const changed = await run(() => operationService.start("alice", request("changed")));
		await database.admin().query("UPDATE resume SET updated_at=updated_at+interval '1 second' WHERE id='cv'");
		await run(() => runAiOperations());
		expect(await run(() => operationService.get("alice", changed.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
	});
	it("records a late provider expense after lease recovery without reviving or charging failed work", async () => {
		revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv'")
		).rows[0].updated_at.toISOString();
		const operation = await run(() => operationService.start("alice", request("late-expense")));
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
		await database
			.admin()
			.query("UPDATE ai_operation SET lease_until=now()-interval '1 minute' WHERE id=$1", [operation.id]);
		await run(() => runAiOperations());
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
		if (!syntheticRuntime.fetch) throw new Error("Missing transport");
		finish.resolve(await syntheticRuntime.fetch("https://openrouter.ai/api/v1/chat/completions"));
		await pending;
		expect(
			(await database.admin().query("SELECT reserved_micros::int FROM ai_platform_budget WHERE id='budget'")).rows,
		).toEqual([{ reserved_micros: 10000 }]);
		expect((await run(() => usageService.getStartUsage("alice"))).operations.used).toBe(2);
	});
	it("never performs a second schema repair, even when the first repair is transient", async () => {
		const operation = await run(() => operationService.start("alice", request("repair-limit")));
		let calls = 0;
		await database.run(() =>
			withAiRuntime(
				{
					...syntheticRuntime,
					fetch: async () => {
						calls++;
						return calls === 1
							? new Response(
									JSON.stringify({
										choices: [
											{ index: 0, message: { role: "assistant", content: '{"wrong":true}' }, finish_reason: "stop" },
										],
									}),
									{ headers: { "content-type": "application/json" } },
								)
							: new Response('{"error":{"message":"Synthetic temporary error"}}', {
									status: 503,
									headers: { "content-type": "application/json" },
								});
					},
				},
				() => runAiOperations(),
			),
		);
		expect(calls).toBe(2);
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
	});
	it("delivers exactly five multi-call tasks and blocks the sixth before egress without renewal", async () => {
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('bob-cv','bob','Synthetic','bob-cv','{}')");
		const bobRevision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='bob-cv'")
		).rows[0].updated_at.toISOString();
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('bob-consent','bob','synthetic','1','1','review','1')",
			);
		const bobRequest = (key: string) => ({
			...request(key),
			sources: [{ kind: "resume" as const, id: "bob-cv", revision: bobRevision }],
		});
		let calls = 0;
		const runtime = {
			...syntheticRuntime,
			fetch: async (...args: Parameters<typeof fetch>) => {
				calls++;
				if (calls % 3 === 1)
					return new Response('{"error":{"message":"Synthetic rate limit"}}', {
						status: 429,
						headers: { "content-type": "application/json" },
					});
				if (calls % 3 === 2)
					return new Response(
						JSON.stringify({
							choices: [{ index: 0, message: { role: "assistant", content: '{"wrong":true}' }, finish_reason: "stop" }],
						}),
						{ headers: { "content-type": "application/json" } },
					);
				if (!syntheticRuntime.fetch) throw new Error("Missing transport");
				return syntheticRuntime.fetch(...args);
			},
		};
		await database.run(() =>
			withAiRuntime(runtime, async () => {
				for (let index = 0; index < 5; index++) {
					const operation = await operationService.start("bob", bobRequest(`five-${index}`));
					await runAiOperations();
					expect(await operationService.get("bob", operation.id)).toMatchObject({ state: "waiting_review" });
				}
				expect((await usageService.getStartUsage("bob")).operations).toEqual({
					limit: 5,
					used: 5,
					reserved: 0,
					remaining: 0,
				});
				await database
					.admin()
					.query("UPDATE ai_usage_ledger SET created_at=created_at-interval '2 years' WHERE user_id='bob'");
				expect(await operationService.preflight("bob", bobRequest("sixth"))).toMatchObject({
					available: false,
					reason: "AI_OPERATIONS_LIMIT",
				});
				await expect(operationService.start("bob", bobRequest("sixth"))).rejects.toMatchObject({
					data: { reason: "AI_OPERATIONS_LIMIT" },
				});
			}),
		);
		expect(calls).toBe(15);
	});
	it.each([
		["stale", "cv", "outdated", "AI_SOURCE_CHANGED"],
		["missing", "missing", "outdated", "AI_SOURCE_UNAVAILABLE"],
	])("reports %s source denial through preflight availability", async (key, id, revision, reason) => {
		const value = { ...request(`preflight-source-${key}`), sources: [{ kind: "resume" as const, id, revision }] };
		expect(await run(() => operationService.preflight("alice", value))).toMatchObject({ available: false, reason });
		expect(
			(await database.admin().query("SELECT id FROM ai_operation WHERE request_key=$1", [value.requestKey])).rows,
		).toEqual([]);
	});
	it.each([
		["missing", { variantKind: "language" as const, baseResumeId: "missing-copy-source" }, "AI_SOURCE_UNAVAILABLE"],
		["base", { variantKind: "base" as const }, "AI_INVALID_REQUEST"],
	])("reports %s copy denial through preflight availability", async (key, claim, reason) => {
		const review = syntheticRuntime.handlers.review;
		if (!review) throw new Error("Missing handler");
		const runtime = { ...syntheticRuntime, handlers: { review: { ...review, copyClaim: () => claim } } };
		expect(
			await database.run(() =>
				withAiRuntime(runtime, () => operationService.preflight("alice", request(`copy-${key}`))),
			),
		).toMatchObject({ available: false, reason });
	});
	it("replays the same raw request after default/transform normalization and a deployment change", async () => {
		const review = syntheticRuntime.handlers.review;
		if (!review) throw new Error("Missing handler");
		const runtime = {
			...syntheticRuntime,
			handlers: {
				review: {
					...review,
					parameters: z.object({
						mode: z
							.string()
							.default("review")
							.transform((value) => value.toUpperCase()),
					}),
				},
			},
		};
		const original = request("normalized-replay");
		const preflight = await database.run(() =>
			withAiRuntime(runtime, () => operationService.preflight("alice", structuredClone(original))),
		);
		expect(preflight.available).toBe(true);
		const operation = await database.run(() =>
			withAiRuntime(runtime, () => operationService.start("alice", structuredClone(original))),
		);
		try {
			expect(
				(await database.admin().query("SELECT fingerprint FROM ai_operation WHERE id=$1", [operation.id])).rows[0]
					.fingerprint,
			).toBe(preflight.requestFingerprint);
			expect(
				await database.run(() =>
					withAiRuntime(runtime, () => operationService.preflight("alice", structuredClone(original))),
				),
			).toMatchObject({ available: true, requestFingerprint: preflight.requestFingerprint });
			expect(
				await database.run(() =>
					withAiRuntime(
						{ ...runtime, handlers: { review: { ...runtime.handlers.review, promptVersion: "new-deployment" } } },
						() => operationService.start("alice", structuredClone(original)),
					),
				),
			).toEqual(operation);
		} finally {
			await run(() => operationService.cancel("alice", operation.id));
		}
	});
	it.each(["refusal", "truncated", "unsupported"])(
		"recovers a persisted %s outcome without another call",
		async (outcome) => {
			const operation = await run(() => operationService.start("alice", request(`recovered-${outcome}`)));
			const lease = await run(() => claimNextOperation("alice"));
			if (!lease) throw new Error("Missing lease");
			await database
				.admin()
				.query(
					"INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id,lease_token,outcome,cost_micros,finished_at) VALUES ($1,'alice',$2,1,'generate',$3,$4,10,now())",
					[`attempt-${outcome}`, operation.id, lease.token, outcome],
				);
			await database
				.admin()
				.query("UPDATE ai_operation SET lease_until=now()-interval '1 minute' WHERE id=$1", [operation.id]);
			let calls = 0;
			await database.run(() =>
				withAiRuntime(
					{
						...syntheticRuntime,
						fetch: async (...args: Parameters<typeof fetch>) => {
							calls++;
							if (!syntheticRuntime.fetch) throw new Error("Missing transport");
							return syntheticRuntime.fetch(...args);
						},
					},
					() => runAiOperations(),
				),
			);
			expect(calls).toBe(0);
			expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
				state: "failed",
				resultId: null,
			});
		},
	);
	it("stops before another call when measured expense exhausts the request reservation", async () => {
		await database
			.admin()
			.query(
				"INSERT INTO \"user\"(id,name,email,username,display_username) VALUES ('carol','Carol','carol@example.test','carol','carol')",
			);
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv-carol','carol','Synthetic','cv','{}')");
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent-carol','carol','synthetic','1','1','review','1')",
			);
		const carolRevision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv-carol'")
		).rows[0].updated_at.toISOString();
		const operation = await run(() =>
			operationService.start("carol", {
				...request("cost-exhausted"),
				sources: [{ kind: "resume", id: "cv-carol", revision: carolRevision }],
			}),
		);
		let calls = 0;
		await database.run(() =>
			withAiRuntime(
				{
					...syntheticRuntime,
					fetch: () => {
						calls++;
						return Promise.resolve(
							new Response(
								JSON.stringify({
									id: "expensive",
									choices: [
										{ index: 0, message: { role: "assistant", content: '{"invalid":true}' }, finish_reason: "stop" },
									],
									usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, cost: 0.01 },
								}),
								{ headers: { "content-type": "application/json" } },
							),
						);
					},
				},
				() => runAiOperations(),
			),
		);
		expect(calls).toBe(1);
		expect(await run(() => operationService.get("carol", operation.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
	});
});
