import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { withDatabaseOwner, withOwnerDatabase } from "@reactive-resume/db/client";
import { educationItemSchema } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { resumeService } from "../resume/service";
import { createVariant } from "../resume/variants";
import { aiTestDatabase } from "./testing/database";
import { decideVariantReview, getVariantReview } from "./variant-decisions";
import { loadVariantSnapshot, prepareVariantReview } from "./variant-sources";
import { validateVariantOutput } from "./variant-validation";

const database = aiTestDatabase();
async function fixture(official = false) {
	await database.admin().query("DELETE FROM resume_variant_source WHERE user_id='alice'");
	await database.admin().query("DELETE FROM resume WHERE user_id='alice'");
	const data = structuredClone(defaultResumeData);
	data.basics.name = "اسم خاص";
	data.basics.email = "private@example.test";
	data.basics.headline = "مهندس";
	data.summary.hidden = false;
	data.summary.title = "نبذة";
	data.summary.content = "<p>استخدمت React في 1445 هـ. لم أدر ميزانية.</p>";
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	if (official) {
		data.sections.education.hidden = false;
		data.sections.education.items = [
			educationItemSchema.parse({
				id: "school",
				hidden: false,
				school: "المعهد المحلي",
				degree: "شهادة إتمام تدريب",
				area: "",
				grade: "",
				location: "",
				period: "1445 هـ",
				website: { url: "https://private.example.test", label: "" },
				description: "",
			}),
		];
		const page = data.metadata.layout.pages[0];
		assert(page);
		page.main.push("education");
	}
	const source = await database.run(() =>
		resumeService.create({ userId: "alice", name: "Synthetic", tags: [], data, locale: "ar-SA" }),
	);
	const sourceRevision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [source])
	).rows[0].updated_at.toISOString();
	const copy = await database.run(() =>
		createVariant("alice", {
			variantKind: "language",
			sourceResumeId: source,
			expectedUpdatedAt: sourceRevision,
			requestKey: randomUUID(),
			targetLocale: "en-US",
		}),
	);
	const prepared = await database.run(() =>
		prepareVariantReview("alice", {
			kind: "review.translation",
			resumeId: copy.resumeId,
			expectedUpdatedAt: copy.updatedAt,
			expectedSourceRevision: sourceRevision,
		}),
	);
	const snapshot = await database.run(() =>
		withOwnerDatabase("alice", (tx) => loadVariantSnapshot(tx, "alice", prepared)),
	);
	const raw = {
		direction: "ar-en",
		sourceRevision: copy.updatedAt,
		segments: snapshot.cv.map((fact) => {
			const text =
				fact.text === "مهندس"
					? "Engineer"
					: fact.text === "نبذة"
						? "Summary"
						: fact.text.includes("React")
							? "Used React in 1445 AH. Did not manage a budget."
							: fact.text;
			return { sourceId: fact.id, text, claims: [{ id: "claim", text, evidenceIds: [fact.id], kind: "translation" }] };
		}),
		notes: [],
	};
	const result = validateVariantOutput(snapshot, raw);
	const operationId = randomUUID();
	await database
		.admin()
		.query(
			"INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,parameters,route,consent_version,prompt_version,schema_version,state,result,delivered_at) VALUES ($1,'alice',$1,'fixture','review.translation',$2,$3,'{}','1','translation-v2','translation-v2','waiting_review',$4,now())",
			[operationId, JSON.stringify(prepared.sources), JSON.stringify(prepared.parameters), JSON.stringify(result)],
		);
	return { source, sourceRevision, copy, operationId, raw };
}
const run = <T>(work: () => T) => database.run(work);
async function decide(
	f: Awaited<ReturnType<typeof fixture>>,
	subjectIds: string[],
	decision: "accept" | "reject" | "undo" = "accept",
	extra = {},
) {
	const view = await run(() => getVariantReview("alice", f.operationId));
	return run(() =>
		decideVariantReview("alice", {
			operationId: f.operationId,
			requestKey: randomUUID(),
			expectedUpdatedAt: view.updatedAt,
			expectedDecisionId: view.latestDecisionId,
			subjectIds,
			decision,
			...extra,
		}),
	);
}

