import type { GuardContext } from "../ai/variant-types";
import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import type { OperationRequest, SourceRevision } from "@reactive-resume/schema/ai-operation";
import type { CoverLetter } from "@reactive-resume/schema/cover-letter/data";
import type { LetterGenerationInput, LetterReviewDecisionInput } from "@reactive-resume/schema/cover-letter/review";
import { ORPCError } from "@orpc/client";
import { and, eq, desc, sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiOperation, coverLetter, coverLetterProposalDecision } from "@reactive-resume/db/schema";
import { coverLetterSchema } from "@reactive-resume/schema/cover-letter/data";
import {
	letterGenerationInputSchema,
	letterReviewDecisionInputSchema,
} from "@reactive-resume/schema/cover-letter/review";
import { operationRequest } from "../ai/operations";
import { loadConfirmedCvContext } from "../ai/variant-sources";
import { lockDocumentOwner } from "../documents/ownership";
import { requirePersonalTool } from "../personal-tools/availability";
import { validateLetterOutput, letterProposalHtml } from "./review-handler";
import { writeLetterVersion } from "./versions";

export type LetterSnapshot = GuardContext & {
	category: "cover-letter";
	letter: CoverLetter;
	parameters: LetterGenerationInput;
	sourceRevision: string;
};
const conflict = (): never => {
	throw new ORPCError("CONFLICT", { message: "LETTER_REVIEW_STALE" });
};

export async function loadLetterSnapshot(
	tx: OwnerTransaction,
	ownerId: string,
	request: OperationRequest,
): Promise<LetterSnapshot> {
	requirePersonalTool("coverLetters");
	if (request.kind !== "review.cover-letter") throw new ORPCError("BAD_REQUEST");
	const parameters = letterGenerationInputSchema.parse(request.parameters);
	const context = await loadConfirmedCvContext(tx, ownerId, request);
	const [row] = await tx
		.select()
		.from(coverLetter)
		.where(and(eq(coverLetter.userId, ownerId), eq(coverLetter.id, parameters.letterId)))
		.for("share");
	if (!row || row.trashedAt) throw new ORPCError("NOT_FOUND");
	if (row.isLocked) throw new ORPCError("FORBIDDEN", { message: "LETTER_LOCKED" });
	const letter = coverLetterSchema.parse(row);
	const letterSources = request.sources.filter((source) => source.kind === "cover-letter");
	if (
		letter.revision !== parameters.expectedLetterRevision ||
		letter.sourceResumeId !== parameters.resumeId ||
		letter.style.metadata.page.locale !== parameters.documentLocale ||
		letterSources.length !== 1 ||
		letterSources[0]?.id !== letter.id ||
		letterSources[0]?.revision !== String(letter.revision)
	)
		conflict();
	if (!context.cv.length || !context.jobAd?.segments.length)
		throw new ORPCError("PRECONDITION_FAILED", { message: "LETTER_EVIDENCE_REQUIRED" });
	return { ...context, category: "cover-letter", letter, parameters };
}

export function prepareLetterReview(ownerId: string, raw: LetterGenerationInput) {
	return withOwnerDatabase(ownerId, async (tx) => {
		const parameters = letterGenerationInputSchema.parse(raw);
		const sources: SourceRevision[] = [
			{ kind: "resume", id: parameters.resumeId, revision: parameters.expectedUpdatedAt },
			{ kind: "job", id: parameters.jobId, revision: parameters.jobRevision },
			{ kind: "cover-letter", id: parameters.letterId, revision: String(parameters.expectedLetterRevision) },
		];
		const prepared = { kind: "review.cover-letter" as const, parameters, sources };
		await loadLetterSnapshot(tx, ownerId, {
			...prepared,
			requestKey: "prepare",
			route: { routeId: "prepare", routeRevision: "prepare", configRevision: "prepare" },
			consentVersion: "prepare",
		});
		return prepared;
	});
}

