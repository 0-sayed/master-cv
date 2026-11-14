import { expect, it } from "vite-plus/test";
import { withDatabaseOwner } from "@reactive-resume/db/client";
import { aiTestDatabase } from "../ai/testing/database";
import { saveJobTarget } from "../career/job-targets";
import { resumeService } from "./service";
import { createVariant, getVariantFreshness, listVariants } from "./variants";

const database = aiTestDatabase();
const owned = <T>(owner: string, work: () => T) => database.run(() => withDatabaseOwner(owner, work));
it("creates untouched private independent copies with idempotency and root allowance races", async () => {
	const base = await owned("alice", () =>
		resumeService.create({ userId: "alice", name: "Original", tags: [], locale: "ar-SA" }),
	);
	const original = (await database.admin().query("SELECT data,updated_at FROM resume WHERE id=$1", [base])).rows[0];
	const input = {
		sourceResumeId: base,
		expectedUpdatedAt: original.updated_at.toISOString(),
		requestKey: "language-copy",
		variantKind: "language" as const,
		targetLocale: "en-US" as const,
	};
	const copy = await owned("alice", () => createVariant("alice", input));
	expect(copy).toMatchObject({
		baseResumeId: base,
		documentLocale: "ar-SA",
		targetLocale: "en-US",
		reviewState: "pending",
	});
	expect(
		(await database.admin().query("SELECT data,is_public FROM resume WHERE id=$1", [copy.resumeId])).rows[0],
	).toEqual({ data: original.data, is_public: false });
	expect(await owned("alice", () => createVariant("alice", input))).toEqual(copy);
	await expect(owned("alice", () => createVariant("alice", { ...input, targetLocale: "ar-SA" }))).rejects.toMatchObject(
		{ code: "CONFLICT" },
	);
	await expect(owned("bob", () => createVariant("bob", { ...input, requestKey: "foreign" }))).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	await expect(
		owned("alice", () =>
			createVariant("alice", { ...input, requestKey: "stale", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	const job = await owned("alice", () => saveJobTarget("alice", { role: "Engineer", employer: "", text: "React" }));
	const source = (await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [copy.resumeId])).rows[0];
	const race = await Promise.allSettled(
		["job-one", "job-two"].map((requestKey) =>
			owned("alice", () =>
				createVariant("alice", {
					sourceResumeId: copy.resumeId,
					expectedUpdatedAt: source.updated_at.toISOString(),
					requestKey,
					variantKind: "job",
					jobId: job.jobId,
					jobRevision: job.revision,
				}),
			),
		),
	);
	expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	const jobCopy = race.find((result) => result.status === "fulfilled");
	if (jobCopy?.status !== "fulfilled") throw new Error("Missing job copy");
	expect(jobCopy.value.baseResumeId).toBe(base);
	const family = await owned("alice", () => listVariants("alice", copy.resumeId));
	expect(new Set(family.map((document) => document.resumeId))).toEqual(
		new Set([base, copy.resumeId, jobCopy.value.resumeId]),
	);
	await expect(owned("bob", () => listVariants("bob", base))).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(race.find((result) => result.status === "rejected")).toMatchObject({
		reason: { data: { reason: "JOB_COPY_LIMIT" } },
	});
	expect((await database.admin().query("SELECT count(*)::int AS n FROM ai_operation")).rows[0].n).toBe(0);
	expect((await owned("alice", () => getVariantFreshness("alice", copy.resumeId))).state).toBe("current");
	await owned("alice", () => resumeService.update({ userId: "alice", id: base, name: "Changed" }));
	expect((await owned("alice", () => getVariantFreshness("alice", copy.resumeId))).state).toBe("stale");
	await owned("alice", () => resumeService.delete({ userId: "alice", id: base }));
	expect((await owned("alice", () => getVariantFreshness("alice", copy.resumeId))).state).toBe("unavailable");
	expect((await database.admin().query("SELECT data FROM resume WHERE id=$1", [copy.resumeId])).rows[0].data).toEqual(
		original.data,
	);
});

it("denies locked/trashed copies and stales only pinned linked facts", async () => {
	const base = await owned("bob", () =>
		resumeService.create({ userId: "bob", name: "Source", tags: [], locale: "en-US" }),
	);
	const original = (await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [base])).rows[0];
	const input = {
		sourceResumeId: base,
		expectedUpdatedAt: original.updated_at.toISOString(),
		requestKey: "bob-language",
		variantKind: "language" as const,
		targetLocale: "ar-SA" as const,
	};
	await database.admin().query("UPDATE resume SET is_locked=true WHERE id=$1", [base]);
	await expect(owned("bob", () => createVariant("bob", input))).rejects.toMatchObject({ code: "RESUME_LOCKED" });
	await database.admin().query("UPDATE resume SET is_locked=false,trashed_at=now() WHERE id=$1", [base]);
	await expect(owned("bob", () => createVariant("bob", input))).rejects.toMatchObject({ code: "NOT_FOUND" });
	await database.admin().query("UPDATE resume SET trashed_at=null WHERE id=$1", [base]);
	await database
		.admin()
		.query(
			"INSERT INTO career_fact(id,user_id,text,category,source,source_key) VALUES ('linked','bob','React','skills','{}','linked'),('unlinked','bob','SAP','skills','{}','unlinked')",
		);
	await database
		.admin()
		.query(
			'INSERT INTO career_fact_revision(user_id,fact_id,revision,structured,removed) VALUES (\'bob\',\'linked\',1,\'{"section":"skills","entityId":"skill","field":"name","value":"React"}\',false)',
		);
	await database
		.admin()
		.query("INSERT INTO resume_fact_link(user_id,resume_id,fact_id,accepted_revision) VALUES ('bob',$1,'linked',1)", [
			base,
		]);
	const copy = await owned("bob", () => createVariant("bob", input));
	expect(
		(
			await database
				.admin()
				.query("SELECT fact_id,accepted_revision FROM resume_fact_link WHERE resume_id=$1", [copy.resumeId])
		).rows,
	).toEqual([{ fact_id: "linked", accepted_revision: 1 }]);
	await database.admin().query("UPDATE career_fact SET revision=2 WHERE id='unlinked'");
	expect((await owned("bob", () => getVariantFreshness("bob", copy.resumeId))).state).toBe("current");
	await database.admin().query("UPDATE career_fact SET revision=2 WHERE id='linked'");
	expect(await owned("bob", () => getVariantFreshness("bob", copy.resumeId))).toMatchObject({
		state: "stale",
		staleFactIds: ["linked"],
	});
	await database.admin().query("DELETE FROM \"user\" WHERE id='bob'");
	expect((await database.admin().query("SELECT * FROM resume_variant_source WHERE user_id='bob'")).rows).toEqual([]);
});
