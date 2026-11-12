import { beforeAll, describe, expect, it } from "vite-plus/test";
import { processingConsentService } from "./consent";
import { runAiOperations } from "./operation-worker";
import { claimNextOperation, heartbeatOperation, operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRoute, syntheticRuntime } from "./testing/runtime";
import { usageService } from "./usage";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("review worker lifecycle", () => {
	const database = aiTestDatabase();
	const run = <T>(work: () => T) => database.run(() => withAiRuntime(syntheticRuntime, work));
	beforeAll(async () => {
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',current_date,100000,10000,2)",
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
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [owner])
		).rows[0].updated_at.toISOString();
		const route = { routeId: "synthetic", routeRevision: "1", configRevision: "1" };
		await run(() => processingConsentService.grant(owner, { route, purpose: "review", noticeVersion: "1" }));
		return {
			requestKey: owner,
			kind: "review",
			sources: [{ kind: "resume" as const, id: owner, revision }],
			route,
			consentVersion: "1",
			parameters: {},
		};
	}
	it.each(["deadline", "shutdown"])("bounds stalled input loading on %s without provider egress", async (cause) => {
		const owner = `input-${cause}`;
		const request = await prepare(owner);
		const review = syntheticRuntime.handlers.review;
		if (!review) throw new Error("Missing handler");
		const entered = Promise.withResolvers<void>();
		const input = Promise.withResolvers<Awaited<ReturnType<typeof review.buildInput>>>();
		const controller = new AbortController();
		let calls = 0;
		const runtime = {
			...syntheticRuntime,
			routes: [{ ...syntheticRoute, deadlineMs: cause === "deadline" ? 30 : 120000 }],
			handlers: {
				review: {
					...review,
					buildInput: () => {
						entered.resolve();
						return input.promise;
					},
				},
			},
			fetch: () => {
				calls++;
				throw new Error("Must not call");
			},
		};
		const operation = await database.run(() => withAiRuntime(runtime, () => operationService.start(owner, request)));
		const pending = database.run(() => withAiRuntime(runtime, () => runAiOperations(controller.signal)));
		await entered.promise;
		if (cause === "shutdown") controller.abort();
		try {
			const finished = await Promise.race([
				pending.then(() => true),
				new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
			]);
			expect(finished).toBe(true);
			expect(calls).toBe(0);
			const status = await run(() => operationService.get(owner, operation.id));
			expect(status).toMatchObject(
				cause === "deadline"
					? { state: "failed", failureCode: "AI_DEADLINE" }
					: { state: "running", failureCode: null },
			);
		} finally {
			input.resolve(await review.buildInput(owner, request));
			await pending;
			await run(() => operationService.cancel(owner, operation.id));
			await run(() => runAiOperations());
		}
	});
	it("drains an in-flight provider call when scheduler shutdown begins", async () => {
		const owner = "shutdown-call";
		const request = await prepare(owner);
		const entered = Promise.withResolvers<void>();
		const response = Promise.withResolvers<Response>();
		const controller = new AbortController();
		const operation = await run(() => operationService.start(owner, request));
		const pending = database.run(() =>
			withAiRuntime(
				{
					...syntheticRuntime,
					fetch: (_url: unknown, init?: RequestInit) =>
						new Promise<Response>((resolve, reject) => {
							entered.resolve();
							const signal = init?.signal;
							if (signal?.aborted) reject(signal.reason);
							else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
							response.promise.then(resolve, reject);
						}),
				},
				() => runAiOperations(controller.signal),
			),
		);
		await entered.promise;
		controller.abort();
		await new Promise((resolve) => setImmediate(resolve));
		const fetch = syntheticRuntime.fetch;
		if (!fetch) throw new Error("Missing synthetic transport");
		response.resolve(await fetch("https://openrouter.ai/api/v1/chat/completions"));
		await pending;
		expect(await run(() => operationService.get(owner, operation.id))).toMatchObject({
			state: "waiting_review",
			resultId: operation.id,
		});
	});
	it("rejects recovered output whose recorded call exceeds the approved cost ceiling", async () => {
		const owner = "recovered-cost";
		const request = await prepare(owner);
		const operation = await run(() => operationService.start(owner, request));
		const lease = await run(() => claimNextOperation(owner));
		if (!lease) throw new Error("Missing lease");
		await database
			.admin()
			.query(
				"INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id,lease_token,outcome,cost_micros,finished_at,output) VALUES ('over-cap',$1,$2,1,'generate',$3,'valid',3334,now(),'{\"text\":\"Recovered\"}')",
				[owner, operation.id, lease.token],
			);
		await database
			.admin()
			.query("UPDATE ai_operation SET lease_until=now()-interval '1 minute' WHERE id=$1", [operation.id]);
		await run(() => runAiOperations());
		expect(await run(() => operationService.get(owner, operation.id))).toMatchObject({
			state: "failed",
			failureCode: "AI_REQUEST_COST_LIMIT",
			resultId: null,
		});
		expect((await run(() => usageService.getStartUsage(owner))).operations.used).toBe(0);
	});
	it("refuses to renew a lease after its execution deadline", async () => {
		const owner = "expired-heartbeat";
		const request = await prepare(owner);
		const operation = await database.run(() =>
			withAiRuntime({ ...syntheticRuntime, routes: [{ ...syntheticRoute, deadlineMs: 1 }] }, () =>
				operationService.start(owner, request),
			),
		);
		const lease = await run(() => claimNextOperation(owner));
		if (!lease) throw new Error("Missing lease");
		await new Promise((resolve) => setTimeout(resolve, 10));
		await expect(run(() => heartbeatOperation(lease))).rejects.toThrow();
		await run(() => operationService.cancel(owner, operation.id));
		await database
			.admin()
			.query("UPDATE ai_operation SET lease_until=now()-interval '1 minute' WHERE id=$1", [operation.id]);
		await run(() => runAiOperations());
	});
});