it("keeps segment approvals local, applies the complete translation atomically, replays once and undoes only this copy", async () => {
	const f = await fixture();
	for (const segment of f.raw.segments) await decide(f, [segment.sourceId]);
	const before = (await database.admin().query("SELECT data,updated_at FROM resume WHERE id=$1", [f.copy.resumeId]))
		.rows[0];
	expect(before.updated_at.toISOString()).toBe(f.copy.updatedAt);
	expect(before.data.metadata.page.locale).toBe("ar-SA");
	const view = await run(() => getVariantReview("alice", f.operationId));
	const input = {
		operationId: f.operationId,
		requestKey: randomUUID(),
		expectedUpdatedAt: view.updatedAt,
		expectedDecisionId: view.latestDecisionId,
		subjectIds: ["translation"],
		decision: "accept" as const,
	};
	const accepted = await run(() => decideVariantReview("alice", input));
	expect(await run(() => decideVariantReview("alice", input))).toEqual(accepted);
	expect(accepted.data.metadata.page.locale).toBe("en-US");
	expect(accepted.data.basics.name).toBe("اسم خاص");
	expect(accepted.data.basics.email).toBe("private@example.test");
	expect(accepted.data.summary.content).toContain("1445 AH");
	expect(
		(await database.admin().query("SELECT data FROM resume WHERE id=$1", [f.source])).rows[0].data.metadata.page.locale,
	).toBe("ar-SA");
	expect(
		(
			await database
				.admin()
				.query(
					"SELECT count(*)::int n FROM ai_review_decision WHERE operation_id=$1 AND subject_ids='[\"translation\"]'",
					[f.operationId],
				)
		).rows[0].n,
	).toBe(1);
	const undone = await decide(f, ["translation"], "undo", { undoDecisionId: accepted.decisionId });
	expect(undone.data).toEqual(before.data);
	expect(
		(
			await database
				.admin()
				.query("SELECT accepted_source_revision FROM resume_variant_source WHERE resume_id=$1", [f.copy.resumeId])
		).rows[0].accepted_source_revision,
	).toBeNull();
	const acceptedVersion = (
		await database.admin().query("SELECT history_version_id FROM ai_review_decision WHERE id=$1", [accepted.decisionId])
	).rows[0].history_version_id;
	await run(() =>
		withDatabaseOwner("alice", () =>
			resumeService.versions.restore({
				resumeId: f.copy.resumeId,
				versionId: acceptedVersion,
				userId: "alice",
				expectedUpdatedAt: new Date(undone.updatedAt),
			}),
		),
	);
	const restored = (await database.admin().query("SELECT data FROM resume WHERE id=$1", [f.copy.resumeId])).rows[0]
		.data;
	expect(restored.metadata.page.locale).toBe("en-US");
	expect(
		(
			await database
				.admin()
				.query("SELECT accepted_source_revision FROM resume_variant_source WHERE resume_id=$1", [f.copy.resumeId])
		).rows[0].accepted_source_revision,
	).toBe(f.sourceRevision);
});

