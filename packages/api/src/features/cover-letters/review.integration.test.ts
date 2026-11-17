import { beforeAll, expect, it } from "vite-plus/test";
import { withDatabaseOwner } from "@reactive-resume/db/client";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { runAiOperations } from "../ai/operation-worker";
import { operationService } from "../ai/operations";
import { withAiRuntime } from "../ai/route-policy";
import { aiTestDatabase } from "../ai/testing/database";
import { syntheticReviewRuntime } from "../ai/testing/runtime";
import { saveJobTarget, selectResumeJob } from "../career/job-targets";
import { withPersonalToolsPolicy } from "../personal-tools/availability";
import { resumeService } from "../resume/service";
import { prepareLetterReview, decideLetterReview, getLetterReview } from "./review";
import { letterReviewHandler } from "./review-handler";
import { coverLetterService } from "./service";

const database = aiTestDatabase();
const calls: string[] = [];
let verifierRejects = false;
const runtime = {
	...syntheticReviewRuntime,
	handlers: { ...syntheticReviewRuntime.handlers, "review.cover-letter": letterReviewHandler },
	fetch: async (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body));
		calls.push(JSON.stringify(body));
		const payload = JSON.parse(body.messages.at(-1).content);
		const task = payload.selections.find((selection: { id: string }) => selection.id === "letter-verification-task");
		const evidence = JSON.parse(
			payload.selections.find((selection: { id: string }) => selection.id === "letter-cv-evidence").text,
		);
		const fact = evidence.find((entry: { text: string }) => entry.text.includes("Used React"));
		const output = task
			? {
					coverage: "complete",
					items: JSON.parse(task.text).items.map((item: { id: string }) => ({
						id: item.id,
						verdict: verifierRejects ? "unsupported" : "supported",
						evidenceIds: [fact.id],
						reason: "Synthetic supported text",
					})),
				}
			: {
					paragraphs: [
						{
							text: "Used React.",
							claims: [{ id: "claim", text: "Used React.", evidenceIds: [fact.id], kind: "fact" }],
						},
					],
					notes: [],
				};
		return Response.json({
			id: "synthetic-letter",
			provider: "Test",
			choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
			usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0.00001 },
		});
	},
};
const run = <T>(work: () => T) =>
	database.run(() =>
		withPersonalToolsPolicy(
			{
				coverLetters: { disposition: "enabled", releaseApproved: true },
				applications: { disposition: "enabled", releaseApproved: true },
			},
			() => withAiRuntime(runtime, work),
		),
	);
const letterWork = <T>(work: () => T) => run(() => withDatabaseOwner("alice", work));
let parameters: Awaited<ReturnType<typeof prepareLetterReview>>;
let letter: Awaited<ReturnType<typeof coverLetterService.create>>;
beforeAll(async () => {
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Used React.</p>";
	data.summary.hidden = false;
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	data.basics.name = "Private Name";
	data.basics.email = "private@example.test";
	data.basics.phone = "+966501234567";
	const cv = await run(() =>
		resumeService.create({ userId: "alice", name: "Synthetic CV", tags: [], data, locale: "en-US" }),
	);
	const revision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [cv])
	).rows[0].updated_at.toISOString();
	const job = await run(() =>
		saveJobTarget("alice", { role: "Engineer", employer: "", text: "React required. SAP preferred." }),
	);
	const selection = await run(() =>
		selectResumeJob("alice", {
			resumeId: cv,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
		}),
	);
	letter = await letterWork(() =>
		coverLetterService.create({ userId: "alice", name: "Original", content: "<p>Manual original.</p>", resumeId: cv }),
	);
	parameters = await run(() =>
		prepareLetterReview("alice", {
			letterId: letter.id,
			expectedLetterRevision: letter.revision,
			resumeId: cv,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
			expectedSelectionRevision: selection.revision,
			documentLocale: "en-US",
			length: "normal",
		}),
	);
	await database
		.admin()
		.query(
			"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent','alice','synthetic','1','1','review.cover-letter','1')",
		);
	await database
		.admin()
		.query(
			"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
		);
});

async function proposal(key: string) {
	const operation = await run(() =>
		operationService.start("alice", {
			...parameters,
			requestKey: key,
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
		}),
	);
	await run(() => runAiOperations());
	expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({ state: "waiting_review" });
	return operation;
}

