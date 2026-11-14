import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import type { OperationRequest, OperationView } from "@reactive-resume/schema/ai-operation";
import { ORPCError } from "@orpc/client";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { getPool } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import {
	aiOperation,
	aiOperationAttempt,
	aiProvider,
	agentMessage,
	agentThread,
	application,
	careerProfile,
	resume,
} from "@reactive-resume/db/schema";
import { operationRequestSchema } from "@reactive-resume/schema/ai-operation";
import { generateId } from "@reactive-resume/utils/string";
import { lockDocumentOwner } from "../documents/ownership";
import { createResumeInTransaction } from "../resume/service";
import { loadReviewSource, lockReviewProfile, removeExpiredReviewSources } from "./review-sources";
import { getOperationHandler, canonicalJson, operationFingerprint, resolveApprovedRoute } from "./route-policy";
import {
	admitResumeCreation,
	resolveResumeCreation,
	denyAllowance,
	releaseOperation,
	reserveOperation,
	settleOperation,
} from "./usage";

type Operation = typeof aiOperation.$inferSelect;
export type OperationLease = { ownerId: string; operationId: string; token: string };
const operationView = (o: Operation): OperationView => ({
	id: o.id,
	state: o.state,
	resultId: o.deliveredAt ? o.id : null,
	failureCode: o.failureCode,
});
export const operationRequest = (o: Operation): OperationRequest => ({
	requestKey: o.requestKey,
	kind: o.kind,
	sources: o.sources,
	route: o.route,
	consentVersion: o.consentVersion,
	parameters: o.parameters,
});

async function getOwned(tx: OwnerTransaction, userId: string, id: string): Promise<Operation> {
	const [operation] = await tx
		.select()
		.from(aiOperation)
		.where(and(eq(aiOperation.userId, userId), eq(aiOperation.id, id)))
		.for("update");
	if (!operation) throw new ORPCError("NOT_FOUND");
	return operation;
}

export async function assertSourceRevisions(
	tx: OwnerTransaction,
	userId: string,
	request: OperationRequest,
): Promise<void> {
	// Nested answer sources can reach a resume before a later career source.
	// Acquire the profile first regardless of request/source ordering.
	await lockReviewProfile(tx, userId);
	for (const source of [...request.sources].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))) {
		if (source.kind === "import" || source.kind === "answer") {
			await loadReviewSource(tx, userId, source);
			continue;
		}
		let revision: string | undefined;
		if (source.kind === "resume") {
			const [row] = await tx
				.select()
				.from(resume)
				.where(and(eq(resume.userId, userId), eq(resume.id, source.id)))
				.for("share");
			if (row && !row.trashedAt) revision = row.updatedAt.toISOString();
		} else if (source.kind === "career") {
			const [row] = await tx.select().from(careerProfile).where(eq(careerProfile.userId, userId)).for("share");
			if (row && source.id === userId) revision = String(row.profileRevision);
		} else {
			const [row] = await tx
				.select()
				.from(application)
				.where(and(eq(application.userId, userId), eq(application.id, source.id)))
				.for("share");
			if (row) revision = row.updatedAt.toISOString();
		}
		if (!revision) throw new ORPCError("NOT_FOUND", { data: { reason: "AI_SOURCE_UNAVAILABLE" } });
		if (revision !== source.revision) throw new ORPCError("CONFLICT", { data: { reason: "AI_SOURCE_CHANGED" } });
	}
}

async function finishUnsuccessful(
	tx: OwnerTransaction,
	operation: Operation,
	failureCode: string,
): Promise<OperationView> {
	const state =
		operation.state === "cancel_requested" || (operation.state === "queued" && failureCode === "AI_CANCELLED")
			? "cancelled"
			: "failed";
	const [updated] = await tx
		.update(aiOperation)
		.set({ state, failureCode, leaseToken: null, leaseUntil: null })
		.where(eq(aiOperation.id, operation.id))
		.returning();
	await releaseOperation(tx, operation.userId, operation.id);
	await tx.execute(sql`SELECT master_cv_ai_reconcile_budget(${operation.id})`);
	if (!updated) throw new ORPCError("NOT_FOUND");
	return operationView(updated);
}