it("blocks partial approval, foreign ownership, source changes and manual target edits", async () => {
	const f = await fixture();
	await expect(decide(f, ["translation"])).rejects.toMatchObject({ code: "CONFLICT" });
	const firstSegment = f.raw.segments[0];
	assert(firstSegment);
	await expect(run(() => getVariantReview("bob", f.operationId))).rejects.toMatchObject({ code: "NOT_FOUND" });
	await database.admin().query("UPDATE resume SET updated_at=updated_at+interval '1 second' WHERE id=$1", [f.source]);
	await expect(decide(f, [firstSegment.sourceId])).rejects.toMatchObject({ code: "CONFLICT" });
	await database.admin().query("UPDATE resume SET updated_at=$2 WHERE id=$1", [f.source, f.sourceRevision]);
	const view = await run(() => getVariantReview("alice", f.operationId));
	await database
		.admin()
		.query("UPDATE resume SET updated_at=updated_at+interval '1 second' WHERE id=$1", [f.copy.resumeId]);
	await expect(
		run(() =>
			decideVariantReview("alice", {
				operationId: f.operationId,
				requestKey: randomUUID(),
				expectedUpdatedAt: view.updatedAt,
				expectedDecisionId: view.latestDecisionId,
				subjectIds: [firstSegment.sourceId],
				decision: "accept",
			}),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
});

it("requires persisted official terms, invalidates the affected segment, and retains user terminology only in this copy", async () => {
	const f = await fixture(true);
	for (const segment of f.raw.segments) await decide(f, [segment.sourceId]);
	await expect(decide(f, ["translation"])).rejects.toMatchObject({ code: "CONFLICT" });
	let view = await run(() => getVariantReview("alice", f.operationId));
	expect(view.terms.terms).toHaveLength(2);
	for (const term of view.terms.terms) {
		await decide(f, [term.id]);
		view = await run(() => getVariantReview("alice", f.operationId));
		expect(view.segments[term.id.slice("term:".length)]?.status).toBe("pending");
		await decide(f, [term.id.slice("term:".length)]);
	}
	const accepted = await decide(f, ["translation"]);
	expect(accepted.data.sections.education.items[0]?.school).toBe("المعهد المحلي");
	expect(accepted.data.sections.education.items[0]?.degree).toBe("شهادة إتمام تدريب");
	expect(accepted.data.sections.education.items[0]?.website.url).toBe("https://private.example.test");
	expect(accepted.data.sections.education.items[0]?.period).toBe("1445 هـ");
});

it("rolls back content, locale, provenance and history when recording final approval fails", async () => {
	const f = await fixture();
	for (const segment of f.raw.segments) await decide(f, [segment.sourceId]);
	const before = (await database.admin().query("SELECT data,updated_at FROM resume WHERE id=$1", [f.copy.resumeId]))
		.rows[0];
	const versions = (
		await database.admin().query("SELECT count(*)::int n FROM resume_version WHERE resume_id=$1", [f.copy.resumeId])
	).rows[0].n;
	await database
		.admin()
		.query(
			"CREATE FUNCTION reject_translation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.subject_ids='[\"translation\"]'::jsonb THEN RAISE EXCEPTION 'Synthetic approval failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_translation_commit BEFORE INSERT ON ai_review_decision FOR EACH ROW EXECUTE FUNCTION reject_translation_commit()",
		);
	await expect(decide(f, ["translation"])).rejects.toThrow();
	expect(
		(await database.admin().query("SELECT data,updated_at FROM resume WHERE id=$1", [f.copy.resumeId])).rows[0],
	).toEqual(before);
	expect(
		(await database.admin().query("SELECT count(*)::int n FROM resume_version WHERE resume_id=$1", [f.copy.resumeId]))
			.rows[0].n,
	).toBe(versions);
	expect(
		(
			await database
				.admin()
				.query("SELECT accepted_source_revision FROM resume_variant_source WHERE resume_id=$1", [f.copy.resumeId])
		).rows[0].accepted_source_revision,
	).toBeNull();
	await database
		.admin()
		.query("DROP TRIGGER reject_translation_commit ON ai_review_decision; DROP FUNCTION reject_translation_commit()");
});

it("rejects the first translation segment without saving the CV and undoes that review decision", async () => {
	const f = await fixture(true);
	const first = f.raw.segments[0];
	assert(first);
	const before = await run(() => getVariantReview("alice", f.operationId));
	const rejected = await decide(f, [first.sourceId], "reject");
	expect(rejected.statuses[first.sourceId]).toBe("rejected");
	const view = await run(() => getVariantReview("alice", f.operationId));
	expect(view.statuses[first.sourceId]).toBe("rejected");
	expect(view.segments[first.sourceId]?.status).toBe("rejected");
	expect(view.terms).toEqual(before.terms);
	expect(view.updatedAt).toBe(f.copy.updatedAt);
	expect(view.undoable).toContainEqual({ decisionId: rejected.decisionId, subjectIds: [first.sourceId] });
	const undone = await decide(f, [first.sourceId], "undo", { undoDecisionId: rejected.decisionId });
	expect(undone.statuses[first.sourceId]).toBe("pending");
	const restored = await run(() => getVariantReview("alice", f.operationId));
	expect(restored.segments).toEqual(before.segments);
	expect(restored.terms).toEqual(before.terms);
	expect(restored.updatedAt).toBe(before.updatedAt);
	expect(restored.undoable).toEqual([]);
});

it("resolves local names in review text before confirmation, after term edits and in applied prose", async () => {
	const f = await fixture(true);
	const before = await run(() => getVariantReview("alice", f.operationId));
	const school = before.terms.terms.find((term) => term.target.field === "school");
	assert(school);
	const segmentId = school.id.slice("term:".length);
	expect(before.segments[segmentId]?.text).toBe(school.source);
	expect(JSON.stringify(before)).not.toMatch(/\[LOCAL_\d+\]/u);
	for (const term of before.terms.terms) await decide(f, [term.id], "accept", {});
	const reviewedName = "Local Institute";
	await run(async () => {
		const view = await getVariantReview("alice", f.operationId);
		await decideVariantReview("alice", {
			operationId: f.operationId,
			requestKey: randomUUID(),
			expectedUpdatedAt: view.updatedAt,
			expectedDecisionId: view.latestDecisionId,
			subjectIds: [school.id],
			decision: "accept_edited",
			editedText: reviewedName,
		});
	});
	const after = await run(() => getVariantReview("alice", f.operationId));
	expect(after.segments[segmentId]?.text).toBe(reviewedName);
	expect(JSON.stringify(after)).not.toMatch(/\[LOCAL_\d+\]/u);
	for (const segment of f.raw.segments) await decide(f, [segment.sourceId]);
	const applied = await decide(f, ["translation"]);
	expect(applied.data.sections.education.items[0]?.school).toBe(reviewedName);
	expect(JSON.stringify(applied.data)).not.toMatch(/\[LOCAL_\d+\]/u);
});
