import { expect, it, vi } from "vite-plus/test";
import { configureStorageService } from "../storage/service";
import { requestAccountDeletion, runDeletionWork } from "./deletion";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
const { revokeApple } = vi.hoisted(() => ({ revokeApple: vi.fn().mockResolvedValue(true) }));
vi.mock("../auth/apple-revocation", () => ({ revokeAppleAuthorization: revokeApple }));
const database = privacyTestDatabase();
const keys = new Set(["uploads/alice/orphan.txt", "uploads/alice/pictures/private.png", "uploads/alice2/foreign.txt"]);
const remove = vi.fn(async (key: string) => keys.delete(key));
configureStorageService({
	list: vi.fn(async (prefix: string) => [...keys].filter((key) => key.startsWith(prefix))),
	delete: remove,
	read: vi.fn(),
	write: vi.fn(),
	healthcheck: vi.fn(),
});
it("failed object cleanup remains pending and retry erases active owner data with minimal durable history", async () => {
	const session = await syntheticAccountSession(database);
	await database
		.admin()
		.query(
			"INSERT INTO account(id,user_id,account_id,provider_id,refresh_token,access_token) VALUES ('apple-alice','alice','apple-sub','apple','synthetic-refresh','synthetic-access')",
		);
	await database
		.admin()
		.query(
			"INSERT INTO career_profile(user_id,data) VALUES ('alice','{\"name\":\"PERSONAL_SENTINEL\"}'),('bob','{\"name\":\"FOREIGN_SENTINEL\"}')",
		);
	const request = await database.run(async () =>
		requestAccountDeletion({ ...(await session.proof("delete_account")), headers: session.headers, confirmed: true }),
	);
	expect(revokeApple).toHaveBeenCalledExactlyOnceWith({
		refreshToken: "synthetic-refresh",
		accessToken: "synthetic-access",
	});
	expect((await database.admin().query("SELECT id FROM account WHERE user_id='alice'")).rows).toEqual([]);
	const workId = (
		await database.admin().query("SELECT id FROM privacy_work WHERE kind='delete_account' AND user_id='alice'")
	).rows[0].id;
	const hooks = { stopRenewals: vi.fn(async () => "not_applicable" as const) };
	remove.mockRejectedValueOnce(new Error("synthetic storage denied"));
	await expect(database.run(() => runDeletionWork({ workId, hooks, processors: [] }))).rejects.toThrow();
	expect((await database.admin().query("SELECT id FROM \"user\" WHERE id='alice'")).rowCount).toBe(1);
	expect(
		(await database.admin().query("SELECT status FROM account_deletion WHERE id=$1", [request.requestId])).rows[0]
			.status,
	).not.toBe("complete");
	await database.admin().query("UPDATE privacy_work SET due_at=now() WHERE id=$1", [workId]);
	await database.run(() => runDeletionWork({ workId, hooks, processors: [] }));
	expect((await database.admin().query("SELECT id FROM \"user\" WHERE id='alice'")).rowCount).toBe(0);
	expect((await database.admin().query("SELECT data FROM career_profile WHERE user_id='bob'")).rows[0].data).toEqual({
		name: "FOREIGN_SENTINEL",
	});
	expect([...keys]).toEqual(["uploads/alice2/foreign.txt"]);
	expect(
		(await database.admin().query("SELECT status FROM account_deletion WHERE id=$1", [request.requestId])).rows[0]
			.status,
	).toBe("complete");
	const history = (
		await database
			.admin()
			.query("SELECT * FROM deletion_replay_record WHERE request_id=$1 ORDER BY sequence", [request.requestId])
	).rows;
	expect(history.length).toBeGreaterThan(1);
	expect(history[0].database_removed).toBe(false);
	expect(history.at(-1).database_removed).toBe(true);
	expect(JSON.stringify(history)).not.toMatch(/PERSONAL_SENTINEL|alice@example.test|recipient|password|token/i);
	expect(
		(await database.admin().query("SELECT payload FROM privacy_work WHERE id=$1", [workId])).rows[0].payload,
	).toBeNull();
});
it("unconfirmed renewal stop cannot report complete or invoke an absent processor", async () => {
	const session = await syntheticAccountSession(database, "bob");
	await database.run(async () =>
		requestAccountDeletion({ ...(await session.proof("delete_account")), headers: session.headers, confirmed: true }),
	);
	const workId = (
		await database.admin().query("SELECT id FROM privacy_work WHERE kind='delete_account' AND user_id='bob'")
	).rows[0].id;
	await database.run(() => runDeletionWork({ workId, hooks: { stopRenewals: async () => "pending" }, processors: [] }));
	expect(
		(await database.admin().query("SELECT status FROM account_deletion WHERE subject_user_id='bob'")).rows[0].status,
	).toBe("blocked");
	expect((await database.admin().query("SELECT id FROM \"user\" WHERE id='bob'")).rowCount).toBe(1);
});