async function bindThread(tx: OwnerTransaction, userId: string, operation: Operation, threadId?: string) {
	if (!threadId) return;
	const [thread] = await tx
		.select()
		.from(agentThread)
		.where(and(eq(agentThread.id, threadId), eq(agentThread.userId, userId)))
		.for("update");
	if (!thread || thread.status !== "active" || thread.deletedAt) throw new ORPCError("NOT_FOUND");
	if (thread.activeOperationId === operation.id) return;
	if (thread.activeOperationId) {
		const previous = await getOwned(tx, userId, thread.activeOperationId);
		if (["queued", "running", "cancel_requested"].includes(previous.state)) denyAllowance("AI_CONCURRENCY_LIMIT");
	}
	const [provider] = thread.aiProviderId
		? await tx
				.select()
				.from(aiProvider)
				.where(and(eq(aiProvider.userId, userId), eq(aiProvider.id, thread.aiProviderId)))
				.for("share")
		: [];
	if (
		!provider ||
		!provider.enabled ||
		provider.testStatus !== "success" ||
		provider.configRevision !== operation.route.configRevision
	)
		denyAllowance("AI_PROVIDER_CHANGED");
	if (
		thread.workingResumeId &&
		!operation.sources.some((source) => source.kind === "resume" && source.id === thread.workingResumeId)
	)
		throw new ORPCError("BAD_REQUEST");
	await tx
		.update(agentThread)
		.set({ activeOperationId: operation.id, routeBinding: operation.route })
		.where(eq(agentThread.id, threadId));
}

async function startOperation(
	tx: OwnerTransaction,
	userId: string,
	rawRequest: OperationRequest,
	threadId?: string,
): Promise<OperationView> {
	await lockDocumentOwner(tx, userId);
	const [existing] = await tx
		.select()
		.from(aiOperation)
		.where(and(eq(aiOperation.userId, userId), eq(aiOperation.requestKey, rawRequest.requestKey)))
		.for("update");
	if (existing) {
		if (operationFingerprint(rawRequest, existing) !== existing.fingerprint) throw new ORPCError("CONFLICT");
		await bindThread(tx, userId, existing, threadId);
		return operationView(existing);
	}
	const handler = getOperationHandler(rawRequest.kind);
	// Bind replay to the original request, independent of defaults/transforms or later deployments.
	const fingerprint = operationFingerprint(rawRequest, handler);
	const request = { ...rawRequest, parameters: handler.parameters.parse(rawRequest.parameters) };
	const route = await resolveApprovedRoute(userId, request);
	await assertSourceRevisions(tx, userId, request);
	const active = await tx
		.select({ id: aiOperation.id })
		.from(aiOperation)
		.where(and(eq(aiOperation.userId, userId), inArray(aiOperation.state, ["queued", "running", "cancel_requested"])));
	if (active.length) denyAllowance("AI_CONCURRENCY_LIMIT");
	const proposedCopy = handler.copyClaim?.(request);
	const copyClaim = proposedCopy ? await resolveResumeCreation(tx, userId, proposedCopy) : undefined;
	if (copyClaim) {
		if (copyClaim.variantKind === "base" || !handler.createCopy) throw new ORPCError("BAD_REQUEST");
		await admitResumeCreation(tx, userId, copyClaim);
	}
	const createdAt = new Date();
	const [created] = await tx
		.insert(aiOperation)
		.values({
			userId,
			...request,
			fingerprint,
			promptVersion: handler.promptVersion,
			schemaVersion: handler.schemaVersion,
			createdAt,
			deadlineAt: new Date(createdAt.getTime() + route.deadlineMs),
			...(copyClaim ? { copyClaim } : {}),
		})
		.returning();
	if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");
	await reserveOperation(tx, userId, created.id);
	const admitted = await tx.execute<{ admitted: boolean }>(
		sql`SELECT master_cv_ai_admit_budget(${created.id}, ${route.requestCapMicros}::bigint, ${route.dayCapMicros}::bigint) AS admitted`,
	);
	if (!admitted.rows[0]?.admitted) denyAllowance("AI_BUDGET_LIMIT");
	await bindThread(tx, userId, created, threadId);
	return operationView(created);
}