it("delivers a proposal without changing the letter and rejects without saving generated text", async () => {
	const operation = await proposal("rejected");
	expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: letter.id }))).content).toBe(
		letter.content,
	);
	const result = await run(() =>
		decideLetterReview("alice", {
			letterId: letter.id,
			operationId: operation.id,
			expectedRevision: letter.revision,
			decision: "reject",
			requestKey: "reject-once",
		}),
	);
	expect(result.letter.content).toBe(letter.content);
	expect(result.versionId).toBeNull();
	expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({ state: "succeeded" });
	expect(calls.join("\n")).not.toMatch(/private@example|\+966501234567|Private Name/u);
});

it("accepts once and replays the same decision without duplicate versions", async () => {
	const operation = await proposal("accepted");
	const input = {
		letterId: letter.id,
		operationId: operation.id,
		expectedRevision: letter.revision,
		decision: "accept" as const,
		requestKey: "accept-once",
	};
	const first = await run(() => decideLetterReview("alice", input));
	const replay = await run(() => decideLetterReview("alice", input));
	expect(first.letter.revision).toBe(letter.revision + 1);
	expect(first.letter.content).toBe("<p>Used React.</p>");
	expect(replay.versionId).toBe(first.versionId);
	const savedReview = await run(() => getLetterReview("alice", { letterId: letter.id, operationId: operation.id }));
	expect(savedReview).toMatchObject({ decision: "accept", versionId: first.versionId });
	await expect(
		run(() => getLetterReview("bob", { letterId: letter.id, operationId: operation.id })),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	const edited = await letterWork(() =>
		coverLetterService.update({
			userId: "alice",
			id: letter.id,
			expectedRevision: first.letter.revision,
			content: "<p>Manual edit after approval.</p>",
		}),
	);
	const afterEdit = await run(() => decideLetterReview("alice", input));
	expect(afterEdit.letter.content).toBe(edited.content);
	expect(afterEdit.versionId).toBe(first.versionId);
	const acceptedVersionId = first.versionId;
	if (!acceptedVersionId) throw new Error("Accepted letter has no saved version");
	const restored = await letterWork(() =>
		coverLetterService.restoreVersion({ userId: "alice", id: letter.id, versionId: acceptedVersionId }),
	);
	expect(restored.content).toBe(first.letter.content);
	expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: letter.id }))).content).toBe(
		first.letter.content,
	);
	expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({ state: "succeeded" });
	const versions = await database
		.admin()
		.query("SELECT id FROM cover_letter_version WHERE cover_letter_id=$1 AND kind='named'", [letter.id]);
	expect(versions.rows).toHaveLength(1);
	await expect(run(() => decideLetterReview("alice", { ...input, decision: "reject" }))).rejects.toMatchObject({
		code: "CONFLICT",
	});
	await expect(run(() => decideLetterReview("bob", input))).rejects.toMatchObject({ code: "NOT_FOUND" });
});

async function freshProposal(key: string) {
	const current = await letterWork(() =>
		coverLetterService.create({
			userId: "alice",
			name: key,
			content: "<p>Keep manual text.</p>",
			resumeId: parameters.parameters.resumeId,
		}),
	);
	const prepared = await run(() =>
		prepareLetterReview("alice", {
			...parameters.parameters,
			letterId: current.id,
			expectedLetterRevision: current.revision,
		}),
	);
	const operation = await run(() =>
		operationService.start("alice", {
			...prepared,
			requestKey: key,
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
		}),
	);
	await run(() => runAiOperations());
	return { current, operation, prepared };
}

it("refuses acceptance after a manual edit and preserves the newer revision", async () => {
	const { current, operation } = await freshProposal("manual-conflict");
	const edited = await letterWork(() =>
		coverLetterService.update({
			userId: "alice",
			id: current.id,
			expectedRevision: current.revision,
			content: "<p>New manual edit.</p>",
		}),
	);
	await expect(
		run(() =>
			decideLetterReview("alice", {
				letterId: current.id,
				operationId: operation.id,
				expectedRevision: current.revision,
				decision: "accept",
				requestKey: "stale-accept",
			}),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: current.id }))).content).toBe(
		edited.content,
	);
	const decisions = await database
		.admin()
		.query("SELECT operation_id FROM cover_letter_proposal_decision WHERE operation_id=$1", [operation.id]);
	expect(decisions.rows).toHaveLength(0);
});

