import { ORPCError } from "@orpc/client";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { aiOperation, aiReviewDecision, resume, resumeJobSelection } from "@reactive-resume/db/schema";
import {
	analyzeJobTerms,
	buildJobPassages,
	JOB_NORMALIZATION_VERSION,
	JOB_RUBRIC_VERSION,
} from "@reactive-resume/resume/ats";
import { variantReviewResultSchema } from "@reactive-resume/schema/resume/variants";
import { readJobRevision, jobDigest } from "./job-targets";

export function getJobEvidence(ownerId: string, resumeId: string) {
	return withOwnerDatabase(ownerId, async (tx) => {
		const [cv] = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), eq(resume.id, resumeId), isNull(resume.trashedAt)))
			.for("share");
		if (!cv) throw new ORPCError("NOT_FOUND");
		const [selection] = await tx
			.select()
			.from(resumeJobSelection)
			.where(and(eq(resumeJobSelection.userId, ownerId), eq(resumeJobSelection.resumeId, resumeId)))
			.for("share");
		if (!selection) return { selection: null, job: null, literal: null, semantic: { state: "not-checked" as const } };
		const job = await readJobRevision(tx, ownerId, selection.jobId, selection.jobRevision);
		const literal = analyzeJobTerms({
			identity: {
				resumeId,
				resumeRevision: cv.updatedAt.toISOString(),
				contentHash: jobDigest(JSON.stringify(cv.data)),
				jobId: job.jobId,
				jobRevision: job.revision,
				rubricVersion: JOB_RUBRIC_VERSION,
				normalizationVersion: JOB_NORMALIZATION_VERSION,
			},
			jobText: job.text,
			passages: buildJobPassages(cv.data),
		});
		const [operation] = await tx
			.select()
			.from(aiOperation)
			.where(
				and(
					eq(aiOperation.userId, ownerId),
					eq(aiOperation.kind, "review.job-evidence"),
					sql`${aiOperation.sources} @> ${JSON.stringify([{ kind: "resume", id: resumeId }])}::jsonb`,
				),
			)
			.orderBy(desc(aiOperation.createdAt), desc(aiOperation.id))
			.limit(1);
		let semantic: import("zod").z.infer<
			typeof import("@reactive-resume/schema/job-evidence").jobEvidenceViewSchema
		>["semantic"] = { state: "not-checked" };
		if (operation) {
			const same =
				operation.parameters.resumeId === resumeId &&
				operation.parameters.expectedUpdatedAt === cv.updatedAt.toISOString() &&
				operation.parameters.jobId === job.jobId &&
				operation.parameters.jobRevision === job.revision &&
				operation.parameters.expectedSelectionRevision === selection.updatedAt.toISOString();
			semantic = {
				state: !same
					? "stale"
					: ["failed", "cancelled", "cancel_requested"].includes(operation.state)
						? "failed"
						: operation.result
							? "waiting-review"
							: "pending",
				operationId: operation.id,
			};
			if (same && operation.result) {
				const [decision] = await tx
					.select()
					.from(aiReviewDecision)
					.where(
						and(
							eq(aiReviewDecision.userId, ownerId),
							eq(aiReviewDecision.operationId, operation.id),
							sql`${aiReviewDecision.subjectIds} @> '["report"]'::jsonb`,
						),
					)
					.orderBy(desc(aiReviewDecision.createdAt), desc(aiReviewDecision.id))
					.limit(1);
				if (decision?.event === "accept") {
					const result = variantReviewResultSchema.parse(operation.result);
					if (result.kind === "review.job-evidence")
						semantic = {
							state: "complete",
							operationId: operation.id,
							identity: literal.identity,
							findings: result.output,
						};
				}
			}
		}
		return {
			selection: { resumeId, jobId: job.jobId, jobRevision: job.revision, revision: selection.updatedAt.toISOString() },
			job,
			literal,
			semantic,
		};
	});
}