class PreflightResult extends Error {}
export const operationService = {
	async preflight(userId: string, value: OperationRequest) {
		const request = operationRequestSchema.parse(value);
		const handler = getOperationHandler(request.kind);
		const requestFingerprint = operationFingerprint(request, handler);
		try {
			// Run the exact admission path in a rolled-back transaction: no shadow quota policy.
			await withOwnerDatabase(userId, async (tx) => {
				await startOperation(tx, userId, request);
				throw new PreflightResult();
			});
		} catch (error) {
			if (error instanceof PreflightResult)
				return { operationCost: 1 as const, available: true, reason: null, requestFingerprint };
			if (
				error instanceof ORPCError &&
				["PRECONDITION_FAILED", "CONFLICT", "NOT_FOUND", "BAD_REQUEST"].includes(error.code)
			) {
				const data = error.data as { reason?: string } | undefined;
				if (!data?.reason && error.code === "CONFLICT") throw error;
				return {
					operationCost: 1 as const,
					available: false,
					reason:
						data?.reason ??
						(error.code === "NOT_FOUND"
							? "AI_SOURCE_UNAVAILABLE"
							: error.code === "BAD_REQUEST"
								? "AI_INVALID_REQUEST"
								: "AI_UNAVAILABLE"),
					requestFingerprint,
				};
			}
			throw error;
		}
		throw new Error("AI_PREFLIGHT_UNEXPECTED_COMMIT");
	},
	start(userId: string, value: OperationRequest, options?: { threadId: string }): Promise<OperationView> {
		return withOwnerDatabase(userId, (tx) =>
			startOperation(tx, userId, operationRequestSchema.parse(value), options?.threadId),
		);
	},
	get: (userId: string, id: string) =>
		withOwnerDatabase(userId, async (tx) => operationView(await getOwned(tx, userId, id))),
	getResult: (userId: string, id: string) =>
		withOwnerDatabase(userId, async (tx) => {
			const operation = await getOwned(tx, userId, id);
			if (!operation.deliveredAt || !operation.result) throw new ORPCError("PRECONDITION_FAILED");
			return operation.result;
		}),
	cancel: (userId: string, id: string) =>
		withOwnerDatabase(userId, async (tx) => {
			await lockDocumentOwner(tx, userId);
			const operation = await getOwned(tx, userId, id);
			if (operation.state === "queued") return finishUnsuccessful(tx, operation, "AI_CANCELLED");
			if (operation.state !== "running") return operationView(operation);
			const [updated] = await tx
				.update(aiOperation)
				.set({ state: "cancel_requested" })
				.where(eq(aiOperation.id, id))
				.returning();
			if (!updated) throw new ORPCError("NOT_FOUND");
			return operationView(updated);
		}),
};

