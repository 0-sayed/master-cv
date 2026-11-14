import type { ModelPayloadInput } from "./payload";
import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import type { SourceRevision } from "@reactive-resume/schema/ai-operation";
import type { ProposalTarget, ReviewEvidence } from "@reactive-resume/schema/resume/ai-review";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, eq, inArray, lte } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import {
	aiImportReviewSource,
	aiOperation,
	aiReviewDecision,
	careerFact,
	careerProfile,
	resume,
	resumeFactLink,
} from "@reactive-resume/db/schema";
import { readTarget, splitBlocks } from "@reactive-resume/resume/proposals";
import { reviewTargetSchema } from "@reactive-resume/schema/resume/ai-review";
import { parseResumeDataForWrite } from "@reactive-resume/schema/resume/write";
import { generateId } from "@reactive-resume/utils/string";
import { readJobRevision } from "../career/job-targets";
import { lockDocumentOwner } from "../documents/ownership";
import { buildModelPayload, resumeContactValues } from "./payload";

export type ReviewSourceSnapshot = {
	source: SourceRevision;
	selections: ModelPayloadInput["selections"];
	evidence: ReviewEvidence[];
	expiresAt: Date | null;
	partial: boolean;
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const reviewPassageId = (source: SourceRevision, target: ProposalTarget, html: string) =>
	digest(
		JSON.stringify([
			source.kind,
			source.id,
			source.revision,
			target.sectionId,
			target.itemId ?? null,
			target.roleId ?? null,
			target.field,
			html,
		]),
	);
export const sameReviewSource = (a: SourceRevision, b: SourceRevision) =>
	a.kind === b.kind && a.id === b.id && a.revision === b.revision;
const sameReviewTarget = (a: ProposalTarget, b: ProposalTarget) =>
	a.sectionId === b.sectionId && a.itemId === b.itemId && a.roleId === b.roleId && a.field === b.field;
const fail = (reason: string): never => {
	throw new ORPCError("CONFLICT", { data: { reason } });
};

/** Shared order with career linking: profile, then resume, then fact rows. */
export function lockReviewProfile(tx: OwnerTransaction, ownerId: string) {
	return tx.select().from(careerProfile).where(eq(careerProfile.userId, ownerId)).for("share");
}

export async function createImportReviewSource(
	ownerId: string,
	input: { flowId: string; section: string; text: string; partial: boolean; contactValues: string[] },
): Promise<{ source: SourceRevision; expiresAt: string }> {
	if (!input.flowId.trim() || input.flowId.length > 200) throw new ORPCError("BAD_REQUEST");
	const payload = buildModelPayload({
		selections: [{ id: "selected", kind: "unconfirmed_source", section: input.section, text: input.text }],
		contactValues: input.contactValues,
	});
	const selected = payload.selections[0];
	if (!selected) throw new ORPCError("BAD_REQUEST");
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
	const id = generateId();
	const revision = digest(JSON.stringify([input.flowId, selected.section, selected.text, input.partial]));
	await withOwnerDatabase(ownerId, (tx) =>
		tx.insert(aiImportReviewSource).values({
			id,
			userId: ownerId,
			flowId: input.flowId,
			section: selected.section,
			selection: selected.text,
			digest: revision,
			partial: input.partial,
			expiresAt,
		}),
	);
	return { source: { kind: "import", id, revision }, expiresAt: expiresAt.toISOString() };
}

export async function loadReviewSource(
	tx: OwnerTransaction,
	ownerId: string,
	source: SourceRevision,
	ancestors: readonly string[] = [],
	resumeChanges: readonly Pick<
		typeof aiReviewDecision.$inferSelect,
		"resumeId" | "beforeRevision" | "afterRevision"
	>[] = [],
): Promise<ReviewSourceSnapshot> {
	const empty: ReviewSourceSnapshot = { source, selections: [], evidence: [], expiresAt: null, partial: false };
	if (source.kind === "job") {
		const job = await readJobRevision(tx, ownerId, source.id, source.revision);
		return {
			...empty,
			selections: [
				{ id: `job:${job.jobId}:${job.revision}`, kind: "user_supplied", section: "summary", text: job.text },
			],
		};
	}
	if (source.kind === "import") {
		const [row] = await tx
			.select()
			.from(aiImportReviewSource)
			.where(and(eq(aiImportReviewSource.userId, ownerId), eq(aiImportReviewSource.id, source.id)));
		if (!row) throw new ORPCError("NOT_FOUND");
		if (row.expiresAt.getTime() <= Date.now()) fail("AI_SOURCE_EXPIRED");
		if (
			row.digest !== source.revision ||
			digest(JSON.stringify([row.flowId, row.section, row.selection, row.partial])) !== row.digest
		)
			fail("AI_SOURCE_CHANGED");
		return {
			...empty,
			partial: row.partial,
			expiresAt: row.expiresAt,
			selections: [{ id: row.id, kind: "unconfirmed_source", section: row.section, text: row.selection }],
			evidence: [
				{
					id: row.id,
					source,
					factId: null,
					factRevision: null,
					target: null,
					quote: row.selection,
					confirmation: "source_unconfirmed",
				},
			],
		};
	}
	if (source.kind === "career") {
		const [row] = await tx.select().from(careerProfile).where(eq(careerProfile.userId, ownerId)).for("share");
		if (!row || source.id !== ownerId) throw new ORPCError("NOT_FOUND");
		if (String(row.profileRevision) !== source.revision) fail("AI_SOURCE_CHANGED");
		return empty;
	}
	if (source.kind === "answer") {
		const [row] = await tx
			.select()
			.from(aiReviewDecision)
			.where(
				and(
					eq(aiReviewDecision.userId, ownerId),
					eq(aiReviewDecision.id, source.id),
					eq(aiReviewDecision.event, "answer"),
				),
			);
		if (!row?.evidence || row.fingerprint !== source.revision) throw new ORPCError("NOT_FOUND");
		const [operation] = await tx
			.select()
			.from(aiOperation)
			.where(and(eq(aiOperation.userId, ownerId), eq(aiOperation.id, row.operationId)));
		if (!operation || ancestors.includes(source.id) || ancestors.length >= 10) return fail("AI_SOURCE_CHANGED");
		for (const parent of operation.sources)
			await loadReviewSource(tx, ownerId, parent, [...ancestors, source.id], resumeChanges);
		const answers = await tx
			.select({ id: aiReviewDecision.id, createdAt: aiReviewDecision.createdAt, subjects: aiReviewDecision.subjectIds })
			.from(aiReviewDecision)
			.where(
				and(
					eq(aiReviewDecision.userId, ownerId),
					eq(aiReviewDecision.operationId, row.operationId),
					eq(aiReviewDecision.event, "answer"),
				),
			);
		if (
			answers.some(
				(answer) =>
					answer.id !== row.id &&
					answer.subjects.some((id) => row.subjectIds.includes(id)) &&
					answer.createdAt > row.createdAt,
			)
		)
			fail("AI_SOURCE_CHANGED");
		return {
			...empty,
			selections: [{ id: row.id, kind: "user_supplied", section: "summary", text: row.evidence.quote }],
			evidence: [row.evidence],
		};
	}
	if (source.kind !== "resume") throw new ORPCError("BAD_REQUEST");
	await lockReviewProfile(tx, ownerId);
	const [row] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, source.id)))
		.for("share");
	if (!row || row.trashedAt) throw new ORPCError("NOT_FOUND");
	if (row.isLocked) throw new ORPCError("FORBIDDEN");
	// Only a continuous chain of this review's decisions may advance answer provenance.
	// A manual edit leaves a revision gap, even when it changes a different passage.
	let revision = source.revision;
	for (const change of resumeChanges)
		if (change.resumeId === source.id && change.beforeRevision === revision && change.afterRevision)
			revision = change.afterRevision;
	if (row.updatedAt.toISOString() !== revision) fail("AI_SOURCE_CHANGED");
	return empty;
}

