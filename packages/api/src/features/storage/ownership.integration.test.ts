import { expect, it, vi } from "vite-plus/test";
import { privacyTestDatabase } from "../privacy/testing/database";
import {
	registerOwnedFile,
	authorizeOwnedFile,
	revokeOwnedFile,
	readOwnedPicture,
	beginOwnedFileWrite,
	reconcileOwnedFileWrite,
} from "./ownership";
import { configureStorageService } from "./service";
const database = privacyTestDatabase();
const read = vi.fn().mockResolvedValue({ data: new Uint8Array([1]), size: 1 });
configureStorageService({ read, write: vi.fn(), delete: vi.fn(), list: vi.fn(), healthcheck: vi.fn() });
const input = {
	userId: "alice",
	key: "uploads/alice/pictures/a.png",
	purpose: "picture",
	contentType: "image/png",
	size: 1,
	digest: "4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a",
};
it("legacy referenced owner pictures reconcile on first authorized access without adopting orphans", async () => {
	const key = "uploads/alice/pictures/legacy.png";
	await database.admin().query("UPDATE \"user\" SET image=$1 WHERE id='alice'", [`http://localhost:3030/api/${key}`]);
	expect(await database.run(() => readOwnedPicture({ userId: "alice", key }))).toEqual(new Uint8Array([1]));
});
it("interrupted writes require confirmed settlement before internal reconciliation releases erasure", async () => {
	const key = "uploads/alice/pictures/interrupted.png";
	await database.run(() => beginOwnedFileWrite("alice", key));
	expect(
		await database.run(() => reconcileOwnedFileWrite({ userId: "alice", key, confirmSettled: async () => "pending" })),
	).toBe("pending");
	expect(
		(
			await database
				.admin()
				.query("SELECT payload->>'ioPending' AS pending FROM privacy_work WHERE request_id=$1", [key])
		).rows[0].pending,
	).toBe("true");
	expect(
		await database.run(() => reconcileOwnedFileWrite({ userId: "alice", key, confirmSettled: async () => "settled" })),
	).toBe("reconciled");
	expect(
		(await database.admin().query("SELECT payload FROM privacy_work WHERE request_id=$1", [key])).rows[0].payload,
	).toBeNull();
});
it("registry_is_private_idempotent_and_rejects_foreign_and_ambiguous_keys", async () => {
	const result = await database.run(() => registerOwnedFile(input));
	expect(await database.run(() => registerOwnedFile(input))).toEqual(result);
	await expect(database.run(() => authorizeOwnedFile({ userId: "bob", key: input.key }))).rejects.toThrow();
	await expect(
		database.run(() => authorizeOwnedFile({ userId: "alice", key: "uploads/alice/pictures/unknown.png" })),
	).rejects.toThrow();
	await expect(
		database.run(() => registerOwnedFile({ ...input, key: "uploads/alice2/pictures/a.png" })),
	).rejects.toThrow();
});
it("owner_pdf_reads_private_picture_and_revocation_blocks_bytes", async () => {
	expect(await database.run(() => readOwnedPicture({ userId: "alice", key: input.key }))).toEqual(new Uint8Array([1]));
	const registered = await database.run(() => authorizeOwnedFile({ userId: "alice", key: input.key }));
	await database.run(() => revokeOwnedFile({ userId: "alice", id: registered.id }));
	read.mockClear();
	await expect(database.run(() => readOwnedPicture({ userId: "alice", key: input.key }))).rejects.toThrow();
	expect(read).not.toHaveBeenCalled();
	await expect(database.run(() => registerOwnedFile(input))).rejects.toThrow();
});
it("replacement_revokes_old_delivery_and_rejects_external_picture", async () => {
	const { accountAuth } = await import("@reactive-resume/auth/config");
	const owner = {
		id: "alice",
		name: "Alice",
		email: "alice@example.test",
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	await expect(
		database.run(() => accountAuth.updateProfile(owner, { image: "https://outside.example.test/a.png" })),
	).rejects.toThrow();
	const old = await database.run(() => registerOwnedFile({ ...input, key: "uploads/alice/pictures/old.png" }));
	const replacement = await database.run(() => registerOwnedFile({ ...input, key: "uploads/alice/pictures/new.png" }));
	await database.run(() => accountAuth.updateProfile(owner, { image: old.url }));
	await database.run(() => accountAuth.updateProfile(owner, { image: replacement.url }));
	await expect(
		database.run(() => authorizeOwnedFile({ userId: "alice", key: "uploads/alice/pictures/old.png" })),
	).rejects.toThrow();
	expect(
		(await database.run(() => authorizeOwnedFile({ userId: "alice", key: "uploads/alice/pictures/new.png" }))).id,
	).toBe(replacement.id);
});
it("deletion_barrier_rejects_registration", async () => {
	await database.admin().query("UPDATE \"user\" SET data_deletion_requested_at=now() WHERE id='alice'");
	await expect(
		database.run(() => registerOwnedFile({ ...input, key: "uploads/alice/pictures/late.png" })),
	).rejects.toThrow("ACCOUNT_DELETION_PENDING");
});
it("closed admission rejects upload before storage I/O", async () => {
	const { uploadFile } = await import("./service");
	const remove = vi.fn().mockResolvedValue(true);
	const write = vi.fn().mockResolvedValue(undefined);
	configureStorageService({ read, write, delete: remove, list: vi.fn(), healthcheck: vi.fn() });
	await expect(
		database.run(() => uploadFile({ userId: "alice", data: new Uint8Array([1]), contentType: "image/png" })),
	).rejects.toThrow("ACCOUNT_DELETION_PENDING");
	expect(write).not.toHaveBeenCalled();
	expect(remove).not.toHaveBeenCalled();
});
it("a held upload prevents erasure and cannot publish after deletion admission", async () => {
	const { uploadFile } = await import("./service");
	const { syntheticAccountSession } = await import("../privacy/testing/account");
	const { requestAccountDeletion, runDeletionWork } = await import("../privacy/deletion");
	const session = await syntheticAccountSession(database, "bob");
	let finish!: () => void;
	let started!: () => void;
	const ready = new Promise<void>((resolve) => {
		started = resolve;
	});
	const objects = new Set<string>();
	configureStorageService({
		read: vi.fn(),
		healthcheck: vi.fn(),
		list: vi.fn(async (prefix: string) => [...objects].filter((key) => key.startsWith(prefix))),
		delete: vi.fn(async (key: string) => objects.delete(key)),
		write: vi.fn(async ({ key }: { key: string }) => {
			started();
			await new Promise<void>((resolve) => {
				finish = resolve;
			});
			objects.add(key);
		}),
	});
	const upload = database
		.run(() => uploadFile({ userId: "bob", data: new Uint8Array([1]), contentType: "image/png" }))
		.then(
			() => null,
			(error) => error,
		);
	await ready;
	await database.run(async () =>
		requestAccountDeletion({ headers: session.headers, ...(await session.proof("delete_account")), confirmed: true }),
	);
	const workId = (
		await database.admin().query("SELECT id FROM privacy_work WHERE user_id='bob' AND kind='delete_account'")
	).rows[0].id;
	const run = () =>
		database.run(() =>
			runDeletionWork({ workId, hooks: { stopRenewals: async () => "not_applicable" }, processors: [] }),
		);
	await run();
	expect((await database.admin().query("SELECT id FROM \"user\" WHERE id='bob'")).rowCount).toBe(1);
	finish();
	expect(await upload).toBeInstanceOf(Error);
	expect(objects.size).toBe(0);
	await database.admin().query("UPDATE privacy_work SET due_at=now() WHERE id=$1", [workId]);
	await run();
	expect((await database.admin().query("SELECT id FROM \"user\" WHERE id='bob'")).rowCount).toBe(0);
});
