import type { ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";
import { hashReviewTarget } from "@reactive-resume/resume/review-evidence";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { experienceItemSchema } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { decideReview, getReview, recordReviewAnswer, dismissReviewQuestion } from "./review-decisions";
import { reviewHandlers } from "./review-handlers";
import { prepareResumeReview } from "./review-sources";
import { aiTestDatabase } from "./testing/database";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("atomic review decisions", () => {
	const database = aiTestDatabase();
	async function fixture(modify?: (result: Extract<ReviewResult, { kind: "wording" }>) => void) {
		const id = randomUUID();
		const operationId = `op-${id}`;
		const data = structuredClone(defaultResumeData);
		data.summary.content = "<p>Built services.</p>";
		const row = (
			await database
				.admin()
				.query(
					"INSERT INTO resume(id,user_id,name,slug,data) VALUES ($1,'alice','Synthetic',$1,$2) RETURNING updated_at",
					[id, JSON.stringify(data)],
				)
		).rows[0];
		const revision = row.updated_at.toISOString();
		const source = { kind: "resume", id, revision } as const;
		const target = { sectionId: "summary", field: "content" };
		const evidence = {
			id: "e1",
			source,
			factId: null,
			factRevision: null,
			target,
			quote: "Built services.",
			confirmation: "confirmed" as const,
		};
		const result: Extract<ReviewResult, { kind: "wording" }> = {
			schemaVersion: 2,
			kind: "wording",
			sourceRevision: source,
			evidence: [evidence],
			questions: [],
			notes: [],
			proposals: [
				{
					schemaVersion: 2,
					id: "p1",
					target,
					location: "Summary",
					before: "<p>Built services.</p>",
					after: "<p>Developed services.</p>",
					why: "Clearer",
					status: "pending",
					source: "improve",
					base: source,
					targetHash: hashReviewTarget(data.summary.content),
					claims: splitReviewClaims("Developed services.", ["e1"]),
					evidenceIds: ["e1"],
				},
			],
		};
		modify?.(result);
		await database
			.admin()
			.query(
				"INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version,state,result,delivered_at) VALUES ($1,'alice',$1,'fp','review.wording',$2,'{}','1','t006-wording-v2','t006-review-v2','waiting_review',$3,now())",
				[operationId, JSON.stringify([source]), JSON.stringify(result)],
			);
		return {
			id,
			operationId,
			revision,
			input: {
				operationId,
				proposalIds: ["p1"],
				requestKey: `accept-${id}`,
				expectedUpdatedAt: revision,
				decision: "accept" as const,
			},
		};
	}
	it.each(["same", "other-cv", "other-target", "unbound"] as const)(
		"binds answer evidence to its original CV and target: %s",
		async (binding) => {
			const f = await fixture((result) => {
				result.questions = [
					{
						id: "q1",
						target: binding === "unbound" ? null : { sectionId: "summary", field: "content" },
						prompt: "What was the outcome?",
						evidenceIds: ["e1"],
					},
				];
			});
			const answer = await database.run(() =>
				recordReviewAnswer("alice", {
					operationId: f.operationId,
					questionId: "q1",
					requestKey: `answer-${f.id}`,
					expectedSource: { kind: "resume", id: f.id, revision: f.revision },
					text: "Reduced waiting time.",
				}),
			);
			const destination = binding === "other-cv" ? await fixture() : f;
			if (binding === "other-target") {
				const data = (await database.admin().query("SELECT data FROM resume WHERE id=$1", [f.id])).rows[0].data;
				data.sections.experience.items.push(
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
				);
				await database.admin().query("UPDATE resume SET data=$2 WHERE id=$1", [f.id, JSON.stringify(data)]);
			}
			const targets = [
				{
					sectionId: binding === "other-target" ? "experience" : "summary",
					...(binding === "other-target" ? { itemId: "entry" } : {}),
					field: binding === "other-target" ? "description" : "content",
				},
			];
			const prepared = await database.run(() =>
				prepareResumeReview("alice", { resumeId: destination.id, expectedUpdatedAt: destination.revision, targets }),
			);
			const result = database.run(() =>
				reviewHandlers["review.wording"].buildInput("alice", {
					requestKey: `next-${f.id}`,
					kind: "review.wording",
					sources: [...prepared.sources, answer.source],
					route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
					consentVersion: "1",
					parameters: { resumeId: destination.id, targets, action: "result", answerIds: [answer.source.id] },
				}),
			);
			if (binding === "same")
				expect((await result).selections.some((selection) => selection.text === answer.quote)).toBe(true);
			else await expect(result).rejects.toThrow("AI_SOURCE_BINDING");
		},
	);
	it("accepts and snapshots once, replays the original outcome and conflicts on changed payload", async () => {
		const f = await fixture();
		const accepted = await database.run(() => decideReview("alice", f.input));
		expect(accepted.data.summary.content).toBe("<p>Developed services.</p>");
		expect(accepted.statuses).toEqual({ p1: "accepted" });
		expect((await database.run(() => decideReview("alice", f.input))).decisionId).toBe(accepted.decisionId);
		await expect(database.run(() => decideReview("alice", { ...f.input, decision: "reject" }))).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect((await database.admin().query("SELECT kind FROM resume_version WHERE resume_id=$1", [f.id])).rows).toEqual([
			{ kind: "ai" },
		]);
		expect(
			(
				await database
					.admin()
					.query("SELECT count(*)::int n FROM ai_review_decision WHERE operation_id=$1", [f.operationId])
			).rows[0].n,
		).toBe(1);
		expect(
			(
				await database
					.admin()
					.query("SELECT count(*)::int n FROM ai_usage_ledger WHERE operation_id=$1", [f.operationId])
			).rows[0].n,
		).toBe(0);
		expect(await database.run(() => getReview("alice", f.operationId))).toMatchObject({ statuses: { p1: "accepted" } });
	});
	it("rejects without CV/history writes and isolates owners", async () => {
		const f = await fixture();
		await expect(database.run(() => decideReview("bob", f.input))).rejects.toMatchObject({ code: "NOT_FOUND" });
		const rejected = await database.run(() => decideReview("alice", { ...f.input, decision: "reject" }));
		expect(rejected.updatedAt).toBe(f.revision);
		expect(rejected.data.summary.content).toBe("<p>Built services.</p>");
		expect((await database.admin().query("SELECT id FROM resume_version WHERE resume_id=$1", [f.id])).rows).toEqual([]);
	});
	it("undo survives refresh and preserves intervening manual edits, with idempotent replay", async () => {
		const f = await fixture();
		const accepted = await database.run(() => decideReview("alice", f.input));
		await database
			.admin()
			.query(
				"UPDATE resume SET data=jsonb_set(data,'{basics,headline}','\"Manual headline\"'),updated_at=updated_at+interval '1 second' WHERE id=$1",
				[f.id],
			);
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [f.id])
		).rows[0].updated_at.toISOString();
		const undo = {
			...f.input,
			requestKey: `undo-${f.id}`,
			expectedUpdatedAt: revision,
			decision: "undo" as const,
			undoDecisionId: accepted.decisionId,
		};
		const restored = await database.run(() => decideReview("alice", undo));
		expect(restored.data.summary.content).toBe("<p>Built services.</p>");
		expect(restored.data.basics.headline).toBe("Manual headline");
		expect((await database.run(() => decideReview("alice", undo))).decisionId).toBe(restored.decisionId);
		expect(
			(await database.admin().query("SELECT count(*)::int n FROM resume_version WHERE resume_id=$1", [f.id])).rows[0].n,
		).toBe(2);
	});
	it("serializes simultaneous accept/reject and rejects stale or locked documents", async () => {
		const f = await fixture();
		const decisions = await database.run(() =>
			Promise.allSettled([
				decideReview("alice", f.input),
				decideReview("alice", { ...f.input, requestKey: `reject-${f.id}`, decision: "reject" }),
			]),
		);
		expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
		const locked = await fixture();
		await database.admin().query("UPDATE resume SET is_locked=true WHERE id=$1", [locked.id]);
		await expect(database.run(() => decideReview("alice", locked.input))).rejects.toMatchObject({
			code: "RESUME_LOCKED",
		});
	});
	it("persists exact edited wording and exposes its durable undo provenance", async () => {
		const f = await fixture();
		const saved = await database.run(() =>
			decideReview("alice", { ...f.input, decision: "accept_edited", editedText: "My own $& wording." }),
		);
		expect(saved.data.summary.content).toBe("<p>My own $&amp; wording.</p>");
		expect((await database.run(() => getReview("alice", f.operationId))).undoable).toMatchObject([
			{ decisionId: saved.decisionId, userSupplied: true },
		]);
	});
	it("rejects changed target fields and overlapping batches atomically", async () => {
		const f = await fixture();
		await database
			.admin()
			.query(
				"UPDATE resume SET data=jsonb_set(data,'{summary,content}','\"<p>Manual correction.</p>\"'),updated_at=updated_at+interval '1 second' WHERE id=$1",
				[f.id],
			);
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [f.id])
		).rows[0].updated_at.toISOString();
		await expect(
			database.run(() => decideReview("alice", { ...f.input, expectedUpdatedAt: revision })),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const overlap = await fixture((result) => {
			const proposal = result.proposals[0];
			if (!proposal) throw new Error("Missing fixture proposal");
			result.proposals.push({ ...proposal, id: "p2" });
		});
		await expect(
			database.run(() => decideReview("alice", { ...overlap.input, proposalIds: ["p1", "p2"] })),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			(await database.admin().query("SELECT id FROM resume_version WHERE resume_id=$1", [overlap.id])).rows,
		).toEqual([]);
	});
	it("can dismiss a stale proposal without overwriting the corrected passage", async () => {
		const f = await fixture();
		await database
			.admin()
			.query(
				"UPDATE resume SET data=jsonb_set(data,'{summary,content}','\"<p>Manual correction.</p>\"'),updated_at=updated_at+interval '1 second' WHERE id=$1",
				[f.id],
			);
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [f.id])
		).rows[0].updated_at.toISOString();
		const rejected = await database.run(() =>
			decideReview("alice", { ...f.input, decision: "reject", expectedUpdatedAt: revision }),
		);
		expect(rejected.statuses).toEqual({ p1: "rejected" });
		expect(rejected.data.summary.content).toBe("<p>Manual correction.</p>");
		expect((await database.admin().query("SELECT id FROM resume_version WHERE resume_id=$1", [f.id])).rows).toEqual([]);
	});
	it("accepts a distinct unchanged target after an earlier acceptance", async () => {
		const f = await fixture((result) => {
			const original = result.proposals[0];
			if (!original) throw new Error("Missing proposal");
			result.proposals.push({
				...original,
				id: "p2",
				target: { sectionId: "experience", itemId: "entry", field: "description" },
			});
		});
		const row = (await database.admin().query("SELECT data FROM resume WHERE id=$1", [f.id])).rows[0];
		row.data.sections.experience.items.push(
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
		);
		await database.admin().query("UPDATE resume SET data=$2 WHERE id=$1", [f.id, row.data]);
		const first = await database.run(() => decideReview("alice", f.input));
		const second = await database.run(() =>
			decideReview("alice", {
				...f.input,
				expectedUpdatedAt: first.updatedAt,
				requestKey: `second-${f.id}`,
				proposalIds: ["p2"],
			}),
		);
		expect(second.statuses).toEqual({ p1: "accepted", p2: "accepted" });
		expect(second.data.summary.content).toBe("<p>Developed services.</p>");
		expect(second.data.sections.experience.items[0]?.description).toBe("<p>Developed services.</p>");
	});
	it.each(["accept", "accept_edited"] as const)(
		"accepts untouched sibling passages after %s, rejects manual edits and supports Undo",
		async (decision) => {
			const original = "<p>Built services.</p><p>Built tools.</p>";
			const f = await fixture((result) => {
				const first = result.proposals[0];
				if (!first) throw new Error("Missing fixture proposal");
				first.targetHash = hashReviewTarget(original);
				result.proposals.push({
					...first,
					id: "p2",
					before: "<p>Built tools.</p>",
					after: "<p>Developed tools.</p>",
					claims: splitReviewClaims("Developed tools.", first.evidenceIds),
				});
			});
			const data = (await database.admin().query("SELECT data FROM resume WHERE id=$1", [f.id])).rows[0].data;
			data.summary.content = original;
			await database.admin().query("UPDATE resume SET data=$2 WHERE id=$1", [f.id, JSON.stringify(data)]);
			const firstInput = {
				...f.input,
				decision,
				...(decision === "accept_edited" ? { editedText: "My edited services." } : {}),
			};
			const first = await database.run(() => decideReview("alice", firstInput));
			const second = await database.run(() =>
				decideReview("alice", {
					...f.input,
					proposalIds: ["p2"],
					requestKey: `second-${f.id}`,
					expectedUpdatedAt: first.updatedAt,
				}),
			);
			expect(second.data.summary.content).toBe(
				`${decision === "accept_edited" ? "<p>My edited services.</p>" : "<p>Developed services.</p>"}<p>Developed tools.</p>`,
			);
			const undoFirst = await database.run(() =>
				decideReview("alice", {
					...f.input,
					decision: "undo",
					undoDecisionId: first.decisionId,
					expectedUpdatedAt: second.updatedAt,
					requestKey: `undo-${f.id}`,
				}),
			);
			expect(undoFirst.data.summary.content).toBe("<p>Built services.</p><p>Developed tools.</p>");
			const restored = await database.run(() =>
				decideReview("alice", { ...firstInput, expectedUpdatedAt: undoFirst.updatedAt, requestKey: `again-${f.id}` }),
			);
			expect(restored.data.summary.content).toBe(second.data.summary.content);
			await database.run(() =>
				decideReview("alice", {
					...f.input,
					decision: "undo",
					undoDecisionId: restored.decisionId,
					expectedUpdatedAt: restored.updatedAt,
					requestKey: `undo-again-${f.id}`,
				}),
			);
			await database
				.admin()
				.query(
					"UPDATE resume SET data=jsonb_set(data,'{summary,content}',to_jsonb((data#>>'{summary,content}') || '<p>Manual change.</p>')),updated_at=updated_at+interval '1 second' WHERE id=$1",
					[f.id],
				);
			const revision = (
				await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [f.id])
			).rows[0].updated_at.toISOString();
			await expect(
				database.run(() =>
					decideReview("alice", { ...f.input, expectedUpdatedAt: revision, requestKey: `manual-${f.id}` }),
				),
			).rejects.toMatchObject({ code: "CONFLICT" });
		},
	);
	it("refuses revised cited facts and an inverse whose accepted passage was manually changed", async () => {
		const f = await fixture((result) => {
			const evidence = result.evidence[0];
			if (!evidence) throw new Error("Missing evidence");
			evidence.factId = "review-fact";
			evidence.factRevision = 1;
		});
		await database
			.admin()
			.query(
				"INSERT INTO career_fact(id,user_id,text,category,source,source_key,structured,confirmation,revision) VALUES ('review-fact','alice','Built services.','experience','{}','review-fact',$1,'confirmed',2)",
				[
					JSON.stringify({
						section: "experience",
						entityId: "entry",
						field: "description",
						value: "Built services.",
						source: { kind: "manual", id: "", quote: "" },
					}),
				],
			);
		await expect(database.run(() => decideReview("alice", f.input))).rejects.toMatchObject({
			data: { reason: "AI_SOURCE_CHANGED" },
		});
		const other = await fixture();
		const accepted = await database.run(() => decideReview("alice", other.input));
		await database
			.admin()
			.query(
				"UPDATE resume SET data=jsonb_set(data,'{summary,content}','\"<p>Manual correction.</p>\"'),updated_at=updated_at+interval '1 second' WHERE id=$1",
				[other.id],
			);
		const revision = (
			await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [other.id])
		).rows[0].updated_at.toISOString();
		await expect(
			database.run(() =>
				decideReview("alice", {
					...other.input,
					decision: "undo",
					expectedUpdatedAt: revision,
					requestKey: `changed-undo-${other.id}`,
					undoDecisionId: accepted.decisionId,
				}),
			),
		).rejects.toMatchObject({ data: { reason: "AI_UNDO_CHANGED" } });
	});
	it("saves and dismisses questions without CV, master, history or usage mutation", async () => {
		const f = await fixture((result) => {
			result.questions = [
				{
					id: "q1",
					target: { sectionId: "summary", field: "content" },
					prompt: "What was the outcome?",
					evidenceIds: ["e1"],
				},
				{ id: "q2", target: null, prompt: "What else?", evidenceIds: ["e1"] },
			];
		});
		const source = { kind: "resume" as const, id: f.id, revision: f.revision };
		const answer = {
			operationId: f.operationId,
			questionId: "q1",
			requestKey: `answer-${f.id}`,
			expectedSource: source,
			text: "Reduced waiting time. test@example.test",
		};
		const evidence = await database.run(() => recordReviewAnswer("alice", answer));
		expect(evidence.confirmation).toBe("user_supplied");
		expect(evidence.quote).not.toContain("test@example.test");
		expect(await database.run(() => recordReviewAnswer("alice", answer))).toEqual(evidence);
		await expect(database.run(() => recordReviewAnswer("bob", answer))).rejects.toMatchObject({ code: "NOT_FOUND" });
		await database.run(() =>
			dismissReviewQuestion("alice", { operationId: f.operationId, questionId: "q2", requestKey: `dismiss-${f.id}` }),
		);
		expect(await database.run(() => getReview("alice", f.operationId))).toMatchObject({
			answeredQuestionIds: ["q1"],
			dismissedQuestionIds: ["q2"],
		});
		expect((await database.admin().query("SELECT id FROM resume_version WHERE resume_id=$1", [f.id])).rows).toEqual([]);
		expect(
			(
				await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [f.id])
			).rows[0].updated_at.toISOString(),
		).toBe(f.revision);
	});
	it("rejects cross-operation and duplicate concurrent undo, changed accepted text, and trashed CVs", async () => {
		const f = await fixture();
		const other = await fixture();
		const accepted = await database.run(() => decideReview("alice", f.input));
		const undo = {
			...f.input,
			expectedUpdatedAt: accepted.updatedAt,
			requestKey: `undo-race-${f.id}`,
			decision: "undo" as const,
			undoDecisionId: accepted.decisionId,
		};
		await expect(
			database.run(() =>
				decideReview("alice", { ...other.input, decision: "undo", undoDecisionId: accepted.decisionId }),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const outcomes = await database.run(() =>
			Promise.allSettled([
				decideReview("alice", undo),
				decideReview("alice", { ...undo, requestKey: `undo-other-${f.id}` }),
			]),
		);
		expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
		await database.admin().query("UPDATE resume SET trashed_at=now() WHERE id=$1", [other.id]);
		await expect(database.run(() => getReview("alice", other.operationId))).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
	it("rolls back CV and history when the decision insert fails", async () => {
		const f = await fixture();
		await database
			.admin()
			.query(
				"CREATE FUNCTION reject_review_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected decision failure'; END $$; CREATE TRIGGER reject_review_test BEFORE INSERT ON ai_review_decision FOR EACH ROW EXECUTE FUNCTION reject_review_test()",
			);
		try {
			await expect(database.run(() => decideReview("alice", f.input))).rejects.toThrow();
			expect(
				(await database.admin().query("SELECT data FROM resume WHERE id=$1", [f.id])).rows[0].data.summary.content,
			).toBe("<p>Built services.</p>");
			expect((await database.admin().query("SELECT id FROM resume_version WHERE resume_id=$1", [f.id])).rows).toEqual(
				[],
			);
		} finally {
			await database
				.admin()
				.query("DROP TRIGGER reject_review_test ON ai_review_decision; DROP FUNCTION reject_review_test()");
		}
	});
});
