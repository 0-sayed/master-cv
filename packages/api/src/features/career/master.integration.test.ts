import type { MasterFactInput } from "@reactive-resume/schema/career-master";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withDatabasePool } from "@reactive-resume/db/client";
import { careerProfileDataSchema } from "@reactive-resume/schema/career";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("reviewed career master", () => {
	const suffix = randomUUID().replaceAll("-", "");
	const name = `t003_master_${suffix}`;
	let admin: Pool;
	let pool: Pool;
	let service: typeof import("./master").careerMasterService;
	let workspace: typeof import("./workspace").workspaceService;
	let legacy: typeof import("./service").careerService;
	const input = (value: string) =>
		({
			section: "experience",
			entityId: "work-1",
			field: "company",
			value,
			source: { kind: "manual", id: "entry-1", quote: value },
		}) as const satisfies MasterFactInput;
	beforeAll(async () => {
		const databaseURL = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!databaseURL) throw new Error("Disposable database required");
		const url = new URL(databaseURL);
		admin = new Pool({ connectionString: url.toString() });
		await admin.query(`CREATE DATABASE "${name}"`);
		url.pathname = `/${name}`;
		pool = new Pool({ connectionString: url.toString(), max: 4 });
		await migrate(drizzle({ client: pool }), {
			migrationsFolder: fileURLToPath(new URL("../../../../../migrations", import.meta.url)),
		});
		await pool.query(
			`INSERT INTO "user" (id,name,email,username,display_username,email_verified) VALUES ('alice','Alice','alice@example.test','alice','alice',true),('bob','Bob','bob@example.test','bob','bob',true)`,
		);
		await pool.query(
			`INSERT INTO resume (id,user_id,name,slug,data) VALUES ('ar','alice','Arabic','ar','{"facts":"سارة مثال"}'),('en','alice','English','en','{"facts":"Sarah Example"}'),('foreign','bob','Bob','b','{}')`,
		);
		({ careerMasterService: service } = await import("./master"));
		({ workspaceService: workspace } = await import("./workspace"));
		({ careerService: legacy } = await import("./service"));
	}, 30_000);
	afterAll(async () => {
		await pool?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
			await admin.end();
		}
	});
	it("persists welcome completion per account without replacing preferences", async () =>
		withDatabasePool(pool, async () => {
			await pool.query("INSERT INTO career_profile (user_id,data) VALUES ('alice',$1)", [
				careerProfileDataSchema.parse({}),
			]);
			const before = (await pool.query("SELECT data FROM career_profile WHERE user_id='alice'")).rows;
			expect(await workspace.state("alice")).toMatchObject({ welcomeCompletedAt: null, hasDocuments: true });
			await workspace.completeWelcome("alice");
			await workspace.completeWelcome("alice");
			expect(await workspace.state("alice")).toMatchObject({ welcomeCompletedAt: expect.any(Date) });
			expect(await workspace.state("bob")).toMatchObject({ welcomeCompletedAt: null });
			expect((await pool.query("SELECT data FROM career_profile WHERE user_id='alice'")).rows).toEqual(before);
		}));
	it("confirms drafts atomically, detects concurrent tabs and never rewrites independent CVs", async () =>
		withDatabasePool(pool, async () => {
			const original = (await pool.query("SELECT id,data FROM resume ORDER BY id")).rows;
			const draft = await service.savePending("alice", input("شركة مثال"));
			expect(draft).toMatchObject({ structured: null, confirmation: "pending", draftRevision: 1 });
			expect((await service.read("alice")).profileRevision).toBe(0);
			await expect(
				service.confirm("bob", {
					facts: [{ id: draft.id, expectedRevision: 1, expectedDraftRevision: 1 }],
					expectedProfileRevision: 0,
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			const confirmed = await service.confirm("alice", {
				facts: [{ id: draft.id, expectedRevision: 1, expectedDraftRevision: 1 }],
				expectedProfileRevision: 0,
			});
			expect(confirmed.profileRevision).toBe(1);
			await service.linkResumeFacts("alice", { resumeId: "ar", links: [{ factId: draft.id, acceptedRevision: 1 }] });
			expect((await service.read("alice")).links).toEqual([
				{ resumeId: "ar", name: "Arabic", factId: draft.id, acceptedRevision: 1 },
			]);
			expect((await service.read("bob")).links).toEqual([]);
			await expect(
				service.linkResumeFacts("bob", { resumeId: "ar", links: [{ factId: draft.id, acceptedRevision: 1 }] }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			const changed = await service.savePending("alice", {
				...input("Updated شركة"),
				id: draft.id,
				expectedRevision: 1,
				expectedDraftRevision: 1,
			});
			await expect(
				service.savePending("alice", {
					...input("Other tab"),
					id: draft.id,
					expectedRevision: 1,
					expectedDraftRevision: 1,
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(changed.structured?.value).toBe("شركة مثال");
			const accept = {
				facts: [{ id: draft.id, expectedRevision: 1, expectedDraftRevision: 2 }],
				expectedProfileRevision: 1,
			};
			const results = await Promise.allSettled([service.confirm("alice", accept), service.confirm("alice", accept)]);
			expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
			expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
			expect(await service.resumeLinkState("alice", "ar")).toMatchObject({
				baseResumeId: "ar",
				staleFactIds: [draft.id],
			});
			expect(await service.resumeLinkState("alice", "en")).toMatchObject({ baseResumeId: "en", staleFactIds: [] });
			await service.linkResumeFacts("alice", { resumeId: "en", links: [{ factId: draft.id, acceptedRevision: 1 }] });
			expect(await service.resumeLinkState("alice", "en")).toMatchObject({ staleFactIds: [draft.id] });
			await expect(
				service.linkResumeFacts("alice", { resumeId: "en", links: [{ factId: draft.id, acceptedRevision: 999 }] }),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			await service.remove("alice", { entityId: "work-1", expectedProfileRevision: 2 });
			expect((await service.read("alice")).facts).toEqual([]);
			expect((await pool.query("SELECT revision,removed FROM career_fact_revision ORDER BY revision")).rows).toEqual([
				{ revision: 1, removed: false },
				{ revision: 2, removed: false },
				{ revision: 3, removed: true },
			]);
			expect((await pool.query("SELECT id,data FROM resume ORDER BY id")).rows).toEqual(original);
		}));
	it("rolls an entire entry back on a stale field and blocks legacy mutation bypasses", async () =>
		withDatabasePool(pool, async () => {
			const company = await service.savePending("alice", { ...input("Atomic company"), entityId: "atomic" });
			const position = await service.savePending("alice", {
				...input("Engineer"),
				entityId: "atomic",
				field: "position",
			});
			const before = await service.read("alice");
			await expect(
				service.confirm("alice", {
					expectedProfileRevision: before.profileRevision,
					facts: [
						{ id: company.id, expectedRevision: 1, expectedDraftRevision: 1 },
						{ id: position.id, expectedRevision: 1, expectedDraftRevision: 0 },
					],
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect((await service.read("alice")).facts.every((fact) => fact.structured === null)).toBe(true);
			expect(
				(
					await pool.query("SELECT count(*)::int AS n FROM career_fact_revision WHERE fact_id=ANY($1)", [
						[company.id, position.id],
					])
				).rows[0].n,
			).toBe(0);
			const accepted = await service.confirm("alice", {
				expectedProfileRevision: before.profileRevision,
				facts: [company, position].map((f) => ({
					id: f.id,
					expectedRevision: f.revision,
					expectedDraftRevision: f.draftRevision,
				})),
			});
			await expect(legacy.updateFact("alice", { id: company.id, text: "Bypass" })).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
			});
			await expect(legacy.forgetFact("alice", company.id)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
			const cleared = await service.savePending("alice", {
				...input(""),
				entityId: "atomic",
				field: "position",
				id: position.id,
				expectedRevision: 1,
				expectedDraftRevision: 1,
			});
			await service.confirm("alice", {
				expectedProfileRevision: accepted.profileRevision,
				facts: [{ id: cleared.id, expectedRevision: cleared.revision, expectedDraftRevision: cleared.draftRevision }],
			});
			expect((await service.read("alice")).facts.find((f) => f.id === position.id)?.structured?.value).toBe("");
		}));
	it("rejects a language or job copy as a lineage root", async () =>
		withDatabasePool(pool, async () => {
			await pool.query(
				`INSERT INTO resume (id,user_id,name,slug,data,variant_kind,base_resume_id) VALUES ('language','alice','Language','language','{}','language','ar'),('job','alice','Job','job','{}','job','language')`,
			);
			await expect(service.linkResumeFacts("alice", { resumeId: "job", links: [] })).rejects.toMatchObject({
				code: "PRECONDITION_FAILED",
			});
			await expect(service.resumeLinkState("alice", "job")).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		}));
	it.each([
		["experience", "company", "experience"],
		["education", "school", "experience"],
		["skills", "name", "skill"],
		["languages", "language", "skill"],
		["certifications", "title", "accomplishment"],
	] as const)("preserves %s facts in the matching Knowledge category", async (section, field, category) =>
		withDatabasePool(pool, async () => {
			const fact = await service.savePending("bob", {
				...input("Reviewed fact"),
				section,
				field,
				entityId: `category-${section}`,
			} as MasterFactInput);
			const master = await service.read("bob");
			await service.confirm("bob", {
				expectedProfileRevision: master.profileRevision,
				facts: [{ id: fact.id, expectedRevision: fact.revision, expectedDraftRevision: fact.draftRevision }],
			});
			expect((await pool.query("SELECT category FROM career_fact WHERE id=$1", [fact.id])).rows[0].category).toBe(
				category,
			);
		}),
	);
	it("purges a base CV while preserving its variants as independent documents", async () =>
		withDatabasePool(pool, async () => {
			const { resumeService } = await import("../resume/service");
			await pool.query(
				`INSERT INTO resume (id,user_id,name,slug,data,variant_kind,base_resume_id,is_locked,trashed_at)
				VALUES ('delete-base','alice','Base','delete-base','{"facts":"base"}','base',null,false,now()),
				('keep-language','alice','English copy','keep-language','{"facts":"Sarah Example"}','language','delete-base',true,null),
				('keep-job','alice','Job copy','keep-job','{"facts":"سارة مثال"}','job','delete-base',false,now())`,
			);
			await pool.query(
				`INSERT INTO resume_version (id,resume_id,user_id,data,kind,name)
				VALUES ('keep-version','keep-language','alice','{"facts":"Saved wording"}','named','Saved copy')`,
			);
			const versions = (await pool.query("SELECT * FROM resume_version WHERE id='keep-version'")).rows;
			const before = (
				await pool.query(
					"SELECT id,name,data,is_locked,trashed_at FROM resume WHERE base_resume_id='delete-base' ORDER BY id",
				)
			).rows;
			await expect(resumeService.delete({ id: "delete-base", userId: "bob" })).rejects.toMatchObject({
				code: "NOT_FOUND",
			});
			await resumeService.delete({ id: "delete-base", userId: "alice" });
			expect((await pool.query("SELECT id FROM resume WHERE id='delete-base'")).rows).toEqual([]);
			expect((await pool.query("SELECT * FROM resume_version WHERE id='keep-version'")).rows).toEqual(versions);
			expect(
				(
					await pool.query(
						"SELECT id,name,data,is_locked,trashed_at FROM resume WHERE id IN ('keep-language','keep-job') ORDER BY id",
					)
				).rows,
			).toEqual(before);
			expect(
				(await pool.query("SELECT base_resume_id,variant_kind FROM resume WHERE id IN ('keep-language','keep-job')"))
					.rows,
			).toEqual([
				{ base_resume_id: null, variant_kind: "base" },
				{ base_resume_id: null, variant_kind: "base" },
			]);
		}));
});