export async function loadBoundReviewAnswer(
	tx: OwnerTransaction,
	ownerId: string,
	answer: SourceRevision,
	resumeSource: SourceRevision,
	targets: ProposalTarget[],
): Promise<ReviewSourceSnapshot> {
	const loaded = await loadReviewSource(tx, ownerId, answer);
	const [parent] = await tx
		.select({ sources: aiOperation.sources })
		.from(aiReviewDecision)
		.innerJoin(
			aiOperation,
			and(eq(aiOperation.userId, aiReviewDecision.userId), eq(aiOperation.id, aiReviewDecision.operationId)),
		)
		.where(
			and(
				eq(aiReviewDecision.userId, ownerId),
				eq(aiReviewDecision.id, answer.id),
				eq(aiReviewDecision.event, "answer"),
			),
		);
	if (
		answer.kind !== "answer" ||
		!parent?.sources.some((source) => sameReviewSource(source, resumeSource)) ||
		loaded.evidence.length !== 1 ||
		!loaded.evidence.every((entry) => {
			const answerTarget = entry.target;
			return answerTarget && targets.some((target) => sameReviewTarget(answerTarget, target));
		})
	)
		throw new Error("AI_SOURCE_BINDING");
	return loaded;
}

export function prepareResumeReview(
	ownerId: string,
	input: { resumeId: string; expectedUpdatedAt: string; targets: ProposalTarget[] },
): Promise<{ sources: SourceRevision[]; evidence: ReviewEvidence[] }> {
	return withOwnerDatabase(ownerId, (tx) => prepareResumeReviewInTransaction(tx, ownerId, input));
}

