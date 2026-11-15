import type { DeletionReplayRecordV1 } from "./contracts";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { consumeFreshProof, requireAccountSession } from "@reactive-resume/auth/account-access";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import * as schema from "@reactive-resume/db/schema";
import { requestRunCancellation } from "../agent/cancellation";
import { revokeAppleAuthorization } from "../auth/apple-revocation";
import { getStorageService } from "../storage/service";
import { deletionReplayRecordSchema, type DeletionHooks, type ProcessorDeletionAdapter } from "./contracts";
import { enqueuePrivacyNotice } from "./delivery";
import { ownerSelector, personalDataInventory } from "./inventory";
import { eraseRecordedProcessors, type RecordedProcessor } from "./processor-deletion";
import { claimPrivacyWork, completePrivacyWork, liveWorkLease, retryPrivacyWork, type WorkClaim } from "./work";
export const initialDeletionStages: DeletionReplayRecordV1["stages"] = {
	admissionClosed: true,
	workQuiesced: false,
	renewalsStopped: "pending",
	objectsRemoved: false,
	databaseRemoved: false,
	processors: "pending",
};
export async function requestAccountDeletion(input: {
	headers: Headers;
	proofToken: string;
	requestNonce: string;
	confirmed: true;
}): Promise<{ requestId: string; status: "requested" }> {
	if (input.confirmed !== true) throw new Error("FINAL_CONSENT_REQUIRED");
	const session = await requireAccountSession(input.headers);
	const accepted = await withOwnerDatabase(session.userId, async (tx) => {
		await consumeFreshProof(tx, {
			headers: input.headers,
			token: input.proofToken,
			action: "delete_account",
			requestNonce: input.requestNonce,
		});
		const [subject] = await tx
			.select({ email: schema.user.email, locale: schema.user.uiLocale })
			.from(schema.user)
			.where(eq(schema.user.id, session.userId));
		if (!subject) throw new Error("ACCOUNT_UNAVAILABLE");
		const appleAccounts = await tx
			.select({ refreshToken: schema.account.refreshToken, accessToken: schema.account.accessToken })
			.from(schema.account)
			.where(and(eq(schema.account.userId, session.userId), eq(schema.account.providerId, "apple")));
		for (const account of appleAccounts) await revokeAppleAuthorization(account);
		const [request] = await tx
			.insert(schema.accountDeletion)
			.values({ subjectUserId: session.userId, policyVersion: "synthetic-active-erasure-v1" })
			.returning();
		if (!request) throw new Error("DELETION_REQUEST_UNAVAILABLE");
		const attempted = await tx
			.selectDistinct({ id: schema.aiOperation.id, route: schema.aiOperation.route })
			.from(schema.aiOperation)
			.innerJoin(schema.aiOperationAttempt, eq(schema.aiOperationAttempt.operationId, schema.aiOperation.id))
			.where(eq(schema.aiOperation.userId, session.userId));
		const processors = attempted.map((operation) => ({
			processor: `ai-route:${operation.route.routeId}:${operation.route.routeRevision}:${operation.route.configRevision}`,
			subjectReference: operation.id,
			approved: true,
		}));
		const runs = await tx
			.select({ id: schema.agentThread.activeRunId })
			.from(schema.agentThread)
			.where(eq(schema.agentThread.userId, session.userId));
		await tx
			.update(schema.accountDataExport)
			.set({ status: "cancelled" })
			.where(
				and(
					eq(schema.accountDataExport.userId, session.userId),
					inArray(schema.accountDataExport.status, ["queued", "preparing", "ready", "failed"]),
				),
			);
		await tx
			.update(schema.storedFile)
			.set({ revokedAt: new Date() })
			.where(eq(schema.storedFile.userId, session.userId));
		await tx
			.update(schema.accountEmailChange)
			.set({ stage: "cancelled", tokenHash: "cancelled" })
			.where(eq(schema.accountEmailChange.userId, session.userId));
		await tx
			.update(schema.oauthClient)
			.set({ disabled: true, clientSecret: null })
			.where(or(eq(schema.oauthClient.userId, session.userId), eq(schema.oauthClient.referenceId, session.userId)));
		await tx.update(schema.user).set({ dataDeletionRequestedAt: new Date() }).where(eq(schema.user.id, session.userId));
		// Remove linked attempt counters before their primary owner-bearing verification rows.
		await tx.delete(schema.verification).where(ownerSelector(personalDataInventory.verification, session.userId));
		await tx.delete(schema.oauthAccessToken).where(eq(schema.oauthAccessToken.userId, session.userId));
		await tx.delete(schema.oauthRefreshToken).where(eq(schema.oauthRefreshToken.userId, session.userId));
		await tx.delete(schema.apikey).where(eq(schema.apikey.referenceId, session.userId));
		await tx.delete(schema.session).where(eq(schema.session.userId, session.userId));
		await tx.delete(schema.passkey).where(eq(schema.passkey.userId, session.userId));
		await tx.delete(schema.twoFactor).where(eq(schema.twoFactor.userId, session.userId));
		await tx.delete(schema.account).where(eq(schema.account.userId, session.userId));
		await tx
			.update(schema.privacyWork)
			.set({ status: "cancelled", payload: null, leaseToken: null, leaseUntil: null, completedAt: new Date() })
			.where(
				and(eq(schema.privacyWork.userId, session.userId), inArray(schema.privacyWork.status, ["queued", "retry"])),
			);
		await tx.insert(schema.privacyWork).values({
			userId: session.userId,
			kind: "delete_account",
			requestId: request.id,
			key: `delete:${request.id}`,
			payload: { stages: initialDeletionStages, processors },
		});
		await enqueuePrivacyNotice(
			{
				userId: session.userId,
				key: `deletion-received:${request.id}`,
				kind: "deletion_received",
				locale: subject.locale ?? "ar-SA",
				recipient: subject.email,
			},
			tx,
		);
		await enqueuePrivacyNotice(
			{
				userId: session.userId,
				key: `deletion-complete:${request.id}`,
				kind: "deletion_complete",
				locale: subject.locale ?? "ar-SA",
				recipient: subject.email,
				deferred: true,
			},
			tx,
		);
		await tx.execute(
			sql`SELECT master_cv_append_deletion_record(${request.id},${JSON.stringify(initialDeletionStages)}::jsonb)`,
		);
		return { requestId: request.id, runs: runs.flatMap((run) => (run.id ? [run.id] : [])) };
	});
	for (const runId of accepted.runs)
		try {
			await requestRunCancellation(runId, "ACCOUNT_DELETION_REQUESTED");
		} catch {
			/* Durable quiescence retries coordination; this is only an immediate signal. */
		}
	return { requestId: accepted.requestId, status: "requested" };
}

