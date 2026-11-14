import { expect, it } from "vite-plus/test";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { saveJobTarget } from "../career/job-targets";
import { resumeService } from "../resume/service";
import { createVariant } from "../resume/variants";
import { aiTestDatabase } from "./testing/database";
import { loadVariantSnapshot, prepareVariantReview } from "./variant-sources";

const database = aiTestDatabase();
it("prepares tailoring from decoded visible rich text after escaped content is saved", async () => {
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Used React &amp; Node.js.</p>";
	data.summary.hidden = false;
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	const sourceResumeId = await database.run(() =>
		resumeService.create({ userId: "alice", name: "Synthetic", tags: [], data, locale: "en-US" }),
	);
	const expectedUpdatedAt = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [sourceResumeId])
	).rows[0].updated_at.toISOString();
	const job = await database.run(() =>
		saveJobTarget("alice", { role: "Engineer", employer: "", text: "React required." }),
	);
	const copy = await database.run(() =>
		createVariant("alice", {
			sourceResumeId,
			expectedUpdatedAt,
			requestKey: "tailoring-copy",
			variantKind: "job",
			jobId: job.jobId,
			jobRevision: job.revision,
		}),
	);
	const selected = (
		await database.admin().query("SELECT updated_at FROM resume_job_selection WHERE resume_id=$1", [copy.resumeId])
	).rows[0].updated_at.toISOString();
	const revision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [copy.resumeId])
	).rows[0].updated_at.toISOString();
	const prepared = await database.run(() =>
		prepareVariantReview("alice", {
			kind: "review.tailoring",
			resumeId: copy.resumeId,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
			expectedSelectionRevision: selected,
		}),
	);
	const snapshot = await database.run(() =>
		withOwnerDatabase("alice", (tx) => loadVariantSnapshot(tx, "alice", prepared)),
	);
	expect(snapshot.variant?.fields).toContainEqual(
		expect.objectContaining({ sectionId: "summary", field: "content", text: "Used React & Node.js." }),
	);
	expect(snapshot.cv).toContainEqual(expect.objectContaining({ section: "summary", text: "Used React & Node.js." }));
	expect(
		(await database.admin().query("SELECT data FROM resume WHERE id=$1", [copy.resumeId])).rows[0].data.summary.content,
	).toBe("<p>Used React &amp; Node.js.</p>");
});