export function claimNextOperation(ownerId: string): Promise<OperationLease | null> {
	return withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const [operation] = await tx
			.select()
			.from(aiOperation)
			.where(
				and(
					eq(aiOperation.userId, ownerId),
					lte(aiOperation.dueAt, new Date()),
					or(
						eq(aiOperation.state, "queued"),
						and(inArray(aiOperation.state, ["running", "cancel_requested"]), lte(aiOperation.leaseUntil, new Date())),
					),
				),
			)
			.orderBy(asc(aiOperation.dueAt), asc(aiOperation.id))
			.limit(1)
			.for("update", { skipLocked: true });
		if (!operation) return null;
		if (
			operation.state === "cancel_requested" ||
			(operation.state !== "queued" && operation.deadlineAt.getTime() <= Date.now())
		) {
			await finishUnsuccessful(tx, operation, operation.state === "cancel_requested" ? "AI_CANCELLED" : "AI_DEADLINE");
			return null;
		}
		const attempts = await tx.select().from(aiOperationAttempt).where(eq(aiOperationAttempt.operationId, operation.id));
		if (attempts.some((a) => !a.finishedAt || a.outcome === "unknown")) {
			await finishUnsuccessful(tx, operation, "AI_OUTCOME_UNKNOWN");
			return null;
		}
		const token = generateId();
		await tx
			.update(aiOperation)
			.set({ state: "running", leaseToken: token, leaseUntil: new Date(Date.now() + 60000) })
			.where(eq(aiOperation.id, operation.id));
		return { ownerId, operationId: operation.id, token };
	});
}

export function withOperationLease<T>(
	lease: OperationLease,
	work: (tx: OwnerTransaction, operation: Operation) => Promise<T>,
): Promise<T> {
	return withOwnerDatabase(lease.ownerId, async (tx) => {
		await lockDocumentOwner(tx, lease.ownerId);
		const operation = await getOwned(tx, lease.ownerId, lease.operationId);
		if (
			operation.leaseToken !== lease.token ||
			!operation.leaseUntil ||
			operation.leaseUntil.getTime() <= Date.now() ||
			!["running", "cancel_requested"].includes(operation.state)
		)
			throw new ORPCError("CONFLICT", { data: { reason: "AI_LEASE_LOST" } });
		return work(tx, operation);
	});
}

export async function heartbeatOperation(lease: OperationLease): Promise<void> {
	await withOperationLease(lease, async (tx, operation) => {
		if (operation.state === "cancel_requested") throw new Error("AI_CANCELLED");
		if (Date.now() >= operation.deadlineAt.getTime()) throw new Error("AI_DEADLINE");
		await tx
			.update(aiOperation)
			.set({ leaseUntil: new Date(Date.now() + 60000) })
			.where(eq(aiOperation.id, lease.operationId));
	});
}

export async function failOperation(lease: OperationLease, code: string): Promise<void> {
	await withOperationLease(lease, async (tx, operation) => {
		await finishUnsuccessful(tx, operation, code);
	});
}

