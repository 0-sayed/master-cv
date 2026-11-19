import { expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { db, withDatabaseOwner } from "@reactive-resume/db/client";
import * as schema from "@reactive-resume/db/schema";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { generateId } from "@reactive-resume/utils/string";
import { withAiRuntime } from "../ai/route-policy";
import { aiTestDatabase } from "../ai/testing/database";
import { syntheticReviewRuntime } from "../ai/testing/runtime";
import { resumeService } from "../resume/service";
import { writeVersion } from "../resume/version-history";
import { applicationService } from "./service";

const database = aiTestDatabase();
const run = <T>(owner: string, work: () => T) =>
	database.run(() => withDatabaseOwner(owner, () => withAiRuntime(syntheticReviewRuntime, work)));
async function cv(owner: string) {
	const id = generateId();
	const data = structuredClone(defaultResumeData);
	await run(owner, () => db.insert(schema.resume).values({ id, userId: owner, name: "Synthetic CV", slug: id, data }));
	const version = await run(owner, () => writeVersion(db, { resumeId: id, userId: owner, data, kind: "created" }));
	if (!version) throw new Error("Created CV must have a version");
	return { id, version };
}

it("keeps an explicitly selected CV version through reopening and recorded stages", async () => {
	const resume = await cv("alice");
	const id = await run("alice", () =>
		applicationService.create({
			userId: "alice",
			company: "Synthetic",
			role: "Engineer",
			resumeId: resume.id,
			selectedResumeVersionId: resume.version.id,
		}),
	);
	const original = await run("alice", () => applicationService.getById({ userId: "alice", id }));
	expect(original.selectedResumeVersionId).toBe(resume.version.id);
	await run("alice", () =>
		resumeService.versions.create({ userId: "alice", resumeId: resume.id, name: "Later version" }),
	);
	const applied = await run("alice", () =>
		applicationService.update({
			userId: "alice",
			id,
			expectedUpdatedAt: original.updatedAt.toISOString(),
			status: "applied",
		}),
	);
	expect(applied.sentResumeVersionId).not.toBe(resume.version.id);
	expect(applied.sentResumeVersionId).not.toBeNull();
	const interview = await run("alice", () =>
		applicationService.update({
			userId: "alice",
			id,
			expectedUpdatedAt: applied.updatedAt.toISOString(),
			status: "interview",
		}),
	);
	expect(interview.selectedResumeVersionId).toBe(resume.version.id);
	expect(interview.sentResumeVersionId).toBe(applied.sentResumeVersionId);
	await expect(
		run("alice", () =>
			applicationService.update({
				userId: "alice",
				id,
				expectedUpdatedAt: original.updatedAt.toISOString(),
				notes: "stale overwrite",
			}),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect((await run("alice", () => applicationService.getById({ userId: "alice", id }))).notes).toBeNull();
	await run("alice", () => db.delete(schema.resumeVersion).where(eq(schema.resumeVersion.id, resume.version.id)));
	const reopened = await run("alice", () => applicationService.getById({ userId: "alice", id }));
	const offer = await run("alice", () =>
		applicationService.update({
			userId: "alice",
			id,
			expectedUpdatedAt: reopened.updatedAt.toISOString(),
			status: "offer",
		}),
	);
	expect(offer.sentResumeVersionId).toBe(applied.sentResumeVersionId);
});

it("denies foreign, missing and mismatched CV versions without creating a record", async () => {
	const own = await cv("alice");
	const other = await cv("alice");
	const foreign = await cv("bob");
	for (const selectedResumeVersionId of [foreign.version.id, other.version.id, "missing-version"]) {
		await expect(
			run("alice", () =>
				applicationService.create({
					userId: "alice",
					company: "Denied",
					role: "Engineer",
					resumeId: own.id,
					selectedResumeVersionId,
				}),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	}
	await expect(
		run("alice", () =>
			applicationService.create({
				userId: "alice",
				company: "Denied",
				role: "Engineer",
				selectedResumeVersionId: own.version.id,
			}),
		),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(
		(await run("alice", () => applicationService.list({ userId: "alice" }))).filter((row) => row.company === "Denied"),
	).toHaveLength(0);
});

it("denies cross-owner reads, updates and deletion", async () => {
	const id = await run("alice", () =>
		applicationService.create({ userId: "alice", company: "Private", role: "Engineer" }),
	);
	await expect(run("bob", () => applicationService.getById({ userId: "bob", id }))).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	await expect(
		run("bob", () =>
			applicationService.update({ userId: "bob", id, expectedUpdatedAt: new Date().toISOString(), notes: "foreign" }),
		),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	await expect(run("bob", () => applicationService.delete({ userId: "bob", id }))).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
});

it("records an immutable copy of an autosave and allows unrelated updates after trashing the CV", async () => {
	const resume = await cv("alice");
	const saved = await run("alice", () =>
		writeVersion(db, {
			resumeId: resume.id,
			userId: "alice",
			data: defaultResumeData,
			kind: "auto",
			sessionId: "test-session",
		}),
	);
	if (!saved) throw new Error("Autosave missing");
	const id = await run("alice", () =>
		applicationService.create({
			userId: "alice",
			company: "Snapshot",
			role: "Engineer",
			status: "applied",
			resumeId: resume.id,
			selectedResumeVersionId: saved.id,
		}),
	);
	const applied = await run("alice", () => applicationService.getById({ userId: "alice", id }));
	const changed = structuredClone(defaultResumeData);
	changed.basics.name = "Later edit";
	await run("alice", () =>
		db.update(schema.resumeVersion).set({ data: changed }).where(eq(schema.resumeVersion.id, saved.id)),
	);
	const recorded = await run("alice", () =>
		db
			.select()
			.from(schema.resumeVersion)
			.where(eq(schema.resumeVersion.id, String(applied.sentResumeVersionId))),
	);
	expect(recorded[0]).toMatchObject({ kind: "sent", data: { basics: { name: defaultResumeData.basics.name } } });
	await run("alice", () =>
		db.update(schema.resume).set({ trashedAt: new Date() }).where(eq(schema.resume.id, resume.id)),
	);
	const edited = await run("alice", () =>
		applicationService.update({
			userId: "alice",
			id,
			expectedUpdatedAt: applied.updatedAt.toISOString(),
			notes: "Still editable",
			status: "interview",
		}),
	);
	expect(edited.notes).toBe("Still editable");
	expect(edited.sentResumeVersionId).toBe(applied.sentResumeVersionId);
});

it("preserves sent snapshots and old rows through restore, exact undo, and stale undo", async () => {
	const resume = await cv("alice");
	const id = await run("alice", () =>
		applicationService.create({
			userId: "alice",
			company: "Synthetic undo",
			role: "Engineer",
			resumeId: resume.id,
			selectedResumeVersionId: resume.version.id,
		}),
	);
	const created = await run("alice", () => applicationService.getById({ userId: "alice", id }));
	const applied = await run("alice", () =>
		applicationService.update({
			userId: "alice",
			id,
			expectedUpdatedAt: created.updatedAt.toISOString(),
			status: "applied",
		}),
	);
	const oldRows = await run("alice", () =>
		db.select().from(schema.resumeVersion).where(eq(schema.resumeVersion.resumeId, resume.id)),
	);
	const original = await run("alice", () => resumeService.getById({ id: resume.id, userId: "alice" }));
	const changed = structuredClone(original.data);
	changed.basics.name = "Saved before restore";
	const edited = await run("alice", () =>
		resumeService.update({ id: resume.id, userId: "alice", data: changed, expectedUpdatedAt: original.updatedAt }),
	);
	const restored = await run("alice", () =>
		resumeService.versions.restore({
			resumeId: resume.id,
			versionId: resume.version.id,
			userId: "alice",
			expectedUpdatedAt: edited.updatedAt,
		}),
	);
	const checkpoint = await run("alice", () =>
		resumeService.versions.get({ resumeId: resume.id, versionId: restored.beforeRestoreVersionId, userId: "alice" }),
	);
	expect(checkpoint).toMatchObject({ kind: "before-restore", data: changed });
	const undone = await run("alice", () =>
		resumeService.versions.restore({
			resumeId: resume.id,
			versionId: restored.beforeRestoreVersionId,
			userId: "alice",
			expectedUpdatedAt: restored.updatedAt,
		}),
	);
	expect(undone.data).toEqual(changed);
	const later = structuredClone(changed);
	later.basics.name = "Later saved work";
	const saved = await run("alice", () =>
		resumeService.update({ id: resume.id, userId: "alice", data: later, expectedUpdatedAt: undone.updatedAt }),
	);
	await expect(
		run("alice", () =>
			resumeService.versions.restore({
				resumeId: resume.id,
				versionId: restored.beforeRestoreVersionId,
				userId: "alice",
				expectedUpdatedAt: restored.updatedAt,
			}),
		),
	).rejects.toMatchObject({ code: "RESUME_VERSION_CONFLICT" });
	expect((await run("alice", () => resumeService.getById({ id: resume.id, userId: "alice" }))).data).toEqual(
		saved.data,
	);
	const application = await run("alice", () => applicationService.getById({ userId: "alice", id }));
	expect(application.sentResumeVersionId).toBe(applied.sentResumeVersionId);
	expect(application.selectedResumeVersionId).toBe(applied.selectedResumeVersionId);
	const afterRows = await run("alice", () =>
		db.select().from(schema.resumeVersion).where(eq(schema.resumeVersion.resumeId, resume.id)),
	);
	for (const old of oldRows) expect(afterRows.find((row) => row.id === old.id)).toEqual(old);
});
