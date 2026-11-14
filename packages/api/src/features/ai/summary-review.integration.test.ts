import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { resumeService } from "../resume/service";
import { recordReviewAnswer, dismissReviewQuestion } from "./review-decisions";
import { aiTestDatabase } from "./testing/database";
import { decideVariantReview, getVariantReview } from "./variant-decisions";
import { loadVariantSnapshot, prepareVariantReview } from "./variant-sources";
import { validateVariantOutput } from "./variant-validation";

const database = aiTestDatabase();
const run = <T>(work: () => T) => database.run(work);
it("applies a selected-fact summary, records ordinary history, replays, and rejects an undo over manual work", async () => {
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Used React. Did not manage a budget.</p>";
	data.summary.hidden = false;
	data.basics.headline = "Unselected headline";
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	const id = await run(() => resumeService.create({ userId: "alice", name: "CV", tags: [], data, locale: "en-US" }));
	const revision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [id])
	).rows[0].updated_at.toISOString();
	const all = await run(() =>
		prepareVariantReview("alice", {
			kind: "review.summary",
			resumeId: id,
			expectedUpdatedAt: revision,
			selectedEvidenceIds: [],
		}),
	);
	expect(all.evidenceIds).toEqual([]);
	// The selector receives stable visible source IDs, never inference from the job advert.
	const { buildJobPassages } = await import("@reactive-resume/resume/ats");
	const passage = buildJobPassages(data).find((passage) => passage.target.sectionId === "summary");
	assert(passage);
	const selected = passage.id;
	const prepared = await run(() =>
		prepareVariantReview("alice", {
			kind: "review.summary",
			resumeId: id,
			expectedUpdatedAt: revision,
			selectedEvidenceIds: [selected],
		}),
	);
	const snapshot = await run(() => withOwnerDatabase("alice", (tx) => loadVariantSnapshot(tx, "alice", prepared)));
	expect(snapshot.cv.map((fact) => fact.text)).toEqual(["Used React. Did not manage a budget."]);
	const raw = {
		summary: {
			text: "Used React.",
			claims: [{ id: "claim", text: "Used React.", evidenceIds: [selected], kind: "fact" }],
		},
		questions: [
			{ id: "clarify", prompt: "What other work can you confirm?", evidenceIds: [] },
			{ id: "skip", prompt: "Would you like to add study evidence?", evidenceIds: [] },
		],
		notes: [],
	};
	const result = validateVariantOutput(snapshot, raw);
	const operationId = randomUUID();
	await database
		.admin()
		.query(
			"INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,parameters,route,consent_version,prompt_version,schema_version,state,result,delivered_at) VALUES ($1,'alice',$1,'fixture','review.summary',$2,$3,'{}','1','summary-v2','summary-v2','waiting_review',$4,now())",
			[operationId, JSON.stringify(prepared.sources), JSON.stringify(prepared.parameters), JSON.stringify(result)],
		);
	const answerInput = {
		operationId,
		requestKey: randomUUID(),
		questionId: "clarify",
		text: "Prepared reports.",
		expectedSource: result.sourceRevision,
	};
	const answer = await run(() => recordReviewAnswer("alice", answerInput));
	expect(await run(() => recordReviewAnswer("alice", answerInput))).toEqual(answer);
	await run(() => dismissReviewQuestion("alice", { operationId, questionId: "skip", requestKey: randomUUID() }));
	const answered = await run(() => getVariantReview("alice", operationId));
	expect(answered.answeredQuestionIds).toContain("clarify");
	expect(answered.dismissedQuestionIds).toContain("skip");
	expect(
		(await database.admin().query("SELECT state FROM ai_operation WHERE id=$1", [operationId])).rows[0].state,
	).toBe("waiting_review");
	const input = {
		operationId,
		requestKey: randomUUID(),
		expectedUpdatedAt: revision,
		expectedDecisionId: answered.latestDecisionId,
		subjectIds: ["summary"],
		decision: "accept" as const,
	};
	const saved = await run(() => decideVariantReview("alice", input));
	expect(saved.data.summary.content).toBe("<p>Used React.</p>");
	expect(saved.data.basics.headline).toBe("Unselected headline");
	expect(await run(() => decideVariantReview("alice", input))).toEqual(saved);
	expect(
		(await database.admin().query("SELECT count(*)::int n FROM resume_version WHERE resume_id=$1 AND kind='ai'", [id]))
			.rows[0].n,
	).toBe(1);
	const view = await run(() => getVariantReview("alice", operationId));
	const edited = structuredClone(saved.data);
	edited.summary.content = "<p>Manual work.</p>";
	await database
		.admin()
		.query("UPDATE resume SET data=$2,updated_at=updated_at+interval '1 second' WHERE id=$1", [
			id,
			JSON.stringify(edited),
		]);
	const newRevision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [id])
	).rows[0].updated_at.toISOString();
	await expect(
		run(() =>
			decideVariantReview("alice", {
				...input,
				requestKey: randomUUID(),
				decision: "undo",
				undoDecisionId: saved.decisionId,
				expectedUpdatedAt: newRevision,
				expectedDecisionId: view.latestDecisionId,
			}),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect((await database.admin().query("SELECT data FROM resume WHERE id=$1", [id])).rows[0].data.summary.content).toBe(
		"<p>Manual work.</p>",
	);
	expect(
		(await database.admin().query("SELECT count(*)::int n FROM career_fact WHERE user_id='alice'")).rows[0].n,
	).toBe(0);
});
