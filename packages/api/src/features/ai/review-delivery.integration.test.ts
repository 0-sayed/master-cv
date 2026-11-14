import { beforeAll, describe, expect, it } from "vite-plus/test";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { reviewHandlers } from "./review-handlers";
import { prepareResumeReview } from "./review-sources";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticReviewRuntime as syntheticRuntime } from "./testing/runtime";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("review delivery", () => {
	const database = aiTestDatabase();
	let captured: unknown;
	let text = "Developed services.";
	let empty = false;
	let verifierMode = "supported";
	let verifierCalls = 0;
	let verifierRequest: Record<string, unknown> | null = null;
	const runtime = {
		...syntheticRuntime,
		handlers: reviewHandlers,
		fetch: async (_url: unknown, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			if (!String(body.messages[0].content).includes("t006-verifier")) captured = body;
			const content = JSON.parse(body.messages.at(-1).content);
			const verification = content.selections.find((s: { id: string }) => s.id === "verification-claims");
			if (verification) {
				verifierRequest = body;
				verifierCalls++;
				if (verifierMode === "down") return Response.json({ error: "Synthetic unavailable" }, { status: 503 });
				const claims = JSON.parse(verification.text) as { claimId: string; evidenceIds: string[] }[];
				return Response.json({
					id: "verification",
					model: "synthetic/model",
					provider: "Test",
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: JSON.stringify({
									schemaVersion: 3,
									responseAssessment: { status: "appropriate", reason: "The response addresses the task." },
									factRetention: {
										status: verifierMode === "lost" ? "lost" : "retained",
										evidenceIds: [...new Set(claims.flatMap((c) => c.evidenceIds))],
										reason: "Synthetic retention judgment",
									},
									verdicts:
										verifierMode === "missing"
											? []
											: claims.map((c) => ({
													claimId: c.claimId,
													verdict: verifierMode === "lost" ? "supported" : verifierMode,
													evidenceIds: c.evidenceIds,
													reason: "Synthetic fidelity verdict",
												})),
								}),
							},
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 6, completion_tokens: 4, total_tokens: 10, cost: 0.00001 },
				});
			}
			const id = content.selections.find((selection: { id: string }) => selection.id !== "intent").id;
			return new Response(
				JSON.stringify({
					id: "synthetic",
					model: "synthetic/model",
					provider: "Test",
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: JSON.stringify({
									proposals: empty
										? []
										: [
												{
													id: "p1",
													passageId: id,
													text,
													reason: "Clearer",
													evidenceIds: [id],
													claims: splitReviewClaims(text, [id]),
												},
											],
									questions: [],
									notes: [],
								}),
							},
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0.00001 },
				}),
				{ headers: { "content-type": "application/json" } },
			);
		},
	};
	const run = <T>(work: () => T) => database.run(() => withAiRuntime(runtime, work));
	beforeAll(async () => {
		const data = structuredClone(defaultResumeData);
		data.summary.content = "<p>Built services.</p>";
		data.basics.name = "Ada Lovelace";
		data.basics.location = "London";
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv','alice','Synthetic','cv',$1)", [
				JSON.stringify(data),
			]);
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent','alice','synthetic','1','1','review.wording','1')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
			);
	});
	const start = async (key: string, customRequest?: string) => {
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv'")
		).rows[0].updated_at.toISOString();
		const prepared = await run(() =>
			prepareResumeReview("alice", {
				resumeId: "cv",
				expectedUpdatedAt: revision,
				targets: [{ sectionId: "summary", field: "content" }],
			}),
		);
		return run(() =>
			operationService.start("alice", {
				requestKey: key,
				kind: "review.wording",
				sources: prepared.sources,
				route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
				consentVersion: "1",
				parameters: {
					resumeId: "cv",
					targets: [{ sectionId: "summary", field: "content" }],
					action: customRequest ? "custom" : "review",
					...(customRequest ? { request: customRequest } : {}),
				},
			}),
		);
	};
	it("publishes a validated pending review once without changing the CV", async () => {
		const operation = await start("valid", "Mention Ada Lovelace in London");
		await run(() => runAiOperations());

		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "waiting_review",
			failureCode: null,
		});
		expect(await run(() => operationService.getResult("alice", operation.id))).toMatchObject({
			kind: "wording",
			proposals: [{ status: "pending", before: "<p>Built services.</p>", after: "<p>Developed services.</p>" }],
		});
		await run(() => runAiOperations());
		expect((await database.admin().query("SELECT data FROM resume WHERE id='cv'")).rows[0].data.summary.content).toBe(
			"<p>Built services.</p>",
		);
		expect(
			(
				await database
					.admin()
					.query("SELECT count(*)::int n FROM ai_usage_ledger WHERE operation_id=$1 AND kind='settle'", [operation.id])
			).rows[0].n,
		).toBe(1);
		expect(
			(
				await database
					.admin()
					.query("SELECT count(*)::int n, sum(cost_micros)::int cost FROM ai_operation_attempt WHERE operation_id=$1", [
						operation.id,
					])
			).rows[0],
		).toEqual({ n: 2, cost: 20 });
		expect(JSON.stringify(captured)).not.toContain("cv");
		expect(JSON.stringify(captured)).not.toContain("Ada Lovelace");
		expect(JSON.stringify(captured)).not.toContain("London");
		expect(verifierRequest).toMatchObject({
			model: "deepseek/deepseek-v4.1-flash-1017",
			reasoning: { effort: "low" },
			provider: { only: ["together"], allow_fallbacks: false, data_collection: "deny", zdr: true },
		});
	});
	it.each(["unsupported", "contradicted", "down", "missing", "lost"])(
		"withholds proposals when verifier returns %s",
		async (mode) => {
			verifierMode = mode;
			const operation = await start(`verify-${mode}`);
			await run(() => runAiOperations());
			expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
				state: "failed",
				resultId: null,
			});
			const attempts = (
				await database
					.admin()
					.query("SELECT step_id FROM ai_operation_attempt WHERE operation_id=$1 ORDER BY ordinal", [operation.id])
			).rows;
			expect(attempts.map((a) => a.step_id)).toEqual(["generate", "verify"]);
			expect(
				(
					await database
						.admin()
						.query("SELECT kind FROM ai_usage_ledger WHERE operation_id=$1 ORDER BY created_at", [operation.id])
				).rows.map((r) => r.kind),
			).toEqual(["reserve", "release"]);
			verifierMode = "supported";
		},
	);
	it("fails semantic-invalid output without publishing or settling usage", async () => {
		const previousVerifierCalls = verifierCalls;
		text = "Led delivery with a 30% increase.";
		const operation = await start("invalid");
		await run(() => runAiOperations());
		expect(verifierCalls).toBe(previousVerifierCalls);
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			failureCode: "AI_REVIEW_INVALID",
		});
		expect(
			(
				await database
					.admin()
					.query("SELECT kind FROM ai_usage_ledger WHERE operation_id=$1 ORDER BY created_at", [operation.id])
			).rows.map((row) => row.kind),
		).toEqual(["reserve", "release"]);
	});
	it("settles three identical-input synthetic runs once each and preserves source mapping", async () => {
		text = "Developed services.";
		const results = [];
		for (let index = 0; index < 3; index++) {
			const operation = await start(`repeat-${index}`);
			await run(() => runAiOperations());
			results.push(await run(() => operationService.getResult("alice", operation.id)));
			expect(
				(
					await database
						.admin()
						.query("SELECT count(*)::int n FROM ai_usage_ledger WHERE operation_id=$1 AND kind='settle'", [
							operation.id,
						])
				).rows[0].n,
			).toBe(1);
		}
		expect(results[1]).toEqual(results[0]);
		expect(results[2]).toEqual(results[0]);
	});
	it("delivers an explicit empty successful review and settles it once", async () => {
		empty = true;
		const operation = await start("empty");
		await run(() => runAiOperations());
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({ state: "succeeded" });
		expect(await run(() => operationService.getResult("alice", operation.id))).toMatchObject({
			proposals: [],
			questions: [],
		});
		expect(
			(
				await database
					.admin()
					.query("SELECT count(*)::int n FROM ai_usage_ledger WHERE operation_id=$1 AND kind='settle'", [operation.id])
			).rows[0].n,
		).toBe(1);
	});
});