export async function prepareResumeReviewInTransaction(
	tx: OwnerTransaction,
	ownerId: string,
	input: { resumeId: string; expectedUpdatedAt: string; targets: ProposalTarget[] },
): Promise<{ sources: SourceRevision[]; evidence: ReviewEvidence[] }> {
	const source: SourceRevision = { kind: "resume", id: input.resumeId, revision: input.expectedUpdatedAt };
	await loadReviewSource(tx, ownerId, source);
	if (!input.targets.length || input.targets.length > 10) throw new ORPCError("BAD_REQUEST");
	const [row] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, source.id)));
	if (!row) throw new ORPCError("NOT_FOUND");
	const data = parseResumeDataForWrite(row.data);
	const contacts = resumeContactValues(data);
	const evidence: ReviewEvidence[] = [];
	for (const rawTarget of input.targets) {
		const target = reviewTargetSchema.parse(rawTarget);
		const value = readTarget(data, target);
		if (value === undefined) throw new ORPCError("BAD_REQUEST");
		for (const block of splitBlocks(value)) {
			const id = reviewPassageId(source, target, block.html);
			if (evidence.some((entry) => entry.id === id))
				throw new ORPCError("CONFLICT", { data: { reason: "AI_AMBIGUOUS_PASSAGE" } });
			const quote = buildModelPayload({
				selections: [
					{
						id,
						kind: "confirmed_content",
						section:
							Object.hasOwn(data.sections, target.sectionId) || target.sectionId === "summary"
								? target.sectionId
								: (data.customSections.find((section) => section.id === target.sectionId)?.type ?? ""),
						text: block.text,
					},
				],
				contactValues: contacts,
			}).selections[0]?.text;
			if (!quote) throw new ORPCError("BAD_REQUEST");
			evidence.push({ id, source, target, quote, factId: null, factRevision: null, confirmation: "confirmed" });
		}
	}
	const links = await tx
		.select({ fact: careerFact, accepted: resumeFactLink.acceptedRevision })
		.from(resumeFactLink)
		.innerJoin(careerFact, and(eq(careerFact.userId, resumeFactLink.userId), eq(careerFact.id, resumeFactLink.factId)))
		.where(and(eq(resumeFactLink.userId, ownerId), eq(resumeFactLink.resumeId, input.resumeId)));
	const sources: SourceRevision[] = [source];
	const relevant = links.filter(({ fact }) => {
		const structured = fact.structured;
		return (
			structured &&
			input.targets.some(
				(target) => target.sectionId === structured.section && (target.roleId ?? target.itemId) === structured.entityId,
			)
		);
	});
	if (relevant.length) {
		const [profile] = await tx.select().from(careerProfile).where(eq(careerProfile.userId, ownerId)).for("share");
		if (!profile) return fail("AI_SOURCE_CHANGED");
		const careerSource = { kind: "career" as const, id: ownerId, revision: String(profile.profileRevision) };
		sources.push(careerSource);
		for (const { fact, accepted } of relevant) {
			if (fact.status !== "active" || fact.confirmation !== "confirmed" || fact.revision !== accepted)
				fail("AI_SOURCE_CHANGED");
			const structured = fact.structured;
			if (!structured) return fail("AI_SOURCE_CHANGED");
			const target = input.targets.find(
				(target) => target.sectionId === structured.section && (target.roleId ?? target.itemId) === structured.entityId,
			);
			if (!target) return fail("AI_SOURCE_CHANGED");
			const quote = buildModelPayload({
				selections: [
					{
						id: fact.id,
						kind: "confirmed_content",
						section: structured.section,
						text: `${structured.field}: ${JSON.stringify(structured.value)}`,
					},
				],
				contactValues: contacts,
			}).selections[0]?.text;
			if (!quote) return fail("AI_SOURCE_CHANGED");
			evidence.push({
				id: `fact-${fact.id}`,
				source: careerSource,
				target,
				quote,
				factId: fact.id,
				factRevision: fact.revision,
				confirmation: "confirmed",
			});
		}
	}
	if (!evidence.length || evidence.length > 40) throw new ORPCError("BAD_REQUEST");
	return { sources, evidence };
}

/** Bounded owner-scoped maintenance; failed reads remain closed before cleanup runs. */
export async function removeExpiredReviewSources(ownerId: string): Promise<void> {
	await withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const expired = await tx
			.select({ id: aiImportReviewSource.id })
			.from(aiImportReviewSource)
			.where(and(eq(aiImportReviewSource.userId, ownerId), lte(aiImportReviewSource.expiresAt, new Date())))
			.limit(100);
		if (expired.length)
			await tx.delete(aiImportReviewSource).where(
				and(
					eq(aiImportReviewSource.userId, ownerId),
					inArray(
						aiImportReviewSource.id,
						expired.map((row) => row.id),
					),
				),
			);
	});
}
