import { beforeAll, expect, it, vi } from "vite-plus/test";
import { unzipSync, strFromU8 } from "fflate";
import { configureStorageService } from "../storage/service";
import { requestAccountDeletion, runDeletionWork } from "./deletion";
import { collectAccountSnapshot, buildAccountArchive } from "./export";
import { personalDataInventory } from "./inventory";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
import { seedPersonalData } from "./testing/personal-data";
const database = privacyTestDatabase({ restrictedMigrationOwner: true });
const objects = new Map<string, Uint8Array>();
let seeded: Awaited<ReturnType<typeof seedPersonalData>>;
configureStorageService({
	healthcheck: vi.fn(),
	write: vi.fn(),
	read: vi.fn(async (key: string) => {
		const data = objects.get(key);
		return data ? { data, size: data.length } : null;
	}),
	list: vi.fn(async (prefix: string) => [...objects.keys()].filter((key) => key.startsWith(prefix))),
	delete: vi.fn(async (key: string) => objects.delete(key)),
});
beforeAll(async () => {
	await database
		.admin()
		.query(
			"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency,reserved_micros,spent_micros,active) VALUES ('alice-budget','alice-route','1','2026-11-14',1000,100,1,100,10,1),('bob-budget','bob-route','1','2026-11-14',1000,100,1,100,10,1)",
		);
	await database
		.admin()
		.query(
			"INSERT INTO jwks(id,public_key,private_key,expires_at) VALUES ('global-key','synthetic','SECRET_SENTINEL',now()-interval '1 day')",
		);
	await database
		.admin()
		.query("INSERT INTO oauth_client_assertion(id,expires_at) VALUES ('global-anti-replay',now()+interval '1 hour')");
	for (const owner of ["alice", "bob"] as const) {
		const graph = await seedPersonalData(database.admin(), owner);
		objects.set(graph.key, graph.bytes);
		objects.set(`uploads/${owner}/orphan.txt`, graph.bytes);
		if (owner === "alice") seeded = graph;
		await database.admin().query(`DO $$ BEGIN
 EXECUTE format('SET LOCAL ROLE %I',pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='ai_operation'::regclass)));
 PERFORM set_config('app.user_id','${owner}',true);
 UPDATE ai_operation SET budget_id='${owner}-budget',reserved_micros=100 WHERE user_id='${owner}';
 END $$`);
	}
	await database
		.admin()
		.query(
			"INSERT INTO oauth_consent(id,client_id,user_id,scopes) VALUES ('bob-shared-consent','alice-client','bob',ARRAY['profile'])",
		);
});
it("archive has every classified owner category and full revisions, nested secrets excluded", async () => {
	const snapshot = await database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "full-graph" }));
	const absent = ["account_deletion"];
	for (const [name, policy] of Object.entries(personalDataInventory)) {
		if (["global", "restricted"].includes(policy.owner) || absent.includes(name)) continue;
		expect(snapshot.categories[name as keyof typeof personalDataInventory], name).not.toHaveLength(0);
	}
	const entries = unzipSync(await buildAccountArchive(snapshot));
	const account = entries["account.json"];
	if (!account) throw new Error("Missing account manifest");
	const json = strFromU8(account);
	expect(json).toContain("alice-REVISION_SENTINEL");
	expect(json).toContain("alice-LETTER_REVISION_SENTINEL");
	expect(json).toContain("alice-JOB_AD_SENTINEL");
	expect(json).toContain("alice-SUPPORT_SENTINEL");
	expect(json).not.toMatch(/SECRET_SENTINEL|bob-|bob@example.test/);
	expect(entries["files/originals/cv.txt"]).toEqual(seeded.bytes);
});
it("erases the entire owner graph including RESTRICT edges and no-FK credentials without touching the other owner", async () => {
	// The fixture MFA is unverified and the fixture passkey cannot authenticate; use the real password ceremony.
	await database.admin().query("DELETE FROM passkey WHERE user_id='alice'");
	const session = await syntheticAccountSession(database);
	const request = await database.run(async () =>
		requestAccountDeletion({ headers: session.headers, ...(await session.proof("delete_account")), confirmed: true }),
	);
	const workId = (
		await database.admin().query("SELECT id FROM privacy_work WHERE key=$1", [`delete:${request.requestId}`])
	).rows[0].id;
	await database.run(() =>
		runDeletionWork({
			workId,
			hooks: { stopRenewals: async () => "not_applicable" },
			processors: [{ processor: "ai-route:synthetic:1:1", erase: async () => ({ state: "confirmed" }) }],
		}),
	);
	expect(
		(await database.admin().query("SELECT status FROM account_deletion WHERE id=$1", [request.requestId])).rows[0]
			.status,
	).toBe("complete");
	for (const table of seeded.tables) {
		if (table === "privacy_work") continue;
		const columns = (
			await database
				.admin()
				.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [
					table,
				])
		).rows.map((row) => row.column_name);
		const ownerColumn = columns.includes("user_id")
			? "user_id"
			: columns.includes("reference_id")
				? "reference_id"
				: null;
		if (ownerColumn) {
			expect(
				(await database.admin().query(`SELECT * FROM "${table}" WHERE "${ownerColumn}"='alice'`)).rows,
				table,
			).toEqual([]);
		}
	}
	expect((await database.admin().query("SELECT id FROM verification WHERE value='alice'")).rowCount).toBe(0);
	expect((await database.admin().query("SELECT id FROM \"user\" WHERE id='bob'")).rowCount).toBe(1);
	expect([...objects.keys()]).toEqual(["uploads/bob/originals/cv.txt", "uploads/bob/orphan.txt"]);
	expect(
		(await database.admin().query("SELECT count(*)::int AS count FROM resume_version WHERE user_id='bob'")).rows[0]
			.count,
	).toBe(1);
	expect(
		(
			await database
				.admin()
				.query("SELECT reserved_micros::int,spent_micros::int,active FROM ai_platform_budget WHERE id='alice-budget'")
		).rows,
	).toEqual([{ reserved_micros: 0, spent_micros: 17, active: 0 }]);
	expect(
		(
			await database
				.admin()
				.query("SELECT reserved_micros::int,spent_micros::int,active FROM ai_platform_budget WHERE id='bob-budget'")
		).rows,
	).toEqual([{ reserved_micros: 100, spent_micros: 10, active: 1 }]);
	expect(
		(
			await database
				.admin()
				.query(
					"SELECT client_id,user_id,reference_id,client_secret,disabled FROM oauth_client WHERE client_id='alice-client'",
				)
		).rows,
	).toEqual([{ client_id: "alice-client", user_id: null, reference_id: null, client_secret: null, disabled: true }]);
	for (const table of ["jwks", "oauth_client_assertion"])
		expect(
			(await database.admin().query(`SELECT id FROM ${table} WHERE id IN ('global-key','global-anti-replay')`))
				.rowCount,
		).toBe(1);
	expect((await database.admin().query("SELECT id FROM oauth_consent WHERE id='bob-shared-consent'")).rowCount).toBe(1);
});
