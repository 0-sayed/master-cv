import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRuntime, syntheticRoute } from "./testing/runtime";
import { usageService } from "./usage";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("AI delivery and global admission", () => {
	const database = aiTestDatabase();
	const run = <T>(work: () => T) => database.run(() => withAiRuntime(syntheticRuntime, work));
	const revisions = new Map<string, string>();
	beforeAll(async () => {
		await database
			.admin()
			.query(
				"INSERT INTO \"user\"(id,name,email,username,display_username) VALUES ('carol','Carol','carol@example.test','carol','carol')",
			);
		for (const owner of ["alice", "bob", "carol"]) {
			const route = owner === "bob" ? "synthetic-b" : "synthetic";
			await database
				.admin()
				.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ($1,$2,'Synthetic','cv',$3)", [
					`cv-${owner}`,
					owner,
					JSON.stringify(defaultResumeData),
				]);
			revisions.set(
				owner,
				(
					await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [`cv-${owner}`])
				).rows[0].updated_at.toISOString(),
			);
			await database
				.admin()
				.query(
					"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose) VALUES ($1,$2,$3,'1','1','review')",
					[`consent-${owner}`, owner, route],
				);
		}
		for (const route of ["synthetic", "synthetic-b"])
			await database
				.admin()
				.query(
					"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ($1,$1,'1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
					[route],
				);
	});
	const request = (owner: string, key: string) => ({
		requestKey: key,
		kind: "review",
		sources: [{ kind: "resume" as const, id: `cv-${owner}`, revision: revisions.get(owner) ?? "missing" }],
		route: { routeId: owner === "bob" ? "synthetic-b" : "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
		parameters: {},
	});
	it("limits three racing owners across separate policy rows to two global reservations", async () => {
		const runtime = { ...syntheticRuntime, routes: [syntheticRoute, { ...syntheticRoute, routeId: "synthetic-b" }] };
		const owners = ["alice", "bob", "carol"];
		const outcomes = await database.run(() =>
			withAiRuntime(runtime, () =>
				Promise.allSettled(owners.map((owner) => operationService.start(owner, request(owner, "global-race")))),
			),
		);
		expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
		expect(outcomes.find((outcome) => outcome.status === "rejected")).toMatchObject({
			reason: { data: { reason: "AI_BUDGET_LIMIT" } },
		});
		expect(
			(await database.admin().query("SELECT sum(active)::int AS active FROM ai_platform_budget")).rows[0].active,
		).toBe(2);
		for (let index = 0; index < outcomes.length; index++) {
			const outcome = outcomes[index];
			const owner = owners[index];
			if (owner && outcome?.status === "fulfilled") await run(() => operationService.cancel(owner, outcome.value.id));
		}
	});
	it("rolls back copy, first revision and settlement together when result persistence fails", async () => {
		const review = syntheticRuntime.handlers.review;
		if (!review) throw new Error("Missing synthetic handler");
		const runtime = {
			...syntheticRuntime,
			handlers: {
				review: {
					...review,
					copyClaim: () => ({ variantKind: "language" as const, baseResumeId: "cv-alice" }),
					createCopy: () => ({ name: "Synthetic language", locale: "en-US" as const, data: defaultResumeData }),
				},
			},
		};
		await database
			.admin()
			.query(
				"CREATE FUNCTION reject_synthetic_copy_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic persistence failure'; END $$; CREATE TRIGGER reject_synthetic_copy_version BEFORE INSERT ON resume_version FOR EACH ROW EXECUTE FUNCTION reject_synthetic_copy_version()",
			);
		try {
			const operation = await database.run(() =>
				withAiRuntime(runtime, () => operationService.start("alice", request("alice", "failed-copy"))),
			);
			await database.run(() => withAiRuntime(runtime, () => runAiOperations()));
			expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
				state: "failed",
				resultId: null,
			});
			expect(
				(await database.admin().query("SELECT count(*)::int AS n FROM resume WHERE base_resume_id='cv-alice'")).rows[0]
					.n,
			).toBe(0);
			expect(
				(
					await database
						.admin()
						.query("SELECT kind FROM ai_usage_ledger WHERE operation_id=$1 ORDER BY kind", [operation.id])
				).rows,
			).toEqual([{ kind: "release" }, { kind: "reserve" }]);
			expect((await run(() => usageService.getStartUsage("alice"))).operations).toEqual({
				limit: 5,
				used: 0,
				reserved: 0,
				remaining: 5,
			});
		} finally {
			await database
				.admin()
				.query(
					"DROP TRIGGER reject_synthetic_copy_version ON resume_version; DROP FUNCTION reject_synthetic_copy_version()",
				);
		}
	});
	it("releases the platform reservation for definitive rejections across bounded retries", async () => {
		let calls = 0;
		const runtime = {
			...syntheticRuntime,
			routes: [{ ...syntheticRoute, maxCalls: 2, maxCallCostMicros: 5000 }],
			fetch: () => {
				calls++;
				return Promise.resolve(new Response("", { status: 503 }));
			},
		};
		const operation = await database.run(() =>
			withAiRuntime(runtime, () => operationService.start("alice", request("alice", "unknown-cost"))),
		);
		await database.run(() => withAiRuntime(runtime, () => runAiOperations()));
		expect(calls).toBe(2);
		expect(
			(
				await database
					.admin()
					.query("SELECT actual_micros,reserved_micros::int FROM ai_operation WHERE id=$1", [operation.id])
			).rows,
		).toEqual([{ actual_micros: "0", reserved_micros: 0 }]);
		expect((await run(() => usageService.getStartUsage("alice"))).operations.used).toBe(0);
	});
	it("makes no provider call when consent is revoked while preparing its input", async () => {
		const review = syntheticRuntime.handlers.review;
		const transport = syntheticRuntime.fetch;
		if (!review || !transport) throw new Error("Missing synthetic handler or transport");
		let calls = 0;
		const runtime = {
			...syntheticRuntime,
			handlers: {
				review: {
					...review,
					buildInput: async (...args: Parameters<typeof review.buildInput>) => {
						await database.admin().query("UPDATE ai_processing_consent SET revoked_at=now() WHERE id='consent-alice'");
						return review.buildInput(...args);
					},
				},
			},
			fetch: (...args: Parameters<typeof fetch>) => {
				calls++;
				return transport(...args);
			},
		};
		try {
			const operation = await database.run(() =>
				withAiRuntime(runtime, () => operationService.start("alice", request("alice", "preparation-revoked"))),
			);
			await database.run(() => withAiRuntime(runtime, () => runAiOperations()));
			expect(calls).toBe(0);
			expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
				state: "failed",
				resultId: null,
			});
		} finally {
			await database.admin().query("UPDATE ai_processing_consent SET revoked_at=NULL WHERE id='consent-alice'");
		}
	});
	it("makes no provider call if input preparation consumes the operation deadline", async () => {
		const review = syntheticRuntime.handlers.review;
		const transport = syntheticRuntime.fetch;
		if (!review || !transport) throw new Error("Missing synthetic handler or transport");
		let calls = 0;
		const now = Date.now();
		const clock = vi.spyOn(Date, "now");
		const runtime = {
			...syntheticRuntime,
			routes: [{ ...syntheticRoute, deadlineMs: 1000 }],
			handlers: {
				review: {
					...review,
					buildInput: async (...args: Parameters<typeof review.buildInput>) => {
						clock.mockReturnValue(now + 2000);
						return review.buildInput(...args);
					},
				},
			},
			fetch: (...args: Parameters<typeof fetch>) => {
				calls++;
				return transport(...args);
			},
		};
		try {
			const operation = await database.run(() =>
				withAiRuntime(runtime, () => operationService.start("alice", request("alice", "input-deadline"))),
			);
			await database.run(() => withAiRuntime(runtime, () => runAiOperations()));
			expect(calls).toBe(0);
			expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
				state: "failed",
				failureCode: "AI_DEADLINE",
				resultId: null,
			});
		} finally {
			clock.mockRestore();
		}
	});
});
