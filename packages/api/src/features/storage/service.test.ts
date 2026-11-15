import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
const fake = vi.hoisted(() => ({ send: vi.fn(), root: "" }));
vi.mock("@aws-sdk/client-s3", () => ({
	S3Client: class {
		send = fake.send;
	},
	ListObjectsV2Command: class {
		constructor(public input: unknown) {}
	},
	DeleteObjectCommand: class {
		constructor(public input: unknown) {}
	},
	GetObjectCommand: class {
		constructor(public input: unknown) {}
	},
	PutObjectCommand: class {
		constructor(public input: unknown) {}
	},
}));
vi.mock("@reactive-resume/env/server", () => ({
	env: {
		S3_ACCESS_KEY_ID: "synthetic",
		S3_SECRET_ACCESS_KEY: "synthetic",
		S3_BUCKET: "synthetic",
		get LOCAL_STORAGE_PATH() {
			return fake.root;
		},
	},
}));
const service = await import("./service");
beforeAll(async () => {
	fake.root = await mkdtemp(join(tmpdir(), "private-files-"));
});
afterAll(async () => {
	await rm(fake.root, { recursive: true, force: true });
});
it("s3_lists_multiple_pages", async () => {
	fake.send
		.mockReset()
		.mockResolvedValueOnce({
			Contents: [{ Key: "uploads/alice/a" }],
			IsTruncated: true,
			NextContinuationToken: "page2",
		})
		.mockResolvedValueOnce({ Contents: [{ Key: "uploads/alice/b" }], IsTruncated: false });
	const storage = new service.S3StorageService();
	expect(await storage.list("uploads/alice/")).toEqual(["uploads/alice/a", "uploads/alice/b"]);
	expect(fake.send.mock.calls[1]?.[0].input.ContinuationToken).toBe("page2");
});
it("partial_delete_is_failure_and_alice_never_matches_alice2", async () => {
	fake.send
		.mockReset()
		.mockResolvedValueOnce({ Contents: [{ Key: "uploads/alice/a" }, { Key: "uploads/alice2/b" }] })
		.mockRejectedValueOnce(new Error("offline"));
	const storage = new service.S3StorageService();
	await expect(storage.delete("uploads/alice")).rejects.toThrow();
	expect(fake.send).toHaveBeenCalledTimes(2);
	expect(fake.send.mock.calls[1]?.[0].input.Key).toBe("uploads/alice/a");
});
it("outage_is_not_missing", async () => {
	fake.send.mockReset().mockRejectedValueOnce(new Error("offline"));
	await expect(new service.S3StorageService().read("uploads/alice/a")).rejects.toThrow("offline");
});
it("local_private_picture_write_supported_and_inventory_only_files", async () => {
	const storage = new service.LocalStorageService();
	const key = "uploads/alice/pictures/a.png";
	await storage.write({ key, data: new Uint8Array([1]), contentType: "image/png", private: true });
	expect(await storage.list("uploads/alice/")).toEqual([key]);
	expect((await stat(join(fake.root, key))).mode & 0o777).toBe(0o600);
});
it("local_canonical_keys_only", async () => {
	const storage = new service.LocalStorageService();
	await expect(
		storage.write({
			key: "uploads/alice/../bob/private",
			data: new Uint8Array([1]),
			contentType: "text/plain",
			private: true,
		}),
	).rejects.toThrow();
});