it("rejects a mismatched document locale and foreign source references before inference", async () => {
	const count = calls.length;
	const latest = await letterWork(() => coverLetterService.getById({ userId: "alice", id: letter.id }));
	await expect(
		run(() =>
			prepareLetterReview("alice", {
				...parameters.parameters,
				expectedLetterRevision: latest.revision,
				documentLocale: "ar-SA",
			}),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	await expect(run(() => prepareLetterReview("bob", parameters.parameters))).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	expect(calls).toHaveLength(count);
});

it("rolls back content, history and decision when version persistence fails", async () => {
	const { current, operation } = await freshProposal("failed-persistence");
	await database
		.admin()
		.query(
			"CREATE FUNCTION reject_review_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic version failure'; END $$; CREATE TRIGGER reject_review_version BEFORE INSERT ON cover_letter_version FOR EACH ROW WHEN (NEW.kind='named') EXECUTE FUNCTION reject_review_version()",
		);
	try {
		await expect(
			run(() =>
				decideLetterReview("alice", {
					letterId: current.id,
					operationId: operation.id,
					expectedRevision: current.revision,
					decision: "accept",
					requestKey: "failed-version",
				}),
			),
		).rejects.toThrow();
		expect(await letterWork(() => coverLetterService.getById({ userId: "alice", id: current.id }))).toMatchObject({
			content: current.content,
			revision: current.revision,
		});
		expect(
			(
				await database
					.admin()
					.query("SELECT operation_id FROM cover_letter_proposal_decision WHERE operation_id=$1", [operation.id])
			).rows,
		).toHaveLength(0);
		expect(
			(
				await database
					.admin()
					.query("SELECT id FROM cover_letter_version WHERE cover_letter_id=$1 AND kind='named'", [current.id])
			).rows,
		).toHaveLength(0);
	} finally {
		await database
			.admin()
			.query("DROP TRIGGER reject_review_version ON cover_letter_version; DROP FUNCTION reject_review_version()");
	}
});

it("withholds a proposal when the independent verifier rejects its text", async () => {
	verifierRejects = true;
	try {
		const { current, operation } = await freshProposal("verifier-rejected");
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
		expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: current.id }))).content).toBe(
			current.content,
		);
	} finally {
		verifierRejects = false;
	}
});

it("keeps Arabic and English letter edits in separate persisted records", async () => {
	const en = await letterWork(() =>
		coverLetterService.create({
			userId: "alice",
			name: "English",
			resumeId: parameters.parameters.resumeId,
			content: "<p>English manual content.</p>",
		}),
	);
	const ar = await letterWork(() =>
		coverLetterService.create({
			userId: "alice",
			name: "Arabic",
			resumeId: parameters.parameters.resumeId,
			content: "<p>محتوى عربي يدوي.</p>",
		}),
	);
	await letterWork(() =>
		coverLetterService.update({
			userId: "alice",
			id: ar.id,
			expectedRevision: ar.revision,
			metadata: { page: { ...ar.style.metadata.page, locale: "ar-SA" } },
		}),
	);
	await letterWork(() =>
		coverLetterService.update({
			userId: "alice",
			id: en.id,
			expectedRevision: en.revision,
			content: "<p>Edited English only.</p>",
		}),
	);
	expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: ar.id }))).content).toBe(
		"<p>محتوى عربي يدوي.</p>",
	);
	expect(
		(await letterWork(() => coverLetterService.getById({ userId: "alice", id: ar.id }))).style.metadata.page.locale,
	).toBe("ar-SA");
	expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: en.id }))).content).toBe(
		"<p>Edited English only.</p>",
	);
});

it("creates an Arabic letter independently from an English source CV", async () => {
	const created = await letterWork(() =>
		coverLetterService.create({
			userId: "alice",
			name: "Arabic document",
			resumeId: parameters.parameters.resumeId,
			documentLocale: "ar-SA",
			content: "<p>نص عربي مستقل.</p>",
		}),
	);
	const reopened = await letterWork(() => coverLetterService.getById({ userId: "alice", id: created.id }));
	expect(reopened.style.metadata.page.locale).toBe("ar-SA");
	expect(reopened.content).toBe("<p>نص عربي مستقل.</p>");
});

it("rejects a proposal after the selected job revision changes", async () => {
	const { current, operation } = await freshProposal("selection-conflict");
	const selected = parameters.parameters;
	await run(() =>
		selectResumeJob("alice", {
			resumeId: selected.resumeId,
			expectedUpdatedAt: selected.expectedUpdatedAt,
			jobId: selected.jobId,
			jobRevision: selected.jobRevision,
			expectedSelectionRevision: selected.expectedSelectionRevision,
		}),
	);
	await expect(
		run(() =>
			decideLetterReview("alice", {
				letterId: current.id,
				operationId: operation.id,
				expectedRevision: current.revision,
				decision: "accept",
				requestKey: "changed-selection",
			}),
		),
	).rejects.toMatchObject({ code: "CONFLICT" });
	expect((await letterWork(() => coverLetterService.getById({ userId: "alice", id: current.id }))).content).toBe(
		current.content,
	);
});