export function decideLetterReview(
	ownerId: string,
	raw: LetterReviewDecisionInput,
): Promise<{ letter: CoverLetter; decision: "accept" | "reject"; versionId: string | null }> {
	requirePersonalTool("coverLetters");
	const input = letterReviewDecisionInputSchema.parse(raw);
	return withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const [operation] = await tx
			.select()
			.from(aiOperation)
			.where(and(eq(aiOperation.userId, ownerId), eq(aiOperation.id, input.operationId)))
			.for("update");
		if (!operation || operation.kind !== "review.cover-letter") throw new ORPCError("NOT_FOUND");
		const [replay] = await tx
			.select()
			.from(coverLetterProposalDecision)
			.where(
				and(
					eq(coverLetterProposalDecision.userId, ownerId),
					eq(coverLetterProposalDecision.operationId, input.operationId),
				),
			);
		if (replay) {
			if (
				replay.letterId !== input.letterId ||
				replay.baseRevision !== input.expectedRevision ||
				replay.decision !== input.decision
			)
				conflict();
			const [current] = await tx
				.select()
				.from(coverLetter)
				.where(and(eq(coverLetter.userId, ownerId), eq(coverLetter.id, input.letterId)));
			if (!current) throw new ORPCError("NOT_FOUND");
			return { letter: coverLetterSchema.parse(current), decision: replay.decision, versionId: replay.versionId };
		}
		const [key] = await tx
			.select()
			.from(coverLetterProposalDecision)
			.where(
				and(
					eq(coverLetterProposalDecision.userId, ownerId),
					eq(coverLetterProposalDecision.requestKey, input.requestKey),
				),
			);
		if (key) conflict();
		if (operation.state !== "waiting_review" || !operation.deliveredAt || !operation.result)
			throw new ORPCError("PRECONDITION_FAILED");
		const snapshot = await loadLetterSnapshot(tx, ownerId, operationRequest(operation));
		if (snapshot.letter.id !== input.letterId || snapshot.letter.revision !== input.expectedRevision) conflict();
		let letter = snapshot.letter;
		let versionId: string | null = null;
		if (input.decision === "accept") {
			const output = validateLetterOutput(snapshot, operation.result.output);
			const [updated] = await tx
				.update(coverLetter)
				.set({ content: letterProposalHtml(output), revision: letter.revision + 1, updatedAt: new Date() })
				.where(
					and(
						eq(coverLetter.userId, ownerId),
						eq(coverLetter.id, letter.id),
						eq(coverLetter.revision, input.expectedRevision),
					),
				)
				.returning();
			if (!updated) conflict();
			letter = coverLetterSchema.parse(updated);
			const version = await writeLetterVersion(tx, { letter, userId: ownerId, kind: "named", name: letter.name });
			versionId = version.id;
		}
		await tx.insert(coverLetterProposalDecision).values({
			operationId: operation.id,
			userId: ownerId,
			letterId: letter.id,
			baseRevision: input.expectedRevision,
			decision: input.decision,
			requestKey: input.requestKey,
			versionId,
		});
		await tx
			.update(aiOperation)
			.set({ state: "succeeded" })
			.where(and(eq(aiOperation.userId, ownerId), eq(aiOperation.id, operation.id)));
		return { letter, decision: input.decision, versionId };
	});
}

export function getLetterReview(ownerId: string, input: { letterId: string; operationId: string }) {
	requirePersonalTool("coverLetters");
	return withOwnerDatabase(ownerId, async (tx) => {
		const [operation] = await tx
			.select()
			.from(aiOperation)
			.where(and(eq(aiOperation.userId, ownerId), eq(aiOperation.id, input.operationId)));
		if (!operation || operation.kind !== "review.cover-letter") throw new ORPCError("NOT_FOUND");
		const parameters = letterGenerationInputSchema.parse(operation.parameters);
		if (parameters.letterId !== input.letterId) throw new ORPCError("NOT_FOUND");
		const [decision] = await tx
			.select()
			.from(coverLetterProposalDecision)
			.where(
				and(
					eq(coverLetterProposalDecision.userId, ownerId),
					eq(coverLetterProposalDecision.operationId, input.operationId),
				),
			);
		return { decision: decision?.decision ?? null, versionId: decision?.versionId ?? null };
	});
}

export function latestLetterReview(ownerId: string, letterId: string) {
	requirePersonalTool("coverLetters");
	return withOwnerDatabase(ownerId, async (tx) => {
		const [operation] = await tx
			.select()
			.from(aiOperation)
			.where(
				and(
					eq(aiOperation.userId, ownerId),
					eq(aiOperation.kind, "review.cover-letter"),
					sql`${aiOperation.parameters}->>'letterId' = ${letterId}`,
				),
			)
			.orderBy(desc(aiOperation.createdAt))
			.limit(1);
		if (!operation) return null;
		const parameters = letterGenerationInputSchema.parse(operation.parameters);
		return { operationId: operation.id, expectedRevision: parameters.expectedLetterRevision };
	});
}
