import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { careerService } from "@reactive-resume/api/features/career/service";
import { db, withDatabasePool, withOwnerDatabase } from "@reactive-resume/db/client";
import { provisionRuntimeRole } from "@reactive-resume/db/runtime-role";
import * as tables from "@reactive-resume/db/schema";
import { ensureDemoAccount, createDemoClient } from "./demo-account";
import { createDemoFixture, demoCredentials, demoFixture } from "./demo-fixture";
import { createOwnerDemoJobCopyAdmission, populateDemoWorkspace, seedDemoWorkspace } from "./demo-seed.ts";

const suffix = randomUUID().replaceAll("-", "");
const databaseName = `demo_seed_${suffix}`;
const role = `demo_runtime_${suffix}`;

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("restricted local demo seed", () => {
	let admin: Pool;
	let fixture: Pool;
	let runtime: Pool;
	const scoped = <T>(work: () => Promise<T>) => withDatabasePool(runtime, work);
	beforeAll(async () => {
		const url = new URL(process.env.COVER_LETTER_TEST_DATABASE_URL ?? "");
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
		"rolls back failed content, retries, preserves edits and isolates other owners",
		async () =>
			scoped(async () => {
				const socketSpy = vi.spyOn(Socket.prototype, "connect");
				const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("REMOTE_FETCH_FORBIDDEN"));
				const otherId = randomUUID();
				await fixture.query(
					'insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)',
					[otherId, "Other fictional owner", `${otherId}@example.test`],
				);
				const otherResumeId = await withOwnerDatabase(otherId, async () => {
					const [row] = await db
						.insert(tables.resume)
						.values({ userId: otherId, name: "Untouched fixture", slug: otherId, data: demoFixture.resumes[0] })
						.returning({ id: tables.resume.id });
					if (!row) throw new Error("Missing other resume");
					return row.id;
				});
				const otherBefore = await fixture.query("select to_jsonb(r) as row from resume r where id=$1", [otherResumeId]);
				const failure = vi
					.spyOn(careerService, "saveStory")
					.mockRejectedValueOnce(new Error("INJECTED_POPULATION_FAILURE"));
				await expect(seedDemoWorkspace()).rejects.toThrow("INJECTED_POPULATION_FAILURE");
				failure.mockRestore();
				const { user } = await ensureDemoAccount();
				const counts = async () =>
					withOwnerDatabase(user.id, async () => {
						const result: Record<string, number> = {};
						for (const [name, table] of Object.entries({
							resumes: tables.resume,
							letters: tables.coverLetter,
							applications: tables.application,
							facts: tables.careerFact,
							stories: tables.careerStory,
							jobs: tables.jobTarget,
							profile: tables.careerProfile,
						})) {
							const [row] = await db.select({ value: count() }).from(table);
							result[name] = Number(row?.value ?? 0);
						}
						return result;
					});
				expect(Object.values(await counts()).every((value) => value === 0)).toBe(true);
				await expect(
					withOwnerDatabase(user.id, async () => {
						await careerService.saveProfile(user.id, demoFixture.profile);
						const partial = await careerService.profile(user.id);
						await expect(seedDemoWorkspace()).rejects.toThrow("DEMO_PARTIAL_CONTENT");
						expect(await careerService.profile(user.id)).toEqual(partial);
						throw new Error("ROLL_BACK_PARTIAL_TEST");
					}),
				).rejects.toThrow("ROLL_BACK_PARTIAL_TEST");

				const now = new Date("2026-11-19T09:00:00Z");
				expect(await seedDemoWorkspace({ now })).toMatchObject({
					status: "created",
					resumes: 15,
					letters: 11,
					applications: 20,
				});
				const client = createDemoClient(user, "http://127.0.0.1:23100");
				const trash = await client.documents.list({ trashed: true });
				expect(trash).toHaveLength(2);
				expect(trash.map((item) => item.type).sort()).toEqual(["letter", "letter"]);
				expect(
					new Set(trash.map((item) => Math.floor((now.getTime() - (item.trashedAt?.getTime() ?? 0)) / 86400000))).size,
				).toBe(2);
				for (const item of trash) expect(now.getTime() - (item.trashedAt?.getTime() ?? 0)).toBeLessThan(3 * 86400000);
				for (const type of ["letter"] as const) {
					const item = trash.find((item) => item.type === type);
					if (!item) throw new Error("Missing trashed document");
					await client.documents.restore({ id: item.id, type });
					expect((await client.documents.list({ trashed: false })).some((doc) => doc.id === item.id)).toBe(true);
					await client.documents.trash({ id: item.id, type });
					await client.documents.purge({ id: item.id, type });
					await expect(client.documents.restore({ id: item.id, type })).rejects.toMatchObject({ code: "NOT_FOUND" });
				}
				const { auth: seedAuth } = await import("@reactive-resume/auth/config");
				const authContext = await seedAuth.$context;
				const demoUser = (await ensureDemoAccount()).user;
				await authContext.internalAdapter.createSession(demoUser.id);
				const otherSession = await authContext.internalAdapter.createSession(otherId);
				expect((await authContext.internalAdapter.listSessions(demoUser.id)).length).toBeGreaterThan(0);
				await seedDemoWorkspace({ reset: true, now });
				expect(await authContext.internalAdapter.listSessions(demoUser.id)).toHaveLength(0);
				expect(await authContext.internalAdapter.listSessions(otherId)).toEqual(
					expect.arrayContaining([expect.objectContaining({ id: otherSession.id })]),
				);
				expect(await client.documents.counts()).toEqual({ resume: 15, letter: 11, trash: 2 });
				const master = await client.career.master.read({});
				const storedFacts = await fixture.query("select text, structured from career_fact where user_id=$1", [user.id]);
				expect(JSON.stringify(storedFacts.rows).match(/<\/?[a-z][^>]*>/i)?.[0]).toBeUndefined();
				expect(master.facts.length).toBeGreaterThan(30);
				expect(master.facts.every((fact) => fact.confirmation === "confirmed" && fact.revision >= 1)).toBe(true);
				const narrative = await withOwnerDatabase(user.id, () =>
					careerService.facts({ userId: user.id, applicationId: null, all: true }),
				);
				expect(narrative.filter((fact) => !fact.structured)).toHaveLength(16);
				expect(await counts()).toMatchObject({
					resumes: 15,
					letters: 13,
					applications: 20,
					stories: 8,
					jobs: 8,
					profile: 1,
				});
				const resumes = await client.resume.list({});
				for (const showcase of demoFixture.showcaseResumes) {
					const saved = resumes.find((resume) => resume.name === showcase.name);
					expect(saved).toBeDefined();
					if (!saved) throw new Error("Missing showcase CV");
					expect((await client.resume.getById({ id: saved.id })).data).toEqual(showcase.data);
				}
				const first = resumes[0];
				if (!first) throw new Error("Missing demo resume");
				const current = await client.resume.getById({ id: first.id });
				await client.resume.update({ id: first.id, name: "Owner edited title", expectedUpdatedAt: current.updatedAt });
				const snapshot = await fixture.query(
					"select (select jsonb_agg(r order by r.id) from resume r) as resumes, (select jsonb_agg(r order by r.id) from resume_version r) as revisions",
				);
				expect(await seedDemoWorkspace()).toMatchObject({
					status: "skipped",
					resumes: 15,
					letters: 11,
					applications: 20,
				});
				expect(
					(
						await fixture.query(
							"select (select jsonb_agg(r order by r.id) from resume r) as resumes, (select jsonb_agg(r order by r.id) from resume_version r) as revisions",
						)
					).rows,
				).toEqual(snapshot.rows);
				expect(await db.select().from(tables.resume)).toEqual([]);

				await expect(client.resume.getById({ id: otherResumeId })).rejects.toMatchObject({ code: "NOT_FOUND" });
				const beforeFailedReset = await counts();
				const resetFailure = vi
					.spyOn(careerService, "saveStory")
					.mockRejectedValueOnce(new Error("RESET_POPULATION_FAILURE"));
				await expect(seedDemoWorkspace({ reset: true, now })).rejects.toThrow("RESET_POPULATION_FAILURE");
				resetFailure.mockRestore();
				expect(await counts()).toEqual(beforeFailedReset);
				expect((await client.resume.getById({ id: first.id })).name).toBe("Owner edited title");
				await seedDemoWorkspace({ reset: true, now });
				expect(await seedDemoWorkspace()).toMatchObject({
					status: "skipped",
					resumes: 15,
					letters: 11,
					applications: 20,
				});
				const currentFiles = await fixture.query(
					"select key from stored_file where user_id=$1 and revoked_at is null",
					[user.id],
				);
				const oldKeys = currentFiles.rows.map((row: { key: string }) => row.key);
				expect(oldKeys.length).toBeGreaterThan(0);
				const effects: import("./demo-seed.ts").DemoSeedEffects = { commit: [], rollback: [] };
				await populateDemoWorkspace(user, "http://127.0.0.1:23100", await createOwnerDemoJobCopyAdmission(user.id), {
					reset: true,
					now,
					effects,
				});
				const deleteWork = await fixture.query(
					"select payload->>'key' as key, status from privacy_work where user_id=$1 and key like 'file-delete:%'",
					[user.id],
				);
				const scheduled = deleteWork.rows.filter((row: { key: string; status: string }) => oldKeys.includes(row.key));
				expect(scheduled).toHaveLength(oldKeys.length);
				expect(scheduled.every((row: { status: string }) => row.status === "queued")).toBe(true);
				const afterReset = await fixture.query("select count(*)::int as n from resume where user_id=$1", [user.id]);
				expect(afterReset.rows[0].n).toBe(15);
				expect(
					(await fixture.query("select to_jsonb(r) as row from resume r where id=$1", [otherResumeId])).rows,
				).toEqual(otherBefore.rows);
				const apps = await client.applications.list({});
				expect(apps.filter((application) => application.status !== "saved" && application.resumeId)).toHaveLength(16);
				expect(apps.filter((application) => application.status === "saved" && application.resumeId)).toHaveLength(2);
				expect(apps.filter((application) => application.coverLetterId)).toHaveLength(8);
				const documents = await client.documents.list({ trashed: false });
				const scenarios = createDemoFixture(now).applicationScenarios;
				for (const scenario of scenarios) {
					const application = apps.find((row) => row.company === scenario.input.company);
					expect(application).toBeDefined();
					const stages = application?.activity
						.filter((entry) => entry.type === "stage")
						.sort((a, b) => a.at.getTime() - b.at.getTime());
					expect(stages?.map((entry) => entry.stage)).toEqual(scenario.history.map((entry) => entry.stage));
					expect(stages?.every((entry) => entry.at <= now)).toBe(true);
					expect(stages?.map((entry) => entry.at.toISOString())).toEqual(
						scenario.history.map((entry) => entry.at.toISOString()),
					);
					if (scenario.resumeGroup === "tailored")
						expect(documents.find((row) => row.id === application?.resumeId)?.application?.id).toBe(application?.id);
				}
				const sent = apps.filter((row) =>
					row.activity.some((entry) => entry.type === "stage" && entry.stage === "applied"),
				);
				const replies = sent.flatMap((row) => {
					const stages = row.activity
						.filter((entry) => entry.type === "stage")
						.sort((a, b) => a.at.getTime() - b.at.getTime());
					const applied = stages.find((entry) => entry.stage === "applied");
					const reply = stages.find(
						(entry) =>
							["screening", "interview", "offer"].includes(entry.stage) ||
							(entry.stage === "closed" && row.closedReason === "not-selected"),
					);
					return applied && reply ? [{ id: row.id, days: (reply.at.getTime() - applied.at.getTime()) / 86400000 }] : [];
				});
				expect(sent).toHaveLength(18);
				expect(replies).toHaveLength(11);
				expect(Math.round((replies.length / sent.length) * 100)).toBe(61);
				expect(replies.map((row) => row.days).sort((a, b) => a - b)).toEqual([2, 3, 4, 4, 5, 6, 6, 7, 8, 10, 12]);
				expect(replies.map((row) => row.days).sort((a, b) => a - b)[5]).toBe(6);
				expect(
					["applied", "screening", "interview", "offer"].map(
						(stage) =>
							sent.filter((row) => row.activity.some((entry) => entry.type === "stage" && entry.stage === stage))
								.length,
					),
				).toEqual([18, 10, 6, 2]);
				const sources = Object.fromEntries(
					[...new Set(apps.map((row) => row.source))].map((source) => [
						source ?? "Not recorded",
						apps.filter((row) => row.source === source).length,
					]),
				);
				expect(sources).toEqual({
					LinkedIn: 7,
					"Company website · careers page": 4,
					Bayt: 3,
					"إحالة من زميل سابق في فريق العمل": 3,
					"Recruiter · direct outreach": 1,
					"معرض التوظيف بجامعة الملك سعود": 1,
					"Not recorded": 1,
				});
				const firstWeek = new Date("2026-09-26T21:00:00Z").getTime();
				expect(
					Array.from(
						{ length: 8 },
						(_, i) =>
							sent.filter((row) => Math.floor((row.appliedAt.getTime() - firstWeek) / (7 * 86400000)) === i).length,
					),
				).toEqual([1, 2, 1, 3, 2, 4, 3, 2]);
				const tailored = sent.filter((row) =>
					documents.some(
						(document) =>
							document.type === "resume" && document.id === row.resumeId && document.application?.id === row.id,
					),
				);
				const base = sent.filter((row) => row.resumeId && !tailored.includes(row));
				expect([
					tailored.length,
					tailored.filter((row) => replies.some((reply) => reply.id === row.id)).length,
				]).toEqual([11, 8]);
				expect([base.length, base.filter((row) => replies.some((reply) => reply.id === row.id)).length]).toEqual([
					5, 3,
				]);
				expect(sent.filter((row) => !row.resumeId)).toHaveLength(2);
				const upcoming = apps.flatMap((row) =>
					row.activity.filter((entry) => entry.type === "interview" && entry.at > now).map((entry) => ({ row, entry })),
				);
				expect(upcoming).toHaveLength(10);
				const appointmentDates = upcoming.map(({ entry }) =>
					new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(entry.at),
				);
				expect(
					Object.fromEntries(
						[...new Set(appointmentDates)]
							.sort()
							.map((date) => [date, appointmentDates.filter((value) => value === date).length]),
					),
				).toEqual({
					"2026-11-20": 4,
					"2026-11-21": 2,
					"2026-11-23": 1,
					"2026-11-25": 1,
					"2026-12-05": 1,
					"2026-12-12": 1,
				});
				for (const { row, entry } of upcoming) {
					expect(["screening", "interview"]).toContain(row.status);
					expect(
						row.activity
							.filter((event) => event.type === "stage")
							.every((event) => event.at <= now && event.at < entry.at),
					).toBe(true);
				}
				await expect(
					client.resume.create({ name: "Another base", tags: [], locale: "ar-SA", empty: true, withSampleData: false }),
				).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
				const baseResume = documents.find((row) => row.type === "resume" && !row.application);
				if (!baseResume) throw new Error("Missing base resume");
				await expect(client.documents.copyForJob({ resumeId: baseResume.id })).rejects.toMatchObject({
					data: { reason: "JOB_COPY_LIMIT" },
				});
				expect(new Set(apps.flatMap((application) => application.activity.map((entry) => entry.type)))).toEqual(
					new Set(["stage", "note", "interview"]),
				);
				const pictures = await fixture.query("select key from stored_file where user_id=$1 and revoked_at is null", [
					user.id,
				]);
				expect(pictures.rows).toHaveLength(1);
				for (const resume of await client.resume.list({})) {
					const full = await client.resume.getById({ id: resume.id });
					if (["سيرة قبل التحسين", "سيرة احترافية"].includes(full.name)) {
						expect(full.data.picture.hidden).toBe(true);
						expect(full.data.picture.url).toBe("");
					} else {
						expect(full.data.picture.hidden).toBe(false);
						expect(full.data.picture.url).toContain(pictures.rows[0].key);
					}
				}
				const app = apps[0];
				if (!app) throw new Error("Missing demo application");
				expect((await withOwnerDatabase(user.id, () => careerService.workspace(user.id, app.id))).answers).toHaveLength(
					1,
				);
				await expect(client.career.profile()).rejects.toMatchObject({
					code: "FORBIDDEN",
					message: "FEATURE_UNAVAILABLE",
				});
				expect(fetchSpy).not.toHaveBeenCalled();
				const isSmtpConnection = (arg: unknown) =>
					typeof arg === "object" &&
					arg !== null &&
					"port" in arg &&
					[25, 465, 587, 23102, Number(process.env.SMTP_PORT)].includes(Number(arg.port));
				expect(socketSpy.mock.calls.some((args) => args.some(isSmtpConnection))).toBe(false);
				expect((await fixture.query("select count(*)::int as n from ai_usage_ledger")).rows[0].n).toBe(0);
				const variants = await fixture.query("select * from resume_variant_source order by resume_id");
				expect(variants.rows).toHaveLength(2);
				expect(
					variants.rows.every(
						(row) => row.source_resume_id && row.source_revision && row.accepted_fact_revisions.length > 0,
					),
				).toBe(true);
				expect(variants.rows.filter((row) => row.job_id && row.job_revision)).toHaveLength(1);
				const snapshots = await fixture.query(
					"select count(*)::int as n from resume_fact_link l join career_fact_revision r on r.user_id=l.user_id and r.fact_id=l.fact_id and r.revision=l.accepted_revision",
				);
				expect(snapshots.rows[0].n).toBe(master.facts.length * 3);

				const account = await fixture.query(
					"select password from account where user_id=$1 and provider_id='credential'",
					[user.id],
				);
				const { auth } = await import("@reactive-resume/auth/config");
				expect(
					await (
						await auth.$context
					).password.verify({ password: demoCredentials.password, hash: account.rows[0].password }),
				).toBe(true);
				expect((await fixture.query("select count(*)::int as n from ai_operation")).rows[0].n).toBe(0);
			}),
		60000,
	);
});
