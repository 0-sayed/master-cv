import type { OperationRequest, ResumeOutcome } from "@reactive-resume/schema/ai-operation";
import { ORPCError } from "@orpc/client";
import { and, eq } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { agentThread } from "@reactive-resume/db/schema";
import { operationService } from "../ai/operations";

async function linkedOperation(userId: string, threadId: string) {
	const [thread] = await withOwnerDatabase(userId, (tx) =>
		tx
			.select()
			.from(agentThread)
			.where(and(eq(agentThread.id, threadId), eq(agentThread.userId, userId))),
	);
	if (!thread || thread.deletedAt) throw new ORPCError("NOT_FOUND");
	if (!thread.activeOperationId)
		throw new ORPCError("PRECONDITION_FAILED", { data: { reason: "AI_RESUME_UNSUPPORTED" } });
	return thread.activeOperationId;
}

/** Existing conversations consume the common executor; transport is optional, persistence is not. */
export const assistantOperations = {
	start: (userId: string, threadId: string, request: OperationRequest) =>
		operationService.start(userId, request, { threadId }),
	async status(userId: string, threadId: string): Promise<ResumeOutcome> {
		const operation = await operationService.get(userId, await linkedOperation(userId, threadId));
		// This bounded consumer uses polling. It never claims an empty Redis stream resumed successfully.
		return { capability: operation.resultId ? "completed" : "unsupported", operation };
	},
	async stop(userId: string, threadId: string) {
		return operationService.cancel(userId, await linkedOperation(userId, threadId));
	},
	async result(userId: string, threadId: string) {
		return operationService.getResult(userId, await linkedOperation(userId, threadId));
	},
};
