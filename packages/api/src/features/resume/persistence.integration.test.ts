// oxlint-disable typescript/no-non-null-assertion -- Synthetic fixtures assert required IDs and rows before use.
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withDatabaseOwner, withDatabasePool } from "@reactive-resume/db/client";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("CV persistence", () => {
	const suffix = randomUUID().replaceAll("-", "");
	const name = `t004_persistence_${suffix}`;
	const role = `t004_runtime_${suffix}`;
	let admin: Pool;
	let migration: Pool;
	let runtime: Pool;
	let service: typeof import("./service").resumeService;
	const owned = <T>(work: () => T) => withDatabasePool(runtime, () => withDatabaseOwner("alice", work));
	const data = (value: string) => {
		const result = structuredClone(defaultResumeData);
		result.basics.name = value;
		return result;
	};
	async function fixture() {
		const id = randomUUID();
		await migration.query("INSERT INTO resume (id,user_id,name,slug,data) VALUES ($1,'alice','CV',$1,$2)", [
			id,
			data("Original"),
		]);
		await migration.query(
			"INSERT INTO resume_version (id,resume_id,user_id,data,kind) VALUES ($1,$2,'alice',$3,'named')",
			[id, id, data("Historical")],
		);
		return { id, versionId: id, userId: "alice" };
	}
	const state = async (id: string) => ({
		resume: (await migration.query("SELECT data,updated_at FROM resume WHERE id=$1", [id])).rows,
		versions: (await migration.query("SELECT id,data,kind FROM resume_version WHERE resume_id=$1 ORDER BY id", [id]))
			.rows,
	});
	beforeAll(async () => {
		const url = new URL(process.env.COVER_LETTER_TEST_DATABASE_URL!);
		if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host"))
			throw new Error("Local synthetic database required");
		admin = new Pool({ connectionString: url.toString() });
		await admin.query(`CREATE DATABASE "${name}"`);
		url.pathname = `/${name}`;
		migration = new Pool({ connectionString: url.toString() });
		await migrate(drizzle({ client: migration }), {
			migrationsFolder: fileURLToPath(new URL("../../../../../migrations", import.meta.url)),
		});
		await migration.query(
			"INSERT INTO \"user\" (id,name,email,username,display_username,email_verified) VALUES ('alice','Alice','alice@example.test','alice','alice',true),('bob','Bob','bob@example.test','bob','bob',true)",
		);
		const password = randomUUID();
		await migration.query(
			`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
		);
		await migration.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
		await migration.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
		await migration.query(`REVOKE UPDATE,DELETE ON career_fact_revision FROM "${role}"`);
		await migration.query(`REVOKE UPDATE,DELETE,TRUNCATE ON ai_usage_ledger FROM "${role}"`);
		await migration.query(`REVOKE ALL ON ai_platform_budget FROM "${role}"`);
		url.username = role;
		url.password = password;
		runtime = new Pool({ connectionString: url.toString(), max: 4 });
		({ resumeService: service } = await import("./service"));
	}, 30_000);
	// Retain the uniquely named synthetic database for failure evidence, as ci-browser does.
	afterAll(async () => {
		vi.restoreAllMocks();
		await runtime?.end();
		await migration?.end();
		await admin?.end();
	});
	it("has one winner for simultaneous saves from a shared baseline", async () => {
		const { id } = await fixture();
		const current = await owned(() => service.getById({ id, userId: "alice" }));
		const results = await Promise.allSettled(
			["First", "Second"].map((value) =>
				owned(() => service.update({ id, userId: "alice", data: data(value), expectedUpdatedAt: current.updatedAt })),
			),
		);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.find((result) => result.status === "rejected")).toMatchObject({
			reason: { code: "RESUME_VERSION_CONFLICT" },
		});
	});
	it("uses distinct millisecond tokens even when the application clock moves backwards", async () => {
		const { id } = await fixture();
		let current: { updatedAt: Date } = await owned(() => service.getById({ id, userId: "alice" }));
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(current.updatedAt.getTime() - 10_000);
		try {
			for (const value of ["First", "Second"]) {
				const saved = await owned(() =>
					service.update({
						id,
						userId: "alice",
						data: data(value),
						expectedUpdatedAt: current.updatedAt,
						skipAutoSnapshot: true,
					}),
				);
				expect(saved.updatedAt.getTime()).toBeGreaterThan(current.updatedAt.getTime());
				current = saved;
			}
		} finally {
			vi.useRealTimers();
		}
	});
	it("rejects a stale restore without changing data or history", async () => {
		const input = await fixture();
		const before = await state(input.id);
		await expect(
			owned(() => service.versions.restore({ ...input, resumeId: input.id, expectedUpdatedAt: new Date(0) })),
		).rejects.toMatchObject({ code: "RESUME_VERSION_CONFLICT" });
		expect(await state(input.id)).toEqual(before);
	});
	it("rolls back the data and both snapshots if the restored snapshot fails", async () => {
		const input = await fixture();
		const before = await state(input.id);
		await migration.query(
			`CREATE FUNCTION reject_restore_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='restored' AND NEW.resume_id='${input.id}' THEN RAISE EXCEPTION 'synthetic restore failure'; END IF; RETURN NEW; END $$`,
		);
		await migration.query(
			`CREATE TRIGGER reject_restore BEFORE INSERT ON resume_version FOR EACH ROW EXECUTE FUNCTION reject_restore_${suffix}()`,
		);
		await expect(owned(() => service.versions.restore({ ...input, resumeId: input.id }))).rejects.toThrow();
		expect(await state(input.id)).toEqual(before);
	});
	it.each(["foreign", "locked", "trashed"] as const)("cannot restore a %s CV", async (kind) => {
		const input = await fixture();
		if (kind === "locked") await migration.query("UPDATE resume SET is_locked=true WHERE id=$1", [input.id]);
		if (kind === "trashed") await migration.query("UPDATE resume SET trashed_at=now() WHERE id=$1", [input.id]);
		const before = await state(input.id);
		await expect(
			withDatabasePool(runtime, () =>
				withDatabaseOwner(kind === "foreign" ? "bob" : "alice", () =>
					service.versions.restore({
						resumeId: input.id,
						versionId: input.versionId,
						userId: kind === "foreign" ? "bob" : "alice",
					}),
				),
			),
		).rejects.toMatchObject({ code: kind === "locked" ? "RESUME_LOCKED" : "NOT_FOUND" });
		expect(await state(input.id)).toEqual(before);
	});
	it("confirms more than 30 facts atomically and deduplicates concurrent flow retries", async () => {
		const { confirmImport } = await import("./import-review");
		// Prior persistence fixtures deliberately retain many bases; this case needs an empty creation slot.
		await migration.query("DELETE FROM resume WHERE user_id='alice'");
		const { buildCareerFactCandidates } = await import("@reactive-resume/import/career-facts");
		const inputData = data("Reviewed");
		inputData.sections.skills.items = Array.from({ length: 35 }, (_, i) => ({
			id: randomUUID(),
			hidden: false,
			name: `Skill ${i}`,
			proficiency: "",
			level: 0,
			icon: "",
			iconColor: "",
			keywords: [],
		}));
		const expectedProfileRevision =
			(await migration.query("SELECT profile_revision FROM career_profile WHERE user_id='alice'")).rows[0]
				?.profile_revision ?? 0;
		const input = {
			flowId: randomUUID(),
			name: "Reviewed",
			data: inputData,
			expectedProfileRevision,
			acceptedFacts: buildCareerFactCandidates(inputData, { kind: "manual", id: "", quote: "" }).map((fact) => ({
				fact,
				decision: { kind: "new" as const },
			})),
		};
		const results = await Promise.all([
			owned(() => confirmImport("alice", input)),
			owned(() => confirmImport("alice", input)),
		]);
		expect(results[0]).toEqual(results[1]);
		expect(
			(await migration.query("SELECT id FROM resume WHERE user_id='alice' AND import_flow_id=$1", [input.flowId])).rows,
		).toHaveLength(1);
		expect(
			(await migration.query("SELECT * FROM resume_fact_link WHERE resume_id=$1", [results[0]!.resumeId])).rows,
		).toHaveLength(35);
		await expect(owned(() => confirmImport("alice", { ...input, name: "Changed" }))).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});
	it("rolls back the CV and master facts when confirmation fails", async () => {
		const { confirmImport } = await import("./import-review");
		// Prior persistence fixtures deliberately retain many bases; this case needs an empty creation slot.
		await migration.query("DELETE FROM resume WHERE user_id='alice'");
		const profile =
			(await migration.query("SELECT profile_revision FROM career_profile WHERE user_id='alice'")).rows[0]
				?.profile_revision ?? 0;
		const before = (await migration.query("SELECT count(*) FROM resume WHERE user_id='alice'")).rows;
		const inputData = data("Rollback");
		const input = {
			flowId: randomUUID(),
			name: "Rollback",
			data: inputData,
			expectedProfileRevision: profile,
			acceptedFacts: [
				{
					fact: {
						section: "skills" as const,
						entityId: "missing",
						field: "name" as const,
						value: "not in CV",
						source: { kind: "manual" as const, id: "", quote: "" },
					},
					decision: { kind: "new" as const },
				},
			],
		};
		await expect(owned(() => confirmImport("alice", input))).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect((await migration.query("SELECT count(*) FROM resume WHERE user_id='alice'")).rows).toEqual(before);
		expect((await migration.query("SELECT id FROM resume WHERE import_flow_id=$1", [input.flowId])).rows).toHaveLength(
			0,
		);
	});
	it.each(["stale", "foreign"] as const)(
		"rolls back an attempted %s master link after creating the CV",
		async (kind) => {
			const { confirmImport } = await import("./import-review");
			// Prior persistence fixtures deliberately retain many bases; this case needs an empty creation slot.
			await migration.query("DELETE FROM resume WHERE user_id='alice'");
			const { careerMasterService } = await import("../career/master");
			const master = await owned(() => careerMasterService.read("alice"));
			const saved = master.facts.find((f) => f.structured?.section === "skills");
			if (!saved?.structured || saved.structured.section !== "skills")
				throw new Error("Missing confirmed synthetic skill");
			const cv = data("Rejected link");
			cv.sections.skills.items = [
				{
					id: saved.structured.entityId,
					name: saved.structured.field === "name" ? saved.structured.value : "Skill",
					proficiency: "",
					hidden: false,
					level: 0,
					icon: "",
					iconColor: "",
					keywords: [],
				},
			];
			const before = (await migration.query("SELECT count(*) FROM resume WHERE user_id='alice'")).rows;
			await expect(
				owned(() =>
					confirmImport("alice", {
						flowId: randomUUID(),
						name: "Rejected link",
						data: cv,
						expectedProfileRevision: master.profileRevision,
						acceptedFacts: [
							{
								fact: saved.structured!,
								decision: {
									kind: "existing",
									id: kind === "foreign" ? randomUUID() : saved.id,
									expectedRevision: saved.revision + 1,
									expectedDraftRevision: saved.draftRevision,
								},
							},
						],
					}),
				),
			).rejects.toMatchObject({ code: kind === "foreign" ? "NOT_FOUND" : "IMPORT_REVIEW_CONFLICT" });
			expect((await migration.query("SELECT count(*) FROM resume WHERE user_id='alice'")).rows).toEqual(before);
		},
	);

	it("cannot replace a reused master fact by labelling its changed value new", async () => {
		const { confirmImport } = await import("./import-review");
		// Prior persistence fixtures deliberately retain many bases; this case needs an empty creation slot.
		await migration.query("DELETE FROM resume WHERE user_id='alice'");
		const { careerMasterService } = await import("../career/master");
		const master = await owned(() => careerMasterService.read("alice"));
		const saved = master.facts.find((f) => f.structured?.section === "skills" && f.structured.field === "name");
		if (!saved?.structured) throw new Error("Missing synthetic fact");
		const cv = data("Local correction");
		cv.sections.skills.items = [
			{
				id: saved.structured.entityId,
				name: "CV-only correction",
				proficiency: "",
				hidden: false,
				level: 0,
				icon: "",
				iconColor: "",
				keywords: [],
			},
		];
		await expect(
			owned(() =>
				confirmImport("alice", {
					flowId: randomUUID(),
					name: "Local correction",
					data: cv,
					expectedProfileRevision: master.profileRevision,
					acceptedFacts: [
						{
							fact: { ...saved.structured, value: "CV-only correction" } as typeof saved.structured,
							decision: { kind: "new" },
						},
					],
				}),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await owned(() => careerMasterService.read("alice"))).toEqual(master);
	});
	it("rolls back confirmation when its first snapshot fails after the CV insert", async () => {
		const { confirmImport } = await import("./import-review");
		// Prior persistence fixtures deliberately retain many bases; this case needs an empty creation slot.
		await migration.query("DELETE FROM resume WHERE user_id='alice'");
		const flowId = randomUUID();
		const expectedProfileRevision =
			(await migration.query("SELECT profile_revision FROM career_profile WHERE user_id='alice'")).rows[0]
				?.profile_revision ?? 0;
		await migration.query(
			`CREATE FUNCTION reject_import_${suffix}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='import' THEN RAISE EXCEPTION 'synthetic initial snapshot failure'; END IF; RETURN NEW; END $$`,
		);
		await migration.query(
			`CREATE TRIGGER reject_import BEFORE INSERT ON resume_version FOR EACH ROW EXECUTE FUNCTION reject_import_${suffix}()`,
		);
		const before = (await migration.query("SELECT count(*) FROM resume WHERE user_id='alice'")).rows;
		await expect(
			owned(() =>
				confirmImport("alice", {
					flowId,
					name: "Atomic snapshot",
					data: data("Atomic snapshot"),
					expectedProfileRevision,
					acceptedFacts: [],
				}),
			),
		).rejects.toThrow();
		expect((await migration.query("SELECT count(*) FROM resume WHERE user_id='alice'")).rows).toEqual(before);
	});
});
