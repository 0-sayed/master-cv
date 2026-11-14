import type { OwnerTransaction } from "@reactive-resume/db/client";
import type {
	SaveAndSelectResumeJobInput,
	SaveJobTargetInput,
	SelectResumeJobInput,
} from "@reactive-resume/schema/job-evidence";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, desc, eq, isNull } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { jobTarget, jobTargetRevision, resume, resumeJobSelection } from "@reactive-resume/db/schema";
import {
	saveAndSelectResumeJobInputSchema,
	saveJobTargetInputSchema,
	selectResumeJobInputSchema,
} from "@reactive-resume/schema/job-evidence";
import { generateId } from "@reactive-resume/utils/string";
import { lockDocumentOwner } from "../documents/ownership";

export const jobDigest = (text: string) => createHash("sha256").update(text).digest("hex");
export async function readJobRevision(tx: OwnerTransaction, ownerId: string, jobId: string, revision: string) {
	const [row] = await tx
		.select()
		.from(jobTargetRevision)
		.where(
			and(
				eq(jobTargetRevision.userId, ownerId),
				eq(jobTargetRevision.jobId, jobId),
				eq(jobTargetRevision.revision, revision),
			),
		);
	if (!row) throw new ORPCError("NOT_FOUND");
	if (jobDigest(row.text) !== row.digest) throw new ORPCError("CONFLICT", { data: { reason: "JOB_DIGEST_CHANGED" } });
	return { ...row, createdAt: row.createdAt.toISOString() };
}
export function getJobTargetRevision(ownerId: string, jobId: string, revision: string) {
	return withOwnerDatabase(ownerId, (tx) => readJobRevision(tx, ownerId, jobId, revision));
}
export function saveJobTarget(ownerId: string, raw: SaveJobTargetInput) {
	const input = saveJobTargetInputSchema.parse(raw);
	return withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		let jobId = input.jobId;
		let createdAt = new Date();
		if (jobId) {
			const [job] = await tx
				.select()
				.from(jobTarget)
				.where(and(eq(jobTarget.userId, ownerId), eq(jobTarget.id, jobId)))
				.for("update");
			if (!job) throw new ORPCError("NOT_FOUND");
			const [latest] = await tx
				.select()
				.from(jobTargetRevision)
				.where(and(eq(jobTargetRevision.userId, ownerId), eq(jobTargetRevision.jobId, jobId)))
				.orderBy(desc(jobTargetRevision.createdAt), desc(jobTargetRevision.revision))
				.limit(1);
			if (!latest || latest.revision !== input.expectedRevision)
				throw new ORPCError("CONFLICT", { data: { reason: "JOB_REVISION_CHANGED" } });
			createdAt = new Date(Math.max(Date.now(), latest.createdAt.getTime() + 1));
		} else {
			jobId = generateId();
			await tx.insert(jobTarget).values({ id: jobId, userId: ownerId });
		}
		const revision = generateId();
		await tx.insert(jobTargetRevision).values({
			userId: ownerId,
			jobId,
			revision,
			role: input.role,
			employer: input.employer,
			text: input.text,
			digest: jobDigest(input.text),
			createdAt,
		});
		return readJobRevision(tx, ownerId, jobId, revision);
	});
}
export function selectResumeJob(ownerId: string, raw: SelectResumeJobInput) {
	const input = selectResumeJobInputSchema.parse(raw);
	return withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const [cv] = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), eq(resume.id, input.resumeId), isNull(resume.trashedAt)))
			.for("update");
		if (!cv) throw new ORPCError("NOT_FOUND");
		if (cv.isLocked) throw new ORPCError("RESUME_LOCKED", { status: 403 });
		if (cv.updatedAt.toISOString() !== input.expectedUpdatedAt)
			throw new ORPCError("CONFLICT", { data: { reason: "RESUME_VERSION_CHANGED" } });
		await readJobRevision(tx, ownerId, input.jobId, input.jobRevision);
		const [previous] = await tx
			.select()
			.from(resumeJobSelection)
			.where(and(eq(resumeJobSelection.userId, ownerId), eq(resumeJobSelection.resumeId, cv.id)))
			.for("update");
		if ((previous?.updatedAt.toISOString() ?? null) !== (input.expectedSelectionRevision ?? null))
			throw new ORPCError("CONFLICT", { data: { reason: "JOB_SELECTION_CHANGED" } });
		const updatedAt = new Date(Math.max(Date.now(), (previous?.updatedAt.getTime() ?? 0) + 1));
		await tx
			.insert(resumeJobSelection)
			.values({ userId: ownerId, resumeId: cv.id, jobId: input.jobId, jobRevision: input.jobRevision, updatedAt })
			.onConflictDoUpdate({
				target: resumeJobSelection.resumeId,
				set: { jobId: input.jobId, jobRevision: input.jobRevision, updatedAt },
			});
		return { resumeId: cv.id, jobId: input.jobId, jobRevision: input.jobRevision, revision: updatedAt.toISOString() };
	});
}

/** Editing one CV's pasted ad forks it; saving and selecting commit together. */
export function saveAndSelectResumeJob(ownerId: string, raw: SaveAndSelectResumeJobInput) {
	const input = saveAndSelectResumeJobInputSchema.parse(raw);
	return withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const job = await saveJobTarget(ownerId, { role: input.role, employer: input.employer, text: input.text });
		return selectResumeJob(ownerId, {
			resumeId: input.resumeId,
			expectedUpdatedAt: input.expectedUpdatedAt,
			expectedSelectionRevision: input.expectedSelectionRevision,
			jobId: job.jobId,
			jobRevision: job.revision,
		});
	});
}
