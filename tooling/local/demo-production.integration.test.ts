import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { careerService } from "@reactive-resume/api/features/career/service";
import { db, withDatabasePool, withOwnerDatabase } from "@reactive-resume/db/client";
import { provisionRuntimeRole } from "@reactive-resume/db/runtime-role";
import * as tables from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { demoFixture } from "./demo-fixture";
import { seedProductionDemoWorkspace } from "./demo-production";

const suffix = randomUUID().replaceAll("-", "");
const databaseName = `production_demo_${suffix}`;
const role = `production_demo_runtime_${suffix}`;
function isolatedTestDatabaseUrl(value: string) {
	const url = new URL(value);
	if (url.hostname === "localhost") url.hostname = "127.0.0.1";
	return url;
}

it("uses an allowed loopback hostname for the CI test database", () => {
	expect(isolatedTestDatabaseUrl("postgresql://postgres:postgres@localhost:55432/postgres").hostname).toBe("127.0.0.1");
});

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("restricted production demo seed", () => {
	let admin: Pool;
	let fixture: Pool;
	let runtime: Pool;
	const scoped = <T>(work: () => Promise<T>) => withDatabasePool(runtime, work);
	beforeAll(async () => {
		const url = isolatedTestDatabaseUrl(process.env.COVER_LETTER_TEST_DATABASE_URL ?? "");
		admin = new Pool({ connectionString: url.toString(), max: 1 });
		await admin.query(`CREATE DATABASE "${databaseName}"`);
		url.pathname = `/${databaseName}`;
		fixture = new Pool({ connectionString: url.toString(), max: 2 });
		await migrate(drizzle({ client: fixture }), {
			migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)),
		});
		const runtimeUrl = await provisionRuntimeRole(url.toString(), role);
		vi.stubEnv("DATABASE_URL", runtimeUrl);
		vi.stubEnv("APP_URL", "http://127.0.0.1:23100");
		vi.stubEnv("NODE_ENV", "test");
		runtime = new Pool({ connectionString: runtimeUrl, max: 3 });
	}, 60000);
	afterAll(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		await runtime?.end();
		await fixture?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
			await admin.query(`DROP ROLE IF EXISTS "${role}"`);
			await admin.end();
		}
	});
	it(
		"seeds only the confirmed production owner atomically, with no inference and no admin role",
		async () =>
			scoped(async () => {
				const email = "production-demo@example.test";
				vi.stubEnv("NODE_ENV", "production");
				vi.stubEnv("PERSONAL_CAREER_TOOLS_RELEASE_APPROVED", "true");
				vi.stubEnv("OPENROUTER_API_KEY", "synthetic-unused-key");
				vi.spyOn(env, "OPENROUTER_API_KEY", "get").mockReturnValue("synthetic-unused-key");
				const environment = {
					...process.env,
					NODE_ENV: "production",
					APP_URL: "https://sirawise.io",
					STORAGE_BACKEND: "local",
					DEMO_ACCOUNT_EMAIL: email,
					DEMO_ACCOUNT_PASSWORD: "Private-production-demo-2026!",
					DEMO_PRODUCTION_CONFIRM: email,
					ADMIN_EMAILS: email,
					OPENROUTER_API_KEY: "synthetic-unused-key",
				};
				const allowlist = vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue([email]);
				const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("INFERENCE_FORBIDDEN"));
				const otherId = randomUUID();
				const otherEmail = "existing-owner@example.test";
				await fixture.query('insert into "user" (id,name,email,username,display_username) values ($1,$2,$3,$1,$1)', [
					otherId,
					"Untouched owner",
					otherEmail,
				]);
				await withOwnerDatabase(otherId, async (tx) => {
					await tx
						.insert(tables.resume)
						.values({ userId: otherId, name: "Private existing CV", slug: otherId, data: demoFixture.resumes[0] });
				});
				const otherBefore = (await fixture.query("select to_jsonb(r) as row from resume r where user_id=$1", [otherId]))
					.rows;
				const before = (await fixture.query('select to_jsonb(u) as row from "user" u order by id')).rows;
				const failure = vi
					.spyOn(careerService, "saveStory")
					.mockRejectedValueOnce(new Error("PRODUCTION_SEED_FAILURE"));
				await expect(seedProductionDemoWorkspace(environment)).rejects.toThrow("PRODUCTION_SEED_FAILURE");
				failure.mockRestore();
				expect((await fixture.query('select to_jsonb(u) as row from "user" u order by id')).rows).toEqual(before);
				const result = await seedProductionDemoWorkspace(environment);
				expect(result).toMatchObject({ status: "created", resumes: 15, letters: 11, applications: 20, trash: 2 });
				const saved = (await fixture.query('select * from "user" where email=$1', [email])).rows[0];
				expect(saved).toMatchObject({ role: "user", email_verified: true });
				const credential = (await fixture.query("select password from account where user_id=$1", [saved.id])).rows[0];
				const { auth } = await import("@reactive-resume/auth/config");
				expect(
					await (
						await auth.$context
					).password.verify({ password: environment.DEMO_ACCOUNT_PASSWORD, hash: credential.password }),
				).toBe(true);
				const { createDemoClient } = await import("./demo-account");
				const [demoUser] = await db
					.select()
					.from(tables.user)
					.where(sql`id = ${saved.id}`);
				if (!demoUser) throw new Error("Missing production demo owner");
				expect((await createDemoClient(demoUser, environment.APP_URL).ai.usage.get({})).operations.limit).toBeNull();
				const contentBefore = (
					await fixture.query("select to_jsonb(r) as row from resume r where user_id=$1 order by id", [saved.id])
				).rows;
				await fixture.query('update "user" set ui_locale=$1, timezone=$2 where id=$3', [
					"en-US",
					"Europe/London",
					saved.id,
				]);
				const identityBefore = (await fixture.query('select to_jsonb(u) as row from "user" u where id=$1', [saved.id]))
					.rows;
				expect(await seedProductionDemoWorkspace(environment)).toMatchObject({ ...result, status: "skipped" });
				expect((await fixture.query('select to_jsonb(u) as row from "user" u where id=$1', [saved.id])).rows).toEqual(
					identityBefore,
				);
				expect(
					(await fixture.query("select to_jsonb(r) as row from resume r where user_id=$1 order by id", [saved.id]))
						.rows,
				).toEqual(contentBefore);
				expect(
					(await fixture.query('select to_jsonb(u) as row from "user" u where id<>$1 order by id', [saved.id])).rows,
				).toEqual(before);
				await expect(
					seedProductionDemoWorkspace({
						...environment,
						DEMO_ACCOUNT_EMAIL: otherEmail,
						DEMO_PRODUCTION_CONFIRM: otherEmail,
						ADMIN_EMAILS: `${email},${otherEmail}`,
					}),
				).rejects.toThrow("DEMO_ACCOUNT_NOT_EMPTY");
				expect(
					(await fixture.query("select to_jsonb(r) as row from resume r where user_id=$1", [otherId])).rows,
				).toEqual(otherBefore);
				expect(
					(await fixture.query('select to_jsonb(u) as row from "user" u where id<>$1 order by id', [saved.id])).rows,
				).toEqual(before);
				const emptyId = randomUUID();
				const emptyEmail = "empty-demo@example.test";
				await fixture.query('insert into "user" (id,name,email,username,display_username) values ($1,$2,$3,$1,$1)', [
					emptyId,
					"Empty owner",
					emptyEmail,
				]);
				allowlist.mockReturnValue([email, emptyEmail]);
				const adopted = await seedProductionDemoWorkspace({
					...environment,
					DEMO_ACCOUNT_EMAIL: emptyEmail,
					DEMO_PRODUCTION_CONFIRM: emptyEmail,
					ADMIN_EMAILS: `${email},${emptyEmail}`,
				});
				expect(adopted).toMatchObject({
					status: "created",
					userId: emptyId,
					resumes: 15,
					letters: 11,
					applications: 20,
				});
				for (const table of ["ai_operation", "ai_usage_ledger"])
					expect(
						Number((await fixture.query(`select count(*) from ${table} where user_id=$1`, [saved.id])).rows[0].count),
					).toBe(0);
				expect(fetchSpy).not.toHaveBeenCalled();
				fetchSpy.mockRestore();
				allowlist.mockRestore();
			}),
		60000,
	);
});