/** Only a registered handler's validated output may reach this fenced delivery boundary. */
export function deliverOperation(lease: OperationLease, output: Record<string, unknown>): Promise<OperationView> {
	return withOperationLease(lease, async (tx, operation) => {
		if (operation.state === "cancel_requested") return finishUnsuccessful(tx, operation, "AI_CANCELLED");
		if (operation.deadlineAt.getTime() <= Date.now()) return finishUnsuccessful(tx, operation, "AI_DEADLINE");
		await resolveApprovedRoute(lease.ownerId, operationRequest(operation));
		await assertSourceRevisions(tx, lease.ownerId, operationRequest(operation));
		const handler = getOperationHandler(operation.kind);
		if (handler.promptVersion !== operation.promptVersion || handler.schemaVersion !== operation.schemaVersion)
			throw new Error("AI_HANDLER_CHANGED");
		if (handler.verifier) {
			const attempts = await tx
				.select()
				.from(aiOperationAttempt)
				.where(eq(aiOperationAttempt.operationId, operation.id));
			const generated = attempts.find(
				(a) => a.stepId !== "verify" && a.outcome === "valid" && a.finishedAt && a.output,
			);
			const verified = attempts.find((a) => a.stepId === "verify" && a.outcome === "valid" && a.finishedAt && a.output);
			try {
				if (
					!generated?.output ||
					!verified?.output ||
					verified.ordinal <= generated.ordinal ||
					canonicalJson(generated.output) !== canonicalJson(output)
				)
					throw new Error("AI_VERIFICATION_REQUIRED");
				handler.verifier.validate(output, verified.output);
			} catch {
				return finishUnsuccessful(tx, operation, "AI_VERIFICATION_FAILED");
			}
		}
		let result = handler.output.parse(output);
		if (handler.validateResult) {
			try {
				result = await handler.validateResult(tx, lease.ownerId, operationRequest(operation), result);
			} catch {
				return finishUnsuccessful(tx, operation, "AI_REVIEW_INVALID");
			}
		}
		if (operation.copyClaim) {
			if (!handler.createCopy) throw new Error("AI_COPY_HANDLER_UNAVAILABLE");
			const id = await createResumeInTransaction(
				tx,
				{ ...handler.createCopy(result), userId: lease.ownerId, tags: [], creation: operation.copyClaim },
				{ reservationOperationId: operation.id },
			);
			result = { ...result, createdResumeId: id };
		}
		const [updated] = await tx
			.update(aiOperation)
			.set({
				state:
					operation.kind.startsWith("review.") &&
					Array.isArray(result.questions) &&
					result.questions.length === 0 &&
					(Array.isArray(result.proposals)
						? result.proposals.length === 0
						: Array.isArray(result.candidates) && result.candidates.length === 0)
						? "succeeded"
						: handler.resultState,
				result,
				deliveredAt: new Date(),
				leaseToken: null,
				leaseUntil: null,
			})
			.where(eq(aiOperation.id, operation.id))
			.returning();
		await settleOperation(tx, lease.ownerId, operation.id);
		const threads = await tx
			.select()
			.from(agentThread)
			.where(eq(agentThread.activeOperationId, operation.id))
			.for("update");
		for (const thread of threads) {
			const [last] = await tx
				.select({ sequence: agentMessage.sequence })
				.from(agentMessage)
				.where(eq(agentMessage.threadId, thread.id))
				.orderBy(sql`${agentMessage.sequence} DESC`)
				.limit(1);
			const text = typeof result.text === "string" ? result.text : JSON.stringify(result);
			await tx.insert(agentMessage).values({
				userId: lease.ownerId,
				threadId: thread.id,
				role: "assistant",
				sequence: (last?.sequence ?? 0) + 1,
				uiMessage: {
					id: operation.id,
					role: "assistant",
					parts: operation.kind.startsWith("review.")
						? [{ type: "data-review", data: { operationId: operation.id } }]
						: [{ type: "text", text }],
				},
			});
			await tx.update(agentThread).set({ lastMessageAt: new Date() }).where(eq(agentThread.id, thread.id));
		}
		await tx.execute(sql`SELECT master_cv_ai_reconcile_budget(${operation.id})`);
		if (!updated) throw new ORPCError("NOT_FOUND");
		return operationView(updated);
	});
}

export async function discoverAiOwners(): Promise<string[]> {
	const result = await getPool().query<{ user_id: string }>("SELECT user_id FROM master_cv_ai_queue_owners()");
	return result.rows.map((r) => r.user_id);
}

/** Owner discovery is bounded; unknown liability moves to conservative spend five minutes after deadline. */
export async function reconcileExpiredAccounting(ownerId: string): Promise<void> {
	await removeExpiredReviewSources(ownerId);
	await withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const operations = await tx
			.select({ id: aiOperation.id })
			.from(aiOperation)
			.where(
				and(
					eq(aiOperation.userId, ownerId),
					eq(aiOperation.budgetClosed, true),
					sql`${aiOperation.reservedMicros}>0`,
					sql`${aiOperation.deadlineAt} + interval '5 minutes' <= now()`,
				),
			)
			.limit(100);
		for (const operation of operations) await tx.execute(sql`SELECT master_cv_ai_reconcile_budget(${operation.id})`);
	});
}
