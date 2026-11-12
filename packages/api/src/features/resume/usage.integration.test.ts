import { describe, expect, it } from "vite-plus/test";
import { withDatabaseOwner } from "@reactive-resume/db/client";
import { aiTestDatabase } from "../ai/testing/database";
import { usageService } from "../ai/usage";
import { resumeService } from "./service";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("Start CV admission", () => {
	const database = aiTestDatabase();
	const owned = <T>(work: () => T) => database.run(() => withDatabaseOwner("alice", work));
	it("allows one racing base, one copy of each kind, and independent revision histories", async () => {
		const race = await Promise.allSettled(
			["First", "Second"].map((name) =>
				owned(() => resumeService.create({ userId: "alice", name, tags: [], locale: "en-US" })),
			),
		);
		expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(race.find((r) => r.status === "rejected")).toMatchObject({
			reason: { code: "PRECONDITION_FAILED", data: { reason: "BASE_CV_LIMIT" } },
		});
		const winner = race.find((r) => r.status === "fulfilled");
		if (winner?.status !== "fulfilled") throw new Error("Missing base");
		const base = winner.value;
		const input = { userId: "alice", name: "Copy", tags: [], locale: "en-US" as const };
		// Creation metadata is internal service input, not permission to forge a base owner.
		const language = await owned(() =>
			resumeService.create({ ...input, creation: { variantKind: "language", baseResumeId: base } }),
		);
		const job = await owned(() =>
			resumeService.create({ ...input, creation: { variantKind: "job", baseResumeId: language } }),
		);
		const copies = await database
			.admin()
			.query("SELECT id,base_resume_id,variant_kind FROM resume WHERE id=ANY($1::text[]) ORDER BY variant_kind", [
				[language, job],
			]);
		expect(copies.rows).toEqual([
			{ id: job, base_resume_id: base, variant_kind: "job" },
			{ id: language, base_resume_id: base, variant_kind: "language" },
		]);
		await expect(
			owned(() => resumeService.create({ ...input, creation: { variantKind: "language", baseResumeId: base } })),
		).rejects.toMatchObject({ data: { reason: "LANGUAGE_COPY_LIMIT" } });
		await expect(
			database.run(() =>
				withDatabaseOwner("bob", () =>
					resumeService.create({ ...input, userId: "bob", creation: { variantKind: "job", baseResumeId: base } }),
				),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect((await database.admin().query("SELECT resume_id FROM resume_version ORDER BY resume_id")).rows).toHaveLength(
			3,
		);
	});
	it("counts trashed bases, preserves promoted copies and permits existing over-limit edits", async () => {
		const [base] = (await database.admin().query("SELECT id FROM resume WHERE user_id='alice' AND variant_kind='base'"))
			.rows;
		await database.admin().query("UPDATE resume SET trashed_at=now() WHERE id=$1", [base.id]);
		await expect(
			owned(() => resumeService.create({ userId: "alice", name: "Blocked", tags: [], locale: "en-US" })),
		).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
		await database.admin().query("UPDATE resume SET trashed_at=NULL WHERE id=$1", [base.id]);
		await owned(() => resumeService.delete({ id: base.id, userId: "alice" }));
		const promoted = (
			await database.admin().query("SELECT id,variant_kind,base_resume_id,data FROM resume WHERE user_id='alice'")
		).rows;
		expect(promoted).toHaveLength(2);
		expect(promoted.every((row) => row.variant_kind === "base" && row.base_resume_id === null)).toBe(true);
		expect((await owned(() => usageService.getStartUsage("alice"))).baseCvs.used).toBe(2);
		await expect(
			owned(() => resumeService.create({ userId: "alice", name: "Still blocked", tags: [], locale: "en-US" })),
		).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
		for (const variantKind of ["language", "job"] as const) {
			await expect(
				owned(() =>
					resumeService.create({
						userId: "alice",
						name: "Blocked copy",
						tags: [],
						locale: "en-US",
						creation: { variantKind, baseResumeId: promoted[0].id },
					}),
				),
			).rejects.toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
		}
		for (const copy of promoted) {
			await owned(() => resumeService.update({ id: copy.id, userId: "alice", name: "Retained and editable" }));
			expect(
				(await database.admin().query("SELECT count(*)::int AS n FROM resume_version WHERE resume_id=$1", [copy.id]))
					.rows[0].n,
			).toBeGreaterThan(0);
		}
	});
});
