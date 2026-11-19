import { expect, it } from "vite-plus/test";
import { withDatabasePool } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { application, coverLetter, coverLetterVersion, resume } from "@reactive-resume/db/schema";
import { copyCoverLetterStyle } from "@reactive-resume/resume/cover-letter";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { privacyTestDatabase } from "../privacy/testing/database";
import { documentsService } from "./service";

const database = privacyTestDatabase({ restrictedMigrationOwner: true });
const data = structuredClone(defaultResumeData);
data.metadata.template = "onyx";
data.metadata.page.locale = "en-US";
data.metadata.design.colors.primary = "rgba(20, 80, 120, 1)";
const style = copyCoverLetterStyle(defaultResumeData);
style.metadata.template = "azurill";
style.metadata.page.locale = "ar-SA";
const sentStyle = copyCoverLetterStyle(data);
const versionData = {
	name: "Sent English",
	recipient: "",
	content: "Immutable sent body",
	style: sentStyle,
	layout: "freeform" as const,
	recipientName: "",
	recipientCompany: "",
	letterDate: null,
};

it("projects saved identity and linked draft design without changing the letter locale or returning bodies", async () => {
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx
				.insert(application)
				.values({ id: "owned-job", userId: "alice", company: "Synthetic", role: "Engineer", status: "interview" });
			await tx
				.insert(resume)
				.values({ id: "source", userId: "alice", name: "Saved CV", slug: "source", data, applicationId: "owned-job" });
			await tx.insert(coverLetter).values({
				id: "linked",
				userId: "alice",
				name: "خطاب",
				style,
				designLinked: true,
				sourceResumeId: "source",
				sourceApplicationId: "owned-job",
			});
			const list = await documentsService.list({ userId: "alice", trashed: false });
			expect(list.find((item) => item.id === "source")).toMatchObject({
				letterStatus: null,
				metadata: { template: "onyx", locale: "en-US", accent: "rgba(20, 80, 120, 1)" },
			});
			expect(list.find((item) => item.id === "linked")).toMatchObject({
				letterStatus: "draft",
				metadata: { template: "onyx", locale: "ar-SA", accent: "rgba(20, 80, 120, 1)" },
				application: { id: "owned-job", status: "interview" },
			});
			for (const item of list) {
				expect(Object.keys(item).sort()).toEqual(
					[
						"type",
						"id",
						"name",
						"tags",
						"isLocked",
						"isPublic",
						"slug",
						"trashedAt",
						"createdAt",
						"updatedAt",
						"metadata",
						"letterStatus",
						"application",
					].sort(),
				);
			}
		}),
	);
});

it("uses the newest sent snapshot with deterministic ties, ignoring later draft and linked-source edits", async () => {
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx.insert(coverLetter).values({
				id: "sent-letter",
				userId: "alice",
				name: "Changed Arabic draft",
				style,
				designLinked: true,
				sourceResumeId: "source",
			});
			const date = new Date("2026-11-17T10:00:00Z");
			await tx.insert(coverLetterVersion).values([
				{
					id: "sent-1",
					userId: "alice",
					coverLetterId: "sent-letter",
					kind: "sent",
					data: { ...versionData, style },
					createdAt: new Date("2026-11-16T10:00:00Z"),
				},
				{
					id: "sent-2",
					userId: "alice",
					coverLetterId: "sent-letter",
					kind: "sent",
					data: versionData,
					createdAt: date,
				},
				{
					id: "sent-0",
					userId: "alice",
					coverLetterId: "sent-letter",
					kind: "sent",
					data: { ...versionData, style },
					createdAt: date,
				},
			]);
			const list = await documentsService.list({ userId: "alice", trashed: false });
			const summary = list.find((item) => item.id === "sent-letter");
			expect(list.filter((item) => item.id === "sent-letter")).toHaveLength(1);
			expect(summary).toMatchObject({
				letterStatus: "sent",
				metadata: { template: "onyx", locale: "en-US", accent: "rgba(20, 80, 120, 1)" },
			});
			expect(summary).not.toHaveProperty("data");
			expect(summary).not.toHaveProperty("content");
		}),
	);
	const saved = await database.admin().query("SELECT data FROM cover_letter_version WHERE id='sent-2'");
	expect(saved.rows[0].data).toEqual(versionData);
});

