import type { ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { hashReviewTarget } from "@reactive-resume/resume/review-evidence";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

const state = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, writes: [] as unknown[] }));
vi.mock("@reactive-resume/db/owner-scope", () => ({
	withOwnerDatabase: async (_owner: string, work: (tx: unknown) => unknown) =>
		work({
			select: (projection?: Record<string, unknown>) => {
				let rows: Record<string, unknown>[] = [];
				const query = {
					from: (table: Parameters<typeof getTableName>[0]) => {
						rows = state.rows[getTableName(table)] ?? [];
						return query;
					},
					where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
						const params = new PgDialect().sqlToQuery(condition).params;
						rows = rows.filter((row) =>
							params.every((value) => typeof value !== "string" || Object.values(row).includes(value)),
						);

						const result = Promise.resolve(
							rows.map((row) => (projection && "subjects" in projection ? { ...row, subjects: row.subjectIds } : row)),
						);
						return Object.assign(result, { for: () => result, orderBy: () => result });
					},
				};
				return query;
			},
			insert: () => ({
				values: (value: unknown) => {
					state.writes.push(value);
					return { returning: async () => [value] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => [] }) }),
		}),
}));
vi.mock("../resume/service", () => ({
	updateResumeTx: async (_tx: unknown, input: { data: unknown }) => {
		state.writes.push(input);
		return { updatedAt: new Date("2026-11-14T00:00:02Z") };
	},
	notifyResumeUpdated: async () => {},
}));
vi.mock("../resume/version-history", () => ({ writeVersion: async () => ({ id: "history" }) }));
import { decideReview } from "./review-decisions";

function fixture() {
	const updatedAt = new Date("2026-11-14T00:00:00Z");
	const source = { kind: "resume", id: "cv", revision: updatedAt.toISOString() } as const;
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Built services.</p><p>Filed reports.</p>";
	const target = { sectionId: "summary", field: "content" };
	const proposal = {
		schemaVersion: 2 as const,
		id: "p",
		target,
		location: "Summary",
		before: "<p>Built services.</p>",
		after: "<p>Developed services.</p>",
		why: "Clearer",
		status: "pending" as const,
		source: "improve" as const,
		base: source,
		targetHash: hashReviewTarget(data.summary.content),
		evidenceIds: ["e"],
		claims: splitReviewClaims("Developed services.", ["e"]),
	};
	const result: Extract<ReviewResult, { kind: "wording" }> = {
		schemaVersion: 2,
		kind: "wording",
		sourceRevision: source,
		evidence: [
			{
				id: "e",
				source,
				target,
				factId: null,
				factRevision: null,
				quote: "Built services.",
				confirmation: "confirmed",
			},
		],
		proposals: [proposal],
		questions: [],
		notes: [],
	};
	state.rows = {
		user: [{ id: "alice" }],
		resume: [{ id: "cv", userId: "alice", data, updatedAt, isLocked: false, trashedAt: null }],
		ai_operation: [
			{ id: "op", userId: "alice", kind: "review.wording", state: "waiting_review", sources: [source], result },
		],
		ai_review_decision: [],
	};
	return {
		data,
		result,
		proposal,
		source,
		input: {
			operationId: "op",
			proposalIds: ["p"],
			requestKey: "decision",
			expectedUpdatedAt: updatedAt.toISOString(),
			decision: "accept" as const,
		},
	};
}
beforeEach(() => {
	state.writes = [];
});
it("refuses Undo when the accepted text was relocated into another paragraph", async () => {
	const f = fixture();
	const acceptedData = structuredClone(f.data);
	acceptedData.summary.content = "<p>Developed services.</p><p>Filed reports.</p>";
	state.rows.ai_review_decision = [
		{
			id: "accepted",
			userId: "alice",
			operationId: "op",
			requestKey: "old",
			event: "accept",
			subjectIds: ["p"],
			changes: [f.proposal],
			response: { data: acceptedData },
		},
	];
	f.data.summary.content = "<p>Manual replacement.</p><p>Developed services.</p>";
	await expect(
		decideReview("alice", { ...f.input, decision: "undo", undoDecisionId: "accepted" }),
	).rejects.toMatchObject({ code: "CONFLICT", data: { reason: "AI_UNDO_CHANGED" } });
	expect(state.writes).toEqual([]);
	expect(f.data.summary.content).toBe("<p>Manual replacement.</p><p>Developed services.</p>");
});
it("rejects acceptance after a cited answer was superseded for the same question", async () => {
	const f = fixture();
	const answerSource = { kind: "answer", id: "answer-old", revision: "old-fingerprint" } as const;
	const answer = {
		id: "answer-old",
		source: answerSource,
		target: f.proposal.target,
		factId: null,
		factRevision: null,
		quote: "Built services.",
		confirmation: "user_supplied" as const,
	};
	f.result.evidence.push(answer);
	f.proposal.evidenceIds.push(answer.id);
	state.rows.ai_operation?.push({ id: "question-op", userId: "alice", sources: [f.source] });
	state.rows.ai_review_decision = [
		{
			id: "answer-old",
			userId: "alice",
			operationId: "question-op",
			event: "answer",
			subjectIds: ["q"],
			fingerprint: "old-fingerprint",
			evidence: answer,
			createdAt: new Date("2026-11-13T00:00:00Z"),
		},
		{
			id: "answer-new",
			userId: "alice",
			operationId: "question-op",
			event: "answer",
			subjectIds: ["q"],
			fingerprint: "new-fingerprint",
			evidence: { ...answer, quote: "Filed reports." },
			createdAt: new Date("2026-11-14T00:00:00Z"),
		},
	];
	await expect(decideReview("alice", f.input)).rejects.toMatchObject({
		code: "CONFLICT",
		data: { reason: "AI_SOURCE_CHANGED" },
	});
	expect(state.writes).toEqual([]);
});

it("undo restores the original passage and preserves manual work in other fields", async () => {
	const f = fixture();
	const acceptedData = structuredClone(f.data);
	acceptedData.summary.content = "<p>Developed services.</p><p>Filed reports.</p>";
	state.rows.ai_review_decision = [
		{
			id: "accepted",
			userId: "alice",
			operationId: "op",
			requestKey: "old",
			event: "accept",
			subjectIds: ["p"],
			changes: [f.proposal],
			response: { data: acceptedData },
		},
	];
	f.data.summary.content = acceptedData.summary.content;
	f.data.basics.headline = "Manual headline";
	const result = await decideReview("alice", { ...f.input, decision: "undo", undoDecisionId: "accepted" });
	expect(result.data.summary.content).toBe("<p>Built services.</p><p>Filed reports.</p>");
	expect(result.data.basics.headline).toBe("Manual headline");
});