export async function quiesceAccountWork(input: {
	requestId: string;
	userId: string;
}): Promise<"complete" | "pending"> {
	const runs = await withOwnerDatabase(input.userId, (tx) =>
		tx
			.select({ id: schema.agentThread.activeRunId })
			.from(schema.agentThread)
			.where(eq(schema.agentThread.userId, input.userId)),
	);
	for (const run of runs) if (run.id) await requestRunCancellation(run.id, "ACCOUNT_DELETION_REQUESTED");
	return await withOwnerDatabase(input.userId, async (tx) => {
		const result = await tx.execute<{ complete: boolean }>(
			sql`SELECT master_cv_quiesce_deleted_account(${input.requestId}) AS complete`,
		);
		return result.rows[0]?.complete ? "complete" : "pending";
	});
}
const stagesSchema = deletionReplayRecordSchema.shape.stages;
const cleanupSchema = z.object({
	stages: stagesSchema,
	processors: z
		.array(
			z.object({
				processor: z.string(),
				subjectReference: z.string(),
				approved: z.boolean(),
				confirmed: z.boolean().optional(),
			}),
		)
		.default([]),
});
async function saveDeletionProgress(
	claim: WorkClaim,
	payload: z.infer<typeof cleanupSchema>,
	status: (typeof schema.accountDeletion.$inferSelect)["status"],
) {
	await withOwnerDatabase(claim.userId, async (tx) => {
		const [work] = await tx
			.select({ id: schema.privacyWork.id })
			.from(schema.privacyWork)
			.where(liveWorkLease(claim))
			.for("update");
		if (!work) throw new Error("PRIVACY_LEASE_LOST");
		await tx.update(schema.privacyWork).set({ payload }).where(liveWorkLease(claim));
		await tx
			.update(schema.accountDeletion)
			.set({ status })
			.where(
				and(eq(schema.accountDeletion.id, claim.requestId), eq(schema.accountDeletion.subjectUserId, claim.userId)),
			);
		await tx.execute(
			sql`SELECT master_cv_append_deletion_record(${claim.requestId},${JSON.stringify(payload.stages)}::jsonb)`,
		);
	});
}
export async function runDeletionWork(input: {
	workId: string;
	hooks: DeletionHooks;
	processors: ProcessorDeletionAdapter[];
	signal?: AbortSignal;
}): Promise<void> {
	const claim = await claimPrivacyWork({ workId: input.workId, kind: "delete_account" });
	if (!claim) return;
	try {
		const payload = cleanupSchema.parse(claim.payload);
		input.signal?.throwIfAborted();
		if (!payload.stages.workQuiesced) {
			if ((await quiesceAccountWork({ userId: claim.userId, requestId: claim.requestId })) !== "complete") {
				await saveDeletionProgress(claim, payload, "cancelling_work");
				await retryPrivacyWork(claim, "DELETION_WORK_PENDING");
				return;
			}
			payload.stages.workQuiesced = true;
			await saveDeletionProgress(claim, payload, "cancelling_work");
		}
		if (payload.stages.renewalsStopped === "pending") {
			payload.stages.renewalsStopped = await input.hooks.stopRenewals({
				requestId: claim.requestId,
				userId: claim.userId,
			});
			if (payload.stages.renewalsStopped === "pending") {
				await saveDeletionProgress(claim, payload, "blocked");
				await retryPrivacyWork(claim, "RENEWAL_STOP_PENDING");
				return;
			}
			await saveDeletionProgress(claim, payload, "removing_active_data");
		}
		if (!payload.stages.objectsRemoved) {
			const scope = `uploads/${claim.userId}/`;
			const storage = getStorageService();
			const objects = await storage.list(scope);
			for (const key of objects) {
				input.signal?.throwIfAborted();
				if (
					!key.startsWith(scope) ||
					key.includes("\\") ||
					key.split("/").some((part) => !part || part === "." || part === "..")
				)
					throw new Error("DELETION_FILE_SCOPE");
				await storage.delete(key);
			}
			if ((await storage.list(scope)).length) throw new Error("DELETION_OBJECTS_REMAIN");
			payload.stages.objectsRemoved = true;
			await saveDeletionProgress(claim, payload, "removing_active_data");
		}
		if (!payload.stages.databaseRemoved) {
			await withOwnerDatabase(claim.userId, async (tx) => {
				const [work] = await tx
					.select({ id: schema.privacyWork.id })
					.from(schema.privacyWork)
					.where(liveWorkLease(claim))
					.for("update");
				if (!work) throw new Error("PRIVACY_LEASE_LOST");
				await tx.execute(sql`SELECT master_cv_erase_deleted_account(${claim.requestId})`);
			});
			payload.stages.databaseRemoved = true;
			await saveDeletionProgress(claim, payload, "removing_active_data");
		}
		payload.stages.processors = await eraseRecordedProcessors({
			requestId: claim.requestId,
			recorded: payload.processors as RecordedProcessor[],
			adapters: input.processors,
		});
		if (payload.stages.processors === "pending") {
			await saveDeletionProgress(claim, payload, "awaiting_processor");
			await retryPrivacyWork(claim, "PROCESSOR_DELETION_PENDING");
			return;
		}
		await withOwnerDatabase(claim.userId, async (tx) => {
			const [work] = await tx
				.select({ id: schema.privacyWork.id })
				.from(schema.privacyWork)
				.where(liveWorkLease(claim))
				.for("update");
			if (!work) throw new Error("PRIVACY_LEASE_LOST");
			await tx
				.update(schema.accountDeletion)
				.set({ status: "complete", completedAt: new Date() })
				.where(
					and(eq(schema.accountDeletion.id, claim.requestId), eq(schema.accountDeletion.subjectUserId, claim.userId)),
				);
			await tx.execute(
				sql`SELECT master_cv_append_deletion_record(${claim.requestId},${JSON.stringify(payload.stages)}::jsonb)`,
			);
			await tx
				.update(schema.privacyWork)
				.set({ status: "queued" })
				.where(
					and(
						eq(schema.privacyWork.userId, claim.userId),
						eq(schema.privacyWork.key, `deletion-complete:${claim.requestId}`),
						eq(schema.privacyWork.status, "blocked"),
					),
				);
			if (!(await completePrivacyWork(claim, tx))) throw new Error("PRIVACY_LEASE_LOST");
		});
	} catch (error) {
		await retryPrivacyWork(claim, "DELETION_RETRY_REQUIRED");
		throw error;
	}
}