it("rejects foreign linked metadata, application and version while retaining stored draft identity", async () => {
	await database.run(() =>
		withOwnerDatabase("bob", async (tx) => {
			await tx
				.insert(resume)
				.values({ id: "foreign-source", userId: "bob", name: "Private CV", slug: "private", data });
			await tx.insert(application).values({
				id: "foreign-job",
				userId: "bob",
				company: "Private company",
				role: "Private role",
				status: "offer",
			});
		}),
	);
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx
				.insert(coverLetter)
				.values({ id: "foreign-links", userId: "alice", name: "My draft", style, designLinked: true });
		}),
	);
	// Inject legacy malformed links in the disposable fixture only, beyond the write-time owner triggers.
	await database
		.admin()
		.query("ALTER TABLE cover_letter DISABLE TRIGGER USER; ALTER TABLE cover_letter_version DISABLE TRIGGER USER");
	try {
		await database
			.admin()
			.query(
				"UPDATE cover_letter SET source_resume_id='foreign-source', source_application_id='foreign-job' WHERE id='foreign-links'",
			);
		await database
			.admin()
			.query(
				"INSERT INTO cover_letter_version(id,user_id,cover_letter_id,kind,data) VALUES ('foreign-version','bob','foreign-links','sent',$1)",
				[versionData],
			);
	} finally {
		await database
			.admin()
			.query("ALTER TABLE cover_letter ENABLE TRIGGER USER; ALTER TABLE cover_letter_version ENABLE TRIGGER USER");
	}
	await database.run(() =>
		withOwnerDatabase("alice", async () => {
			const summary = (await documentsService.list({ userId: "alice", trashed: false })).find(
				(item) => item.id === "foreign-links",
			);
			expect(summary).toMatchObject({
				application: null,
				letterStatus: "draft",
				metadata: { template: "azurill", locale: "ar-SA", accent: style.metadata.design.colors.primary },
			});
		}),
	);
});

it("falls back to stored style for a deleted source and preserves Trash, ordering, counts and letters gate", async () => {
	await database.run(() =>
		withOwnerDatabase("alice", async (tx) => {
			await tx.insert(resume).values({
				id: "deleted-source",
				userId: "alice",
				name: "Removed",
				slug: "removed",
				data,
				trashedAt: new Date(),
			});
			await tx.insert(coverLetter).values([
				{ id: "missing-source", userId: "alice", name: "Stored", style, designLinked: true },
				{
					id: "trashed-source",
					userId: "alice",
					name: "Stored with deleted source",
					style,
					designLinked: true,
					sourceResumeId: "deleted-source",
				},
				{ id: "trash-letter", userId: "alice", name: "Trash", style, trashedAt: new Date() },
			]);
			const list = await documentsService.list({ userId: "alice", trashed: false });
			for (const id of ["missing-source", "trashed-source"])
				expect(list.find((item) => item.id === id)?.metadata).toMatchObject({ template: "azurill", locale: "ar-SA" });
			expect(list.map((item) => item.updatedAt.getTime())).toEqual(
				list.map((item) => item.updatedAt.getTime()).toSorted((a, b) => b - a),
			);
			const cvs = await documentsService.list({ userId: "alice", trashed: false, includeLetters: false });
			expect(cvs.every((item) => item.type === "resume")).toBe(true);
			const trash = await documentsService.list({ userId: "alice", trashed: true });
			expect(trash.map((item) => item.id).sort()).toEqual(["deleted-source", "trash-letter"]);
			const counts = await documentsService.counts({ userId: "alice" });
			expect(counts).toEqual({ resume: cvs.length, letter: list.length - cvs.length, trash: trash.length });
		}),
	);
});

it("retains neutral identity when saved metadata is unavailable", async () => {
	await database
		.admin()
		.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('malformed','alice','Unknown','unknown','{}')");
	await database.run(() =>
		withOwnerDatabase("alice", async () => {
			const list = await documentsService.list({ userId: "alice", trashed: false });
			expect(list.find((item) => item.id === "malformed")).toMatchObject({ metadata: null, letterStatus: null });
		}),
	);
	// A privileged fixture connection proves explicit predicates, independently of forced RLS.
	const list = await withDatabasePool(database.admin(), () =>
		documentsService.list({ userId: "alice", trashed: false }),
	);
	expect(list.find((item) => item.id === "foreign-links")).toMatchObject({
		application: null,
		letterStatus: "draft",
		metadata: { template: "azurill", locale: "ar-SA" },
	});
	expect(list.some((item) => item.id === "foreign-source")).toBe(false);
});
