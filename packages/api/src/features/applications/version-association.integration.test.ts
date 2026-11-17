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
	expect(applied.sentResumeVersionId).toBe(resume.version.id);
	const interview = await run("alice", () =>
		applicationService.update({
			userId: "alice",
			id,
			expectedUpdatedAt: applied.updatedAt.toISOString(),
			status: "interview",
		}),
	);
	expect(interview.selectedResumeVersionId).toBe(resume.version.id);
	expect(interview.sentResumeVersionId).toBe(resume.version.id);
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
	expect(offer.sentResumeVersionId).toBeNull();
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
