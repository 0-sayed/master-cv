import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { saveJobTarget, selectResumeJob } from "../career/job-targets";
import { resumeService } from "../resume/service";
import { aiTestDatabase } from "./testing/database";
import { getVariantReview } from "./variant-decisions";
import { prepareVariantReview, loadVariantSnapshot } from "./variant-sources";
import { validateVariantOutput } from "./variant-validation";
const database = aiTestDatabase();
it("pins exact CV/job selection, minimizes contacts, and rejects late or foreign evidence", async () => {
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Used React. Did not use SAP.</p>";
	data.summary.hidden = false;
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	data.basics.email = "private@example.test";
	const cv = await database.run(() =>
		resumeService.create({ userId: "alice", name: "CV", tags: [], data, locale: "en-US" }),
	);
	const revision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [cv])
	).rows[0].updated_at.toISOString();
	const job = await database.run(() =>
		saveJobTarget("alice", { role: "Engineer", employer: "", text: "React, SAP required" }),
	);
	const selected = await database.run(() =>
		selectResumeJob("alice", {
			resumeId: cv,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
		}),
	);
	const input = {
		kind: "review.job-evidence" as const,
		resumeId: cv,
		expectedUpdatedAt: revision,
		jobId: job.jobId,
		jobRevision: job.revision,
		expectedSelectionRevision: selected.revision,
	};
	const prepared = await database.run(() => prepareVariantReview("alice", input));
	expect(prepared.sources).toContainEqual({ kind: "job", id: job.jobId, revision: job.revision });
	expect(JSON.stringify(prepared)).not.toContain("private@example.test");
	const request = {
		requestKey: "evidence",
		kind: input.kind,
		sources: prepared.sources,
		parameters: prepared.parameters,
		route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
		consentVersion: "1",
	};
	const load = (owner: string) =>
		database.run(() => withOwnerDatabase(owner, (tx) => loadVariantSnapshot(tx, owner, request)));
	expect((await load("alice")).cv).toHaveLength(1);
	const snapshot = await load("alice");
	const span = snapshot.jobAd?.segments[0];
	assert(span);
	const result = validateVariantOutput(snapshot, {
		requirements: [
			{
				id: "requirement",
				spanIds: [span.id],
				importance: "essential",
				verdict: "no_evidence",
				evidenceIds: [],
				explanation: "No supporting evidence was found in this CV.",
			},
		],
		notes: [],
	});
	const operationId = randomUUID();
	await database
		.admin()
		.query(
			"INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,parameters,route,consent_version,prompt_version,schema_version,state,result,delivered_at) VALUES ($1,'alice',$1,'fixture','review.job-evidence',$2,$3,'{}','1','job-evidence-v2','job-evidence-v2','waiting_review',$4,now())",
			[operationId, JSON.stringify(prepared.sources), JSON.stringify(prepared.parameters), JSON.stringify(result)],
		);
	const review = await database.run(() => getVariantReview("alice", operationId));
	expect(review.sourceSegments).toEqual([{ id: span.id, text: "React, SAP required" }]);

	await expect(load("bob")).rejects.toMatchObject({ code: "NOT_FOUND" });
	await database.run(() =>
		selectResumeJob("alice", {
			resumeId: cv,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
			expectedSelectionRevision: selected.revision,
		}),
	);
	await expect(load("alice")).rejects.toMatchObject({ code: "CONFLICT" });
});
