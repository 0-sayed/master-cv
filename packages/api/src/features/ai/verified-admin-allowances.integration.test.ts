import type { OperationRequest } from "@reactive-resume/schema/ai-operation";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { withDatabaseOwner, withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { resume } from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { startUsageViewSchema } from "@reactive-resume/schema/ai-usage";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { coverLetterService } from "../cover-letters/service";
import { resumeService } from "../resume/service";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRuntime } from "./testing/runtime";
import { admitResumeCreation, usageService } from "./usage";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("verified administrator allowances", () => {
	const database = aiTestDatabase();
	const run = <T>(owner: string, work: () => T) =>
		database.run(() =>
			withAiRuntime({ ...syntheticRuntime, localOwnerAllowance: { ownerId: owner, limit: 2 } }, () =>
				withDatabaseOwner(owner, work),
			),
		);
	beforeAll(async () => {
		await database.admin().query(`
			INSERT INTO "user"(id,name,email,email_verified,username,display_username,role) VALUES
			('admin-development','Owner',' Owner@Example.TEST ',true,'owner-development','owner-development','user'),
			('admin-production','Owner','production@example.test',true,'owner-production','owner-production','user'),
			('ordinary','Ordinary','ordinary@example.test',true,'ordinary','ordinary','admin'),
			('unverified','Unverified','unverified@example.test',false,'unverified','unverified','admin');
			INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency)
			VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2);
		`);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});
	function configureAdmins() {
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue([
			"owner@example.test",
			"production@example.test",
			"unverified@example.test",
		]);
	}
	const create = (owner: string, name: string, creation?: { variantKind: "language" | "job"; baseResumeId: string }) =>
		run(owner, () =>
			resumeService.create({ userId: owner, name, locale: "en-US", tags: [], ...(creation ? { creation } : {}) }),
		);
	async function request(cv: string, key: string): Promise<OperationRequest> {
		const { rows } = await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [cv]);
		return {
			requestKey: key,
			kind: "review",
			sources: [{ kind: "resume", id: cv, revision: rows[0].updated_at.toISOString() }],
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
			parameters: {},
		};
	}
	async function grantConsent(owner: string) {
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ($1,$1,'synthetic','1','1','review','1')",
				[owner],
			);
	}
	it.each(["development", "production"])(
		"admits admins beyond document and AI allowances in %s, with durable spend",
		async (mode) => {
			configureAdmins();
			vi.stubEnv("NODE_ENV", mode);
			const owner = `admin-${mode}`;
			const cv = await create(owner, "First base");
			await create(owner, "Second base");
			for (const variantKind of ["language", "job"] as const) {
				await create(owner, `First ${variantKind}`, { variantKind, baseResumeId: cv });
				await create(owner, `Second ${variantKind}`, { variantKind, baseResumeId: cv });
			}
			for (let i = 0; i < 2; i++)
				await run(owner, () => coverLetterService.create({ userId: owner, name: `Letter ${i}` }));
			await grantConsent(owner);
			for (let i = 0; i < 6; i++) {
				const input = await request(cv, `${owner}-${i}`);
				const operation = await run(owner, () => operationService.start(owner, input));
				await run(owner, () => runAiOperations());
				expect(await run(owner, () => operationService.get(owner, operation.id))).toMatchObject({
					state: "waiting_review",
				});
			}
			const usage = await run(owner, () => usageService.getStartUsage(owner));
			expect(startUsageViewSchema.parse(usage)).toEqual({
				plan: "start",
				operations: { limit: null, remaining: null, used: 6, reserved: 0 },
				baseCvs: { limit: null, used: 2 },
			});
			expect(
				(
					await database
						.admin()
						.query(
							"SELECT kind,count(*)::int AS count FROM ai_usage_ledger WHERE user_id=$1 GROUP BY kind ORDER BY kind",
							[owner],
						)
				).rows,
			).toEqual([
				{ kind: "reserve", count: 6 },
				{ kind: "settle", count: 6 },
			]);
			expect(
				(
					await database
						.admin()
						.query(
							"SELECT count(*)::int AS count,sum(cost_micros)::int AS cost FROM ai_operation_attempt WHERE user_id=$1",
							[owner],
						)
				).rows,
			).toEqual([{ count: 6, cost: 60 }]);
			await database.admin().query('UPDATE "user" SET email_verified=false WHERE id=$1', [owner]);
			const revoked = await run(owner, () => usageService.getStartUsage(owner));
			expect(startUsageViewSchema.parse(revoked).operations.remaining).toBe(0);
			await expect(create(owner, "Denied after verification removal")).rejects.toMatchObject({
				data: { reason: "BASE_CV_LIMIT" },
			});
		},
	);
	it.each(["ordinary", "unverified"])("keeps allowances for %s despite its stored admin role", async (owner) => {
		configureAdmins();
		vi.stubEnv("NODE_ENV", "production");
		const cv = await create(owner, "Only base");
		await expect(create(owner, "Denied base")).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
		for (const variantKind of ["language", "job"] as const) {
			await create(owner, `First ${variantKind}`, { variantKind, baseResumeId: cv });
			await expect(create(owner, `Denied ${variantKind}`, { variantKind, baseResumeId: cv })).rejects.toMatchObject({
				data: { reason: variantKind === "language" ? "LANGUAGE_COPY_LIMIT" : "JOB_COPY_LIMIT" },
			});
		}
		await grantConsent(owner);
		for (let i = 0; i < 5; i++) {
			const input = await request(cv, `${owner}-${i}`);
			await run(owner, () => operationService.start(owner, input));
			await run(owner, () => runAiOperations());
		}
		const input = await request(cv, `${owner}-denied`);
		await expect(run(owner, () => operationService.start(owner, input))).rejects.toMatchObject({
			data: { reason: "AI_OPERATIONS_LIMIT" },
		});
		expect((await run(owner, () => usageService.getStartUsage(owner))).operations).toEqual({
			limit: 5,
			used: 5,
			remaining: 0,
			reserved: 0,
		});
	});
});

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("verified admin allowances", () => {
	const database = aiTestDatabase();
	const run = <T>(work: () => T) =>
		database.run(() =>
			withAiRuntime(
				{
					...syntheticRuntime,
					localOwnerAllowance: { ownerId: "alice", limit: 1 },
				},
				work,
			),
		);
	let revision: string;
	beforeAll(async () => {
		await database.admin().query(`UPDATE "user" SET email='Owner@Example.TEST',email_verified=true WHERE id='alice'`);
		await database.admin().query(`UPDATE "user" SET email_verified=true,role='admin' WHERE id='bob'`);
		await database
			.admin()
			.query(
				"INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv','alice','Synthetic','cv','{}'),('bob-cv','bob','Synthetic','cv','{}')",
			);
		revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv'")
		).rows[0].updated_at.toISOString();
		await database
			.admin()
			.query(
				"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent','alice','synthetic','1','1','review','1'),('bob-consent','bob','synthetic','1','1','review','1')",
			);
		await database
			.admin()
			.query(
				"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
			);
	});
	afterEach(() => vi.restoreAllMocks());
	const request = (requestKey: string, id = "cv", sourceRevision = revision) => ({
		requestKey,
		kind: "review",
		sources: [{ kind: "resume" as const, id, revision: sourceRevision }],
		route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
		parameters: {},
	});

	it("delivers seven operations beyond the free and local quotas with durable spend", async () => {
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
		await run(async () => {
			for (let index = 0; index < 7; index++) {
				const operation = await operationService.start("alice", request(`admin-${index}`));
				await runAiOperations();
				expect(await operationService.get("alice", operation.id)).toMatchObject({ state: "waiting_review" });
			}
			expect(startUsageViewSchema.parse(await usageService.getStartUsage("alice"))).toMatchObject({
				operations: { limit: null, remaining: null, used: 7, reserved: 0 },
				baseCvs: { limit: null, used: 1 },
			});
		});
		expect(
			(
				await database
					.admin()
					.query(
						"SELECT kind,count(*)::int AS count FROM ai_usage_ledger WHERE user_id='alice' GROUP BY kind ORDER BY kind",
					)
			).rows,
		).toEqual([
			{ kind: "reserve", count: 7 },
			{ kind: "settle", count: 7 },
		]);
		expect(
			(await database.admin().query("SELECT sum(actual_micros)::int AS spent FROM ai_operation WHERE user_id='alice'"))
				.rows,
		).toEqual([{ spent: 70 }]);
		expect(
			(await database.admin().query("SELECT spent_micros::int AS spent FROM ai_platform_budget WHERE id='budget'"))
				.rows,
		).toEqual([{ spent: 70 }]);
	});

	it("allows multiple base, language and job documents while preserving owner checks", async () => {
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
		await run(() =>
			withOwnerDatabase("alice", async (tx) => {
				for (const variantKind of ["base", "language", "job"] as const) {
					for (let index = 0; index < 2; index++) {
						await admitResumeCreation(
							tx,
							"alice",
							variantKind === "base" ? { variantKind } : { variantKind, baseResumeId: "cv" },
						);
						await tx.insert(resume).values({
							userId: "alice",
							name: "Synthetic",
							slug: `${variantKind}-${index}`,
							data: defaultResumeData,
							variantKind,
							baseResumeId: variantKind === "base" ? null : "cv",
						});
					}
				}
			}),
		);
		await expect(
			run(() =>
				withOwnerDatabase("alice", (tx) =>
					admitResumeCreation(tx, "alice", { variantKind: "job", baseResumeId: "bob-cv" }),
				),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("rechecks verification and email after each request", async () => {
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
		for (const change of ["email_verified=false", "email_verified=true,email='changed@example.test'"]) {
			await database.admin().query(`UPDATE "user" SET ${change} WHERE id='alice'`);
			await expect(run(() => operationService.start("alice", request(`denied-${change}`)))).rejects.toMatchObject({
				data: { reason: "AI_OPERATIONS_LIMIT" },
			});
			await expect(
				run(() => withOwnerDatabase("alice", (tx) => admitResumeCreation(tx, "alice", { variantKind: "base" }))),
			).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
		}
	});

	it("keeps normal users limited even when their legacy role says admin", async () => {
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
		const sourceRevision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='bob-cv'")
		).rows[0].updated_at.toISOString();
		await run(async () => {
			for (let index = 0; index < 5; index++) {
				await operationService.start("bob", request(`normal-${index}`, "bob-cv", sourceRevision));
				await runAiOperations();
			}
			await expect(
				operationService.start("bob", request("normal-denied", "bob-cv", sourceRevision)),
			).rejects.toMatchObject({ data: { reason: "AI_OPERATIONS_LIMIT" } });
		});
		await expect(
			run(() => withOwnerDatabase("bob", (tx) => admitResumeCreation(tx, "bob", { variantKind: "base" }))),
		).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
	});
});
