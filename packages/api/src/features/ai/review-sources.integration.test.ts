import { beforeAll, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { experienceItemSchema } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { discoverAiOwners } from "./operations";
import {
	createImportReviewSource,
	loadReviewSource,
	prepareResumeReview,
	removeExpiredReviewSources,
} from "./review-sources";
import { aiTestDatabase } from "./testing/database";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("private review sources", () => {
	const database = aiTestDatabase();
	beforeAll(async () => {
		const data = structuredClone(defaultResumeData);
		data.summary.content = "<p>Built services.</p>";
		await database
			.admin()
			.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ('cv','alice','Synthetic','cv',$1)", [
				JSON.stringify(data),
			]);
	});
	it("minimizes staged text and denies cross-owner, forged digests and expired sources", async () => {
		const staged = await database.run(() =>
			createImportReviewSource("alice", {
				flowId: "flow1",
				section: "experience",
				text: "Built services. Contact test@example.test +201234567890",
				partial: true,
				contactValues: ["test@example.test", "+201234567890"],
			}),
		);
		const load = (owner: string, source = staged.source) =>
			database.run(() => withOwnerDatabase(owner, (tx) => loadReviewSource(tx, owner, source)));
		const snapshot = await load("alice");
		expect(snapshot.partial).toBe(true);
		expect(snapshot.evidence[0]?.confirmation).toBe("source_unconfirmed");
		expect(JSON.stringify(snapshot)).not.toContain("test@example.test");
		expect(JSON.stringify(snapshot)).not.toContain("201234567890");
		await expect(load("bob")).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(load("alice", { ...staged.source, revision: "forged" })).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			(
				await database.run(() =>
					withOwnerDatabase("bob", (tx) => tx.execute(sql`SELECT id FROM ai_import_review_source`)),
				)
			).rows,
		).toEqual([]);
		await database
			.admin()
			.query("UPDATE ai_import_review_source SET expires_at=now()-interval '1 second' WHERE id=$1", [staged.source.id]);
		await expect(load("alice")).rejects.toMatchObject({ data: { reason: "AI_SOURCE_EXPIRED" } });
		expect(await database.run(() => discoverAiOwners())).toContain("alice");
		await database.run(() => removeExpiredReviewSources("bob"));
		expect(
			(await database.admin().query("SELECT id FROM ai_import_review_source WHERE id=$1", [staged.source.id])).rows,
		).toHaveLength(1);
		await database.run(() => removeExpiredReviewSources("alice"));
		await expect(load("alice")).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
	it("prepares saved passages only and rejects stale, locked or foreign CVs", async () => {
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id='cv'")
		).rows[0].updated_at.toISOString();
		const prepare = (owner = "alice", expectedUpdatedAt = revision) =>
			database.run(() =>
				prepareResumeReview(owner, {
					resumeId: "cv",
					expectedUpdatedAt,
					targets: [{ sectionId: "summary", field: "content" }],
				}),
			);
		const prepared = await prepare();
		expect(prepared.evidence[0]).toMatchObject({
			quote: "Built services.",
			confirmation: "confirmed",
			factId: null,
			factRevision: null,
		});
		await expect(prepare("bob")).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(prepare("alice", "2000-01-01T00:00:00.000Z")).rejects.toMatchObject({ code: "CONFLICT" });
		await database.admin().query("UPDATE resume SET is_locked=true WHERE id='cv'");
		await expect(prepare()).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("includes only linked facts for the selected entity and refuses stale or removed revisions", async () => {
		const data = structuredClone(defaultResumeData);
		data.sections.experience.items = [
			experienceItemSchema.parse({
				id: "entry",
				hidden: false,
				company: "Acme",
				position: "Engineer",
				location: "",
				period: "",
				website: { url: "", label: "" },
				description: "<p>Built services.</p>",
			}),
		];
		const revision = (
			await database
				.admin()
				.query(
					"INSERT INTO resume(id,user_id,name,slug,data) VALUES ('linked-cv','alice','Synthetic','linked-cv',$1) RETURNING updated_at",
					[JSON.stringify(data)],
				)
		).rows[0].updated_at.toISOString();
		await database.admin().query("INSERT INTO career_profile(user_id,data,profile_revision) VALUES ('alice','{}',1)");
		for (const entityId of ["entry", "unrelated"]) {
			const structured = {
				section: "experience",
				entityId,
				field: "description",
				value: "Built services.",
				source: { kind: "manual", id: "", quote: "" },
			};
			await database
				.admin()
				.query(
					"INSERT INTO career_fact(id,user_id,text,category,source,source_key,structured,confirmation) VALUES ($1,'alice','Built services.','experience','{}',$1,$2,'confirmed')",
					[entityId, structured],
				);
			await database
				.admin()
				.query("INSERT INTO career_fact_revision(user_id,fact_id,revision,structured) VALUES ('alice',$1,1,$2)", [
					entityId,
					structured,
				]);
			await database
				.admin()
				.query(
					"INSERT INTO resume_fact_link(user_id,resume_id,fact_id,accepted_revision) VALUES ('alice','linked-cv',$1,1)",
					[entityId],
				);
		}
		const prepare = () =>
			database.run(() =>
				prepareResumeReview("alice", {
					resumeId: "linked-cv",
					expectedUpdatedAt: revision,
					targets: [{ sectionId: "experience", itemId: "entry", field: "description" }],
				}),
			);
		const prepared = await prepare();
		expect(prepared.evidence.filter((entry) => entry.factId).map((entry) => entry.factId)).toEqual(["entry"]);
		expect(prepared.sources).toContainEqual({ kind: "career", id: "alice", revision: "1" });
		await database.admin().query("UPDATE career_fact SET revision=2 WHERE id='entry'");
		await expect(prepare()).rejects.toMatchObject({ data: { reason: "AI_SOURCE_CHANGED" } });
		await database.admin().query("UPDATE career_fact SET revision=1,status='removed' WHERE id='entry'");
		await expect(prepare()).rejects.toMatchObject({ data: { reason: "AI_SOURCE_CHANGED" } });
	});
});
