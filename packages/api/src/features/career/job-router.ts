import { z } from "zod";
import {
	jobEvidenceViewSchema,
	jobTargetRevisionSchema,
	saveAndSelectResumeJobInputSchema,
	saveJobTargetInputSchema,
	selectedResumeJobSchema,
	selectResumeJobInputSchema,
} from "@reactive-resume/schema/job-evidence";
import { protectedProcedure } from "../../context";
import { getJobEvidence } from "./job-evidence";
import { getJobTargetRevision, saveAndSelectResumeJob, saveJobTarget, selectResumeJob } from "./job-targets";

export const jobTargetsRouter = {
	saveAndSelect: protectedProcedure
		.route({
			method: "POST",
			path: "/career/job-targets/comparisons",
			tags: ["Internal"],
			operationId: "saveAndSelectResumeJobTarget",
		})
		.input(saveAndSelectResumeJobInputSchema)
		.output(selectedResumeJobSchema)
		.handler(({ context, input }) => saveAndSelectResumeJob(context.user.id, input)),
	save: protectedProcedure
		.route({
			method: "POST",
			path: "/career/job-targets/revisions",
			tags: ["Internal"],
			operationId: "saveJobTargetRevision",
		})
		.input(saveJobTargetInputSchema)
		.output(jobTargetRevisionSchema)
		.handler(({ context, input }) => saveJobTarget(context.user.id, input)),
	revision: protectedProcedure
		.route({
			method: "GET",
			path: "/career/job-targets/{jobId}/revisions/{revision}",
			tags: ["Internal"],
			operationId: "getJobTargetRevision",
		})
		.input(z.strictObject({ jobId: z.string().min(1).max(200), revision: z.string().min(1).max(200) }))
		.output(jobTargetRevisionSchema)
		.handler(({ context, input }) => getJobTargetRevision(context.user.id, input.jobId, input.revision)),
	select: protectedProcedure
		.route({
			method: "POST",
			path: "/career/job-targets/selections",
			tags: ["Internal"],
			operationId: "selectResumeJobTarget",
		})
		.input(selectResumeJobInputSchema)
		.output(selectedResumeJobSchema)
		.handler(({ context, input }) => selectResumeJob(context.user.id, input)),
	evidence: protectedProcedure
		.route({
			method: "GET",
			path: "/career/job-targets/evidence/{resumeId}",
			tags: ["Internal"],
			operationId: "getResumeJobEvidence",
		})
		.input(z.strictObject({ resumeId: z.string().min(1).max(200) }))
		.output(jobEvidenceViewSchema)
		.handler(({ context, input }) => getJobEvidence(context.user.id, input.resumeId)),
};
