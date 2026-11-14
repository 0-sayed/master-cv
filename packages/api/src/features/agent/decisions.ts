import type { UIMessage } from "ai";
import { ORPCError } from "@orpc/client";
import { and, eq } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { agentMessage, agentThread, aiOperation } from "@reactive-resume/db/schema";
import { lockDocumentOwner } from "../documents/ownership";
import { proposedEditsOf, withEditStatuses } from "./messages-persistence";

type EditStatus = "pending" | "accepted" | "rejected";
export type EditDecisionInput = {
	userId: string;
	threadId: string;
	messageId: string;
	toolCallId: string;
	edits: Array<{ id: string; status: EditStatus; expectedStatus?: EditStatus | undefined }>;
};

export function recordEditDecision(input: EditDecisionInput) {
	return withOwnerDatabase(input.userId, async (tx) => {
		await lockDocumentOwner(tx, input.userId);
		const [thread] = await tx
			.select()
			.from(agentThread)
			.where(and(eq(agentThread.id, input.threadId), eq(agentThread.userId, input.userId)))
			.for("update");
		if (!thread || thread.deletedAt) throw new ORPCError("NOT_FOUND");
		const rows = await tx
			.select()
			.from(agentMessage)
			.where(and(eq(agentMessage.threadId, input.threadId), eq(agentMessage.userId, input.userId)))
			.for("update");
		const row = rows.find((candidate) => candidate.uiMessage.id === input.messageId);
		if (!row || row.role !== "assistant") throw new ORPCError("NOT_FOUND");
		const [operation] = await tx
			.select({ kind: aiOperation.kind })
			.from(aiOperation)
			.where(and(eq(aiOperation.userId, input.userId), eq(aiOperation.id, input.messageId)));
		if (operation?.kind.startsWith("review."))
			throw new ORPCError("FORBIDDEN", { message: "Use the review decision service." });
		const original = row.uiMessage as unknown as UIMessage;
		const scoped = {
			...original,
			parts: original.parts.filter((part) => "toolCallId" in part && part.toolCallId === input.toolCallId),
		};
		const stored = new Map(proposedEditsOf(scoped).map((edit) => [edit.id, edit.status]));
		if (!input.edits.length || new Set(input.edits.map((edit) => edit.id)).size !== input.edits.length)
			throw new ORPCError("BAD_REQUEST");
		for (const edit of input.edits) {
			const previous = stored.get(edit.id);
			if (!previous) throw new ORPCError("NOT_FOUND");
			if (previous !== edit.status && previous !== (edit.expectedStatus ?? "pending"))
				throw new ORPCError("CONFLICT", { data: { reason: "AI_DECISION_CHANGED" } });
		}
		const message = withEditStatuses(
			original,
			input.toolCallId,
			new Map(input.edits.map((edit) => [edit.id, edit.status])),
		);
		await tx
			.update(agentMessage)
			.set({ uiMessage: message as never })
			.where(eq(agentMessage.id, row.id));
		const accepted = rows
			.map((candidate) => (candidate.id === row.id ? message : (candidate.uiMessage as unknown as UIMessage)))
			.flatMap(proposedEditsOf)
			.filter((edit) => edit.status === "accepted").length;
		const [updated] = await tx
			.update(agentThread)
			.set({ editsAccepted: accepted })
			.where(eq(agentThread.id, thread.id))
			.returning({ editsProposed: agentThread.editsProposed, editsAccepted: agentThread.editsAccepted });
		if (!updated) throw new ORPCError("NOT_FOUND");
		return updated;
	});
}
