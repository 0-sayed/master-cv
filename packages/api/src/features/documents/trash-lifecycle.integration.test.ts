// Exercise retained internals without changing the production release policy.
vi.mock("@reactive-resume/schema/personal-tools", async (original) => ({
	...(await original<typeof import("@reactive-resume/schema/personal-tools")>()),
	isFeatureAvailable: (feature: string) => ["publicSharing"].includes(feature),
}));
import { expect, it, vi } from "vite-plus/test";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { resume } from "@reactive-resume/db/schema";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { privacyTestDatabase } from "../privacy/testing/database";
import { documentsService } from "./service";
const database = privacyTestDatabase({ restrictedMigrationOwner: true });
it("blocks permanently malformed purge work instead of endlessly retrying it", async () => {
	const { purgeTrashedDocument } = await import("./purge");
	await database
		.admin()
		.query(
			"INSERT INTO privacy_work(id,user_id,kind,request_id,key,payload) VALUES ('bad-purge','alice','purge_document','bad','bad-purge','{}')",
		);
	await expect(database.run(() => purgeTrashedDocument({ workId: "bad-purge" }))).rejects.toThrow(
		"PURGE_PAYLOAD_INVALID",
	);
	expect(
		(await database.admin().query("SELECT status,attempts FROM privacy_work WHERE id='bad-purge'")).rows[0],
	).toEqual({ status: "blocked", attempts: 1 });
	await database.run(() => purgeTrashedDocument({ workId: "bad-purge" }));
	expect(
		(await database.admin().query("SELECT attempts FROM privacy_work WHERE id='bad-purge'")).rows[0].attempts,
	).toBe(1);
});
it("rejects restore of a live public resume without changing publication", async () => {
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx.insert(resume).values({
				id: "live-public",
				userId: "alice",
				name: "Live",
				slug: "live-public",
				data: defaultResumeData,
				isPublic: true,
				showDownloadButtons: true,
			});
			await expect(documentsService.restore({ userId: "alice", type: "resume", id: "live-public" })).rejects.toThrow(
				"Document is not in Trash.",
			);
		}),
	);
	expect(
		(await database.admin().query("SELECT is_public,show_download_buttons FROM resume WHERE id='live-public'")).rows[0],
	).toEqual({ is_public: true, show_download_buttons: true });
});
it("restore_shared_language_copy_stays_private_after_reload", async () => {
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx
				.insert(resume)
				.values({ id: "base", userId: "alice", name: "Base", slug: "base", data: defaultResumeData });
			await tx.insert(resume).values({
				id: "language",
				userId: "alice",
				name: "English",
				slug: "english",
				baseResumeId: "base",
				variantKind: "language",
				isPublic: true,
				showDownloadButtons: true,
				trashedAt: new Date(),
				data: defaultResumeData,
			});
			const { resumeService } = await import("../resume/service");
			await expect(resumeService.setLocked({ userId: "alice", id: "language", isLocked: true })).rejects.toThrow();
			await documentsService.restore({ userId: "alice", type: "resume", id: "language" });
		}),
	);
	const [restored] = (
		await database
			.admin()
			.query(
				"SELECT is_public,show_download_buttons,trashed_at,base_resume_id,variant_kind,data FROM resume WHERE id='language'",
			)
	).rows;
	expect(restored).toMatchObject({
		is_public: false,
		show_download_buttons: false,
		trashed_at: null,
		base_resume_id: "base",
		variant_kind: "language",
	});
	expect(restored.data).toEqual(defaultResumeData);
	expect((await database.queryAs("bob", "SELECT id FROM resume WHERE id='language'")).rows).toEqual([]);
});
it("purge_schedules_without_visit_and_retries_after_restart", async () => {
	const { scheduleTrashPurges, purgeTrashedDocument } = await import("./purge");
	const { configureStorageService } = await import("../storage/service");
	const remove = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
	configureStorageService({
		delete: remove,
		list: vi.fn().mockResolvedValue([]),
		write: vi.fn(),
		read: vi.fn(),
		healthcheck: vi.fn(),
	});
	await database.admin().query("UPDATE resume SET trashed_at=now()-interval '31 days' WHERE id='language'");
	const policy = { enabled: true, version: "synthetic-30d", retentionMs: 30 * 86400000 };
	expect(await database.run(() => scheduleTrashPurges({ policy, now: new Date(), limit: 10 }))).toBe(1);
	expect(await database.run(() => scheduleTrashPurges({ policy, now: new Date(), limit: 10 }))).toBe(0);
	const id = (
		await database.queryAs("alice", "SELECT id FROM privacy_work WHERE kind='purge_document' AND request_id='language'")
	).rows[0].id;
	await expect(database.run(() => purgeTrashedDocument({ workId: id }))).rejects.toThrow();
	expect((await database.admin().query("SELECT id FROM resume WHERE id='language'")).rowCount).toBe(1);
	await database.admin().query("UPDATE privacy_work SET due_at=now() WHERE id=$1", [id]);
	await database.run(() => purgeTrashedDocument({ workId: id }));
	expect((await database.admin().query("SELECT id FROM resume WHERE id='language'")).rowCount).toBe(0);
	expect((await database.queryAs("alice", "SELECT status FROM privacy_work WHERE id=$1", [id])).rows[0].status).toBe(
		"complete",
	);
});
it("restore_or_new_trash_timestamp_cancels_old_purge", async () => {
	const { scheduleTrashPurges, purgeTrashedDocument } = await import("./purge");
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx.insert(resume).values({
				id: "restore-before-purge",
				userId: "alice",
				name: "Retain",
				slug: "retain",
				data: defaultResumeData,
				trashedAt: new Date(Date.now() - 32 * 86400000),
			});
		}),
	);
	await database.run(() =>
		scheduleTrashPurges({
			policy: { enabled: true, version: "synthetic-30d", retentionMs: 30 * 86400000 },
			now: new Date(),
			limit: 10,
		}),
	);
	const id = (await database.queryAs("alice", "SELECT id FROM privacy_work WHERE request_id='restore-before-purge'"))
		.rows[0].id;
	await database.run(() =>
		withOwnerDatabase("alice", () =>
			documentsService.restore({ userId: "alice", type: "resume", id: "restore-before-purge" }),
		),
	);
	await database.run(() => purgeTrashedDocument({ workId: id }));
	expect((await database.admin().query("SELECT id FROM resume WHERE id='restore-before-purge'")).rowCount).toBe(1);
	expect((await database.queryAs("alice", "SELECT status FROM privacy_work WHERE id=$1", [id])).rows[0].status).toBe(
		"cancelled",
	);
});
it("restore_racing_publish_requires_fresh_owner_publish", async () => {
	const { resumeService } = await import("../resume/service");
	await expect(
		database.run(() =>
			withOwnerDatabase("alice", () =>
				resumeService.update({ userId: "alice", id: "restore-before-purge", isPublic: true }),
			),
		),
	).rejects.toThrow();
	const date = (await database.admin().query("SELECT updated_at FROM resume WHERE id='restore-before-purge'")).rows[0]
		.updated_at;
	await database.run(() =>
		withOwnerDatabase("alice", () =>
			resumeService.update({ userId: "alice", id: "restore-before-purge", isPublic: true, expectedUpdatedAt: date }),
		),
	);
	expect(
		(await database.admin().query("SELECT is_public FROM resume WHERE id='restore-before-purge'")).rows[0].is_public,
	).toBe(true);
});
