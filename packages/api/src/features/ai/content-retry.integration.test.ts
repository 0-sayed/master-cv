import type { AiRuntime } from "./route-policy";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRuntime } from "./testing/runtime";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("content rejection retry and usage", () => {
	const database = aiTestDatabase();
	afterEach(() => vi.restoreAllMocks());
	let revision: string;
	beforeAll(async () => {
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv-alice','alice','Synthetic','cv',$1)", [
				JSON.stringify(defaultResumeData),
			]);
		revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv-alice'")
		).rows[0].updated_at.toISOString();
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('retry-consent','alice','synthetic','1','1','review','1')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('synthetic','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
			);
	});
	const request = (_owner: string, requestKey: string) => ({
		requestKey,
		kind: "review",
		sources: [{ kind: "resume" as const, id: "cv-alice", revision }],
		route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
		parameters: {},
	});
	function contentRuntime(
		reject: "guard" | "verifier" | "always-verifier" | "always" | "source" | "none",
		status = 200,
	) {
		const review = syntheticRuntime.handlers.review;
		if (!review) throw new Error("Missing synthetic handler");
		let writers = 0;
		const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
			if (status !== 200) return Response.json({ error: "Synthetic account error" }, { status });
			const body = JSON.parse(String(init?.body));
			const verifying = body.messages[0].content === "Synthetic content verifier";
			const text = verifying
				? "Verifier verdict"
				: ++writers === 1 || reject === "always-verifier"
					? "Rejected draft"
					: "Safe draft";
			return Response.json({
				id: `synthetic-content-${fetch.mock.calls.length}`,
				model: "synthetic/model",
				provider: "Test",
				choices: [{ message: { role: "assistant", content: JSON.stringify({ text }) }, finish_reason: "stop" }],
				usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7, cost: 0.00001 },
			});
		});
		const runtime: AiRuntime = {
			...syntheticRuntime,
			fetch,
			handlers: {
				review: {
					...review,
					validateResult: async (_tx, _owner, _request, output) => {
						if (reject === "source") throw new Error("AI_SOURCE_CHANGED");
						if (reject === "always" || (reject === "guard" && output.text === "Rejected draft"))
							throw new Error("AI_LOST_FACT");
						return output;
					},
					verifier: {
						output: review.output,
						systemPrompt: "Synthetic content verifier",
						buildInput: (payload) => payload,
						validate: (output) => {
							if ((reject === "verifier" || reject === "always-verifier") && output.text === "Rejected draft")
								throw new Error("AI_VERIFICATION_FAILED");
						},
					},
				},
			},
		};
		return { runtime, fetch };
	}
	it.each(["guard", "verifier"] as const)(
		"retries a %s content rejection once and settles one delivered task",
		async (reject) => {
			const { runtime, fetch } = contentRuntime(reject);
			const log = vi.spyOn(console, "info");
			await database.run(() =>
				withAiRuntime(runtime, async () => {
					const operation = await operationService.start("alice", request("alice", `content-${reject}`));
					await runAiOperations();
					const view = await operationService.get("alice", operation.id);
					expect(view, JSON.stringify(view)).toMatchObject({ state: "waiting_review" });
					const attempts = (
						await database
							.admin()
							.query("SELECT step_id, cost_micros FROM ai_operation_attempt WHERE operation_id=$1 ORDER BY ordinal", [
								operation.id,
							])
					).rows;
					expect(attempts.map((a) => a.step_id)).toEqual(
						reject === "guard" ? ["generate", "regenerate", "verify"] : ["generate", "verify", "regenerate", "verify"],
					);
					expect(attempts.map((a) => Number(a.cost_micros))).toEqual(attempts.map(() => 10));
					expect(fetch).toHaveBeenCalledTimes(attempts.length);
					expect(log).toHaveBeenCalledWith("[ai-operation]", {
						event: "delivered",
						kind: "review",
						operationId: operation.id,
						generationAttempt: 2,
					});
					expect(
						(
							await database
								.admin()
								.query("SELECT kind FROM ai_usage_ledger WHERE operation_id=$1 ORDER BY kind", [operation.id])
						).rows,
					).toEqual([{ kind: "reserve" }, { kind: "settle" }]);
				}),
			);
		},
	);
	it.each(["always", "always-verifier", "source", "none"] as const)(
		"bounds content retry and preserves charging for %s",
		async (reject) => {
			const { runtime, fetch } = contentRuntime(reject);
			await database.run(() =>
				withAiRuntime(runtime, async () => {
					const operation = await operationService.start("alice", request("alice", `content-${reject}`));
					await runAiOperations();
					expect(await operationService.get("alice", operation.id)).toMatchObject({
						state: reject === "none" ? "waiting_review" : "failed",
					});
					expect(fetch).toHaveBeenCalledTimes(reject === "source" ? 1 : reject === "always-verifier" ? 4 : 2);
					expect(
						(
							await database
								.admin()
								.query("SELECT kind FROM ai_usage_ledger WHERE operation_id=$1 ORDER BY kind", [operation.id])
						).rows,
					).toEqual(
						reject === "none" ? [{ kind: "reserve" }, { kind: "settle" }] : [{ kind: "release" }, { kind: "reserve" }],
					);
				}),
			);
		},
	);
	it.each([401, 402])("does not regenerate on provider/account HTTP %s errors", async (status) => {
		const { runtime, fetch } = contentRuntime("none", status);
		await database.run(() =>
			withAiRuntime(runtime, async () => {
				const operation = await operationService.start("alice", request("alice", `content-http-${status}`));
				await runAiOperations();
				expect(await operationService.get("alice", operation.id)).toMatchObject({ state: "failed" });
				expect(fetch).toHaveBeenCalledTimes(1);
			}),
		);
	});

	it("rejects invalid user input before dispatch", async () => {
		const { runtime, fetch } = contentRuntime("none");
		await database.run(() =>
			withAiRuntime(runtime, async () => {
				await expect(
					operationService.start("alice", { ...request("alice", "invalid-input"), parameters: { unexpected: true } }),
				).rejects.toThrow();
				expect(fetch).not.toHaveBeenCalled();
			}),
		);
	});
	it.each(["Rejected draft", "Safe draft"])(
		"recovers the retry draft %s without purchasing a third generation",
		async (text) => {
			const { runtime, fetch } = contentRuntime("always-verifier");
			await database.run(() =>
				withAiRuntime(runtime, async () => {
					const operation = await operationService.start("alice", request("alice", `recover-content-${text}`));
					for (const [i, step] of ["generate", "verify", "regenerate", "verify"].entries())
						await database
							.admin()
							.query(
								"INSERT INTO ai_operation_attempt(id,user_id,operation_id,ordinal,step_id,outcome,output,cost_micros,finished_at) VALUES ($1,'alice',$2,$3,$4,'valid',$5,10,now())",
								[
									`${operation.id}-${i}`,
									operation.id,
									i + 1,
									step,
									JSON.stringify({ text: i === 2 ? text : "Rejected draft" }),
								],
							);
					await runAiOperations();
					expect(await operationService.get("alice", operation.id)).toMatchObject({
						state: text === "Safe draft" ? "waiting_review" : "failed",
					});
					expect(fetch).not.toHaveBeenCalled();
				}),
			);
		},
	);
	it("retries guards for tasks without a verifier", async () => {
		const { runtime, fetch } = contentRuntime("guard");
		const handler = runtime.handlers.review;
		if (!handler) throw new Error("Missing synthetic handler");
		const { verifier: _verifier, ...guarded } = handler;
		await database.run(() =>
			withAiRuntime({ ...runtime, handlers: { review: guarded } }, async () => {
				const operation = await operationService.start("alice", request("alice", "guard-without-verifier"));
				await runAiOperations();
				expect(await operationService.get("alice", operation.id)).toMatchObject({ state: "waiting_review" });
				expect(fetch).toHaveBeenCalledTimes(2);
			}),
		);
	});
});
