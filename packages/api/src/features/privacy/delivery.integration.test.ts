import { expect, it, vi } from "vite-plus/test";
import { configureStorageService } from "../storage/service";
import { requestAccountDeletion } from "./deletion";
import { downloadAccountExport, runExportWork, runNoticeWork } from "./delivery";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
const { send } = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@reactive-resume/email/transport", () => ({ sendPrivacyEmail: send }));
const database = privacyTestDatabase();
const objects = new Map<string, Uint8Array>();
const write = vi.fn(async ({ key, data }: { key: string; data: Uint8Array }) => {
	objects.set(key, data);
});
configureStorageService({
	write,
	read: vi.fn(async (key: string) => {
		const data = objects.get(key);
		return data ? { data, size: data.length } : null;
	}),
	list: vi.fn(async () => [...objects.keys()].filter((key) => !key.includes("account-exports"))),
	delete: vi.fn(async (key: string) => objects.delete(key)),
	healthcheck: vi.fn(),
});
it("queued work produces one durable ready archive and one localized notice", async () => {
	await database
		.admin()
		.query(
			"INSERT INTO account_data_export(id,user_id,request_nonce,locale) VALUES ('export','alice','nonce','en-US')",
		);
	await database
		.admin()
		.query(
			"INSERT INTO privacy_work(id,user_id,kind,request_id,key) VALUES ('export-work','alice','export_account','export','export:export')",
		);
	await database.run(() => runExportWork({ workId: "export-work" }));
	await database.run(() => runExportWork({ workId: "export-work" }));
	expect(write).toHaveBeenCalledTimes(1);
	const row = (
		await database.admin().query("SELECT status,artifact_key,digest FROM account_data_export WHERE id='export'")
	).rows[0];
	expect(row.status).toBe("ready");
	expect(objects.get(row.artifact_key)?.length).toBeGreaterThan(0);
	expect(row.digest).toMatch(/^[a-f0-9]{64}$/);
	const owner = await syntheticAccountSession(database);
	const navigationHeaders = new Headers(owner.headers);
	navigationHeaders.delete("origin");
	navigationHeaders.set("sec-fetch-site", "same-origin");
	const download = await database.run(() => downloadAccountExport({ headers: navigationHeaders, id: "export" }));
	expect(new Uint8Array(await new Response(download.body).arrayBuffer())).toEqual(objects.get(row.artifact_key));
	navigationHeaders.set("sec-fetch-site", "cross-site");
	await expect(database.run(() => downloadAccountExport({ headers: navigationHeaders, id: "export" }))).rejects.toThrow(
		"ORIGIN_DENIED",
	);
	const notices = (await database.admin().query("SELECT id,payload FROM privacy_work WHERE kind='send_notice'")).rows;
	expect(notices).toHaveLength(1);
	expect(notices[0].payload.locale).toBe("en-US");
	expect(JSON.stringify(notices[0].payload)).not.toContain("alice@example.test");
	send.mockRejectedValueOnce(new Error("offline synthetic transport"));
	await expect(database.run(() => runNoticeWork({ workId: notices[0].id }))).rejects.toThrow();
	expect(write).toHaveBeenCalledTimes(1);
	await database.admin().query("UPDATE privacy_work SET due_at=now() WHERE id=$1", [notices[0].id]);
	await database.run(() => runNoticeWork({ workId: notices[0].id }));
	expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ to: "alice@example.test" }));
	expect(
		(await database.admin().query("SELECT payload,status FROM privacy_work WHERE id=$1", [notices[0].id])).rows[0],
	).toEqual({ payload: null, status: "complete" });
});
it("storage failure never publishes ready", async () => {
	await database
		.admin()
		.query("INSERT INTO account_data_export(id,user_id,request_nonce) VALUES ('failed-export','bob','nonce')");
	await database
		.admin()
		.query(
			"INSERT INTO privacy_work(id,user_id,kind,request_id,key) VALUES ('failed-work','bob','export_account','failed-export','export:failed-export')",
		);
	write.mockRejectedValueOnce(new Error("storage offline"));
	await expect(database.run(() => runExportWork({ workId: "failed-work" }))).rejects.toThrow();
	expect(
		(await database.admin().query("SELECT status FROM account_data_export WHERE id='failed-export'")).rows[0].status,
	).toBe("failed");
});
it("an archive write held across deletion cannot publish and compensates its late bytes", async () => {
	await database
		.admin()
		.query("INSERT INTO account_data_export(id,user_id,request_nonce) VALUES ('held-export','bob','held')");
	await database
		.admin()
		.query(
			"INSERT INTO privacy_work(id,user_id,kind,request_id,key) VALUES ('held-work','bob','export_account','held-export','export:held-export')",
		);
	const started = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	write.mockImplementationOnce(async ({ key, data }) => {
		started.resolve();
		await finish.promise;
		objects.set(key, data);
	});
	const work = database
		.run(() => runExportWork({ workId: "held-work" }))
		.then(
			() => null,
			(error) => error,
		);
	await started.promise;
	const session = await syntheticAccountSession(database, "bob");
	await database.run(async () =>
		requestAccountDeletion({ headers: session.headers, ...(await session.proof("delete_account")), confirmed: true }),
	);
	finish.resolve();
	expect(await work).toBeInstanceOf(Error);
	expect(
		(await database.admin().query("SELECT status FROM account_data_export WHERE id='held-export'")).rows[0].status,
	).not.toBe("ready");
	expect([...objects.keys()].some((key) => key.startsWith("uploads/bob/"))).toBe(false);
});
