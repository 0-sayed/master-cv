import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { createProcedureClient } from "@orpc/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withDatabasePool } from "@reactive-resume/db/client";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

vi.mock("@reactive-resume/db/redis", () => ({ getRedis: () => null, redisKey: (key: string) => key }));

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("protected private streams", () => {
	const suffix = randomUUID().replaceAll("-", "");
	const name = `t003_stream_${suffix}`;
	const role = `t003_stream_runtime_${suffix}`;
	let admin: Pool;
	let fixture: Pool;
	let runtime: Pool;
	let router: typeof import("./event-router").updatesRouter;
	let letters: typeof import("../cover-letters/router").coverLettersRouter;
	const context = {
		locale: "en-US" as const,
		reqHeaders: new Headers(),
		authentication: {
			user: {
				id: "alice",
				name: "Alice",
				email: "alice@example.test",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			method: "session" as const,
			permissions: ["read", "write"] as const,
		},
	};
	beforeAll(async () => {
		const databaseURL = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!databaseURL) throw new Error("Disposable database admin connection required");
		const url = new URL(databaseURL);
		admin = new Pool({ connectionString: url.toString() });
		await admin.query(`CREATE DATABASE "${name}"`);
		url.pathname = `/${name}`;
		fixture = new Pool({ connectionString: url.toString() });
		await migrate(drizzle({ client: fixture }), {
			migrationsFolder: fileURLToPath(new URL("../../../../../migrations", import.meta.url)),
		});
		await fixture.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${suffix}' NOSUPERUSER NOBYPASSRLS NOINHERIT`);
		await fixture.query(
			`GRANT USAGE ON SCHEMA public TO "${role}"; GRANT SELECT ON ALL TABLES IN SCHEMA public TO "${role}"`,
		);
		await fixture.query(
			`INSERT INTO "user" (id,name,email,username,display_username,email_verified) VALUES ('alice','Alice','alice@example.test','alice','alice',true),('bob','Bob','bob@example.test','bob','bob',true)`,
		);
		await fixture.query(
			`INSERT INTO resume (id,user_id,name,slug,data) VALUES ('alice-resume','alice','Alice','a',$1),('bob-resume','bob','Bob','b',$1)`,
			[JSON.stringify(defaultResumeData)],
		);
		await fixture.query(`INSERT INTO cover_letter (id,user_id,name,style) VALUES ('alice-letter','alice','Alice',$1)`, [
			JSON.stringify({ ...defaultResumeData, sectionId: "letter", itemId: "body" }),
		]);
		url.username = role;
		url.password = suffix;
		runtime = new Pool({ connectionString: url.toString(), max: 2, connectionTimeoutMillis: 2000 });
		({ updatesRouter: router } = await import("./event-router"));
		({ coverLettersRouter: letters } = await import("../cover-letters/router"));
	}, 30_000);
	afterAll(async () => {
		await runtime?.end();
		await fixture?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
			await admin.query(`DROP ROLE IF EXISTS "${role}"`);
			await admin.end();
		}
	});
	it("starts an owner's private stream under the restricted role", async () => {
		await withDatabasePool(runtime, async () => {
			const subscribe = createProcedureClient(router.subscribe, { context });
			const iterator = await subscribe({ id: "alice-resume" });
			try {
				await expect(iterator.next()).resolves.toMatchObject({
					done: false,
					value: { type: "resume.updated", resumeId: "alice-resume", userId: "alice", mutation: "sync" },
				});
			} finally {
				await iterator.return?.();
			}
		});
	});
	it.each(["bob-resume", "missing-resume"])("denies a foreign or missing private stream: %s", async (id) => {
		await withDatabasePool(runtime, async () => {
			const subscribe = createProcedureClient(router.subscribe, { context });
			await expect(subscribe({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect((await runtime.query("SELECT id FROM resume")).rows).toEqual([]);
		});
	});
	it("reads an owned letter before reporting a missing draft source", async () => {
		await withDatabasePool(runtime, async () => {
			const draft = createProcedureClient(letters.draft, { context });
			const startDraft = async () => {
				const iterator = await draft({ id: "alice-letter", variant: "draft" });
				return iterator.next();
			};
			await expect(startDraft()).rejects.toMatchObject({
				code: "BAD_REQUEST",
				message: "Link the letter to a resume or an application first.",
			});
		});
	});
	it("delivers updates without an open transaction and releases its listener on cancellation", async () => {
		await withDatabasePool(runtime, async () => {
			const controller = new AbortController();
			const subscribe = createProcedureClient(router.subscribe, { context });
			const iterator = await subscribe({ id: "alice-resume" }, { signal: controller.signal });
			try {
				await iterator.next();
				const updated = iterator.next();
				await expect
					.poll(async () => {
						const result = await fixture.query(
							"SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename=$1 AND query='LISTEN resume_updated' AND state='idle'",
							[role],
						);
						return result.rows[0]?.count;
					})
					.toBe(1);
				expect(
					(
						await fixture.query(
							"SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename=$1 AND xact_start IS NOT NULL",
							[role],
						)
					).rows,
				).toEqual([{ count: 0 }]);
				const event = {
					type: "resume.updated",
					resumeId: "alice-resume",
					userId: "alice",
					updatedAt: "2026-11-09T00:00:00.000Z",
					mutation: "patch",
				};
				await fixture.query("SELECT pg_notify('resume_updated', $1)", [JSON.stringify(event)]);
				await expect(updated).resolves.toEqual({ done: false, value: event });
				const pending = iterator.next();
				controller.abort();
				await expect(pending).resolves.toMatchObject({ done: true });
				await expect.poll(() => runtime.idleCount).toBe(runtime.totalCount);
				expect((await runtime.query("SELECT id FROM resume")).rows).toEqual([]);
			} finally {
				controller.abort();
				await iterator.return?.();
			}
		});
	});
});
