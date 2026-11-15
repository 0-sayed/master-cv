import { createHash } from "node:crypto";
import { beforeAll, expect, it, vi } from "vite-plus/test";
import { unzipSync, strFromU8 } from "fflate";
import { registerOwnedFile, deleteOwnedFile } from "../storage/ownership";
import { configureStorageService } from "../storage/service";
import { collectAccountSnapshot, buildAccountArchive } from "./export";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
const bytes = new TextEncoder().encode("synthetic attachment");
const digest = createHash("sha256").update(bytes).digest("hex");
const key = "uploads/alice/originals/cv.txt";
const read = vi.fn(async () => ({ data: bytes, size: bytes.length }));
const list = vi.fn(async () => [key, "uploads/alice/orphan.txt"]);
configureStorageService({ read, list, write: vi.fn(), delete: vi.fn(), healthcheck: vi.fn() });
beforeAll(async () => {
	await database
		.admin()
		.query(
			"INSERT INTO account(id,user_id,account_id,provider_id,password,access_token) VALUES ('a','alice','alice','credential','PASSWORD_SENTINEL','TOKEN_SENTINEL'),('b','bob','bob','credential','FOREIGN_SENTINEL',null)",
		);
	await database
		.admin()
		.query(
			"INSERT INTO verification(id,identifier,value,expires_at) VALUES ('v','reset-password:SECRET_SENTINEL','alice',now()+interval '1 hour')",
		);
	await database.run(() =>
		registerOwnedFile({
			userId: "alice",
			key,
			purpose: "original",
			contentType: "text/plain",
			size: bytes.length,
			digest,
		}),
	);
});
it("archive contains every classified owner category and actual owned orphan bytes", async () => {
	const snapshot = await database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "export" }));
	expect(snapshot.version).toBe(1);
	expect(snapshot.categories.account).toHaveLength(1);
	expect(snapshot.categories.verification).toHaveLength(1);
	const archive = await buildAccountArchive(snapshot);
	const entries = unzipSync(archive);
	expect(Object.keys(entries)).toContain("files/originals/cv.txt");
	const orphan = entries["files/orphan.txt"];
	const account = entries["account.json"];
	if (!orphan || !account) throw new Error("Archive entries missing");
	expect(strFromU8(orphan)).toBe("synthetic attachment");
	const json = strFromU8(account);
	for (const secret of [
		"PASSWORD_SENTINEL",
		"TOKEN_SENTINEL",
		"FOREIGN_SENTINEL",
		"SECRET_SENTINEL",
		"http://localhost:3030/uploads/",
	])
		expect(json).not.toContain(secret);
});
it("known missing or changed object never yields an archive", async () => {
	const snapshot = await database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "second" }));
	read.mockResolvedValueOnce({ data: new Uint8Array([1]), size: 1 });
	await expect(buildAccountArchive(snapshot)).rejects.toThrow("EXPORT_FILE_CHANGED");
});
it("foreign-prefix listing cannot be included and does not fetch remote URLs", async () => {
	list.mockResolvedValueOnce(["uploads/alice2/private.txt"]);
	await expect(database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "third" }))).rejects.toThrow(
		"EXPORT_FILE_SCOPE",
	);
});
it("embedded authorization material in tool content is redacted", async () => {
	const snapshot = await database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "embedded" }));
	snapshot.categories.agent_messages.push({
		id: "embedded",
		content: "Authorization: Bearer SYNTHETIC_EMBEDDED_SECRET\nCareer fact retained",
	} as never);
	const files = unzipSync(await buildAccountArchive(snapshot));
	const bytes = files["account.json"];
	if (!bytes) throw new Error("Missing account");
	const text = strFromU8(bytes);
	expect(text).not.toContain("SYNTHETIC_EMBEDDED_SECRET");
	expect(text).toContain("Career fact retained");
});
it("intentional file deletion does not poison later exports and queues cleanup durably", async () => {
	const removedKey = "uploads/alice/pictures/removed.png";
	await database.run(() =>
		registerOwnedFile({
			userId: "alice",
			key: removedKey,
			purpose: "picture",
			contentType: "image/png",
			size: bytes.length,
			digest,
		}),
	);
	await database.run(() => deleteOwnedFile({ userId: "alice", key: removedKey }));
	const snapshot = await database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "after-removal" }));
	expect(snapshot.files.map((file) => file.key)).not.toContain(removedKey);
	expect(
		(await database.admin().query("SELECT status FROM privacy_work WHERE request_id=$1", [removedKey])).rows,
	).toEqual([{ status: "queued" }]);
	await expect(buildAccountArchive(snapshot)).resolves.toBeInstanceOf(Uint8Array);
});
it("missing persisted attachment bytes cannot be silently omitted by a listing", async () => {
	await database
		.admin()
		.query("INSERT INTO agent_threads(id,user_id,title) VALUES ('attachment-thread','alice','Synthetic')");
	await database
		.admin()
		.query(
			"INSERT INTO agent_attachments(id,user_id,thread_id,storage_key,filename,media_type,size) VALUES ('missing-file','alice','attachment-thread','uploads/alice/agent/missing.txt','missing.txt','text/plain',1)",
		);
	const snapshot = await database.run(() => collectAccountSnapshot({ userId: "alice", exportId: "missing-known" }));
	expect(snapshot.files.map((file) => file.key)).toContain("uploads/alice/agent/missing.txt");
	read.mockResolvedValueOnce(null as never);
	await expect(buildAccountArchive(snapshot)).rejects.toThrow("EXPORT_FILE_MISSING");
});
