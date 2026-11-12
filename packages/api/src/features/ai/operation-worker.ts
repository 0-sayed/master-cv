import { and, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiOperation, aiOperationAttempt } from "@reactive-resume/db/schema";
import { lockDocumentOwner } from "../documents/ownership";
import { executeApprovedStep } from "./adapter";
import {
	assertSourceRevisions,
	claimNextOperation,
	deliverOperation,
	discoverAiOwners,
	failOperation,
	heartbeatOperation,
	reconcileExpiredAccounting,
	operationRequest,
	withOperationLease,
	type OperationLease,
} from "./operations";
import { buildModelPayload } from "./payload";
import { getOperationHandler, resolveApprovedRoute } from "./route-policy";

async function prepareInput<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
	signal.throwIfAborted();
	let abort: () => void = () => undefined;
	try {
		return await new Promise<T>((resolve, reject) => {
			abort = () => reject(signal.reason);
			signal.addEventListener("abort", abort, { once: true });
			work().then(resolve, reject);
		});
	} finally {
		signal.removeEventListener("abort", abort);
	}
}

async function executeLease(lease: OperationLease, shutdown?: AbortSignal): Promise<void> {
	const controller = new AbortController();
	let heartbeat = Promise.resolve();
	let deadlineAt: number | undefined;
	let preparingInput = false;
	const timer = setInterval(() => {
		heartbeat = heartbeat
			.then(() => heartbeatOperation(lease))
			.catch(() => {
				controller.abort();
			});
	}, 15000);
	try {
		const operation = await withOperationLease(lease, (_tx, row) => Promise.resolve(row));
		deadlineAt = operation.deadlineAt.getTime();
		const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()))]);
		const request = operationRequest(operation);
		const handler = getOperationHandler(operation.kind);
		if (handler.promptVersion !== operation.promptVersion || handler.schemaVersion !== operation.schemaVersion)
			throw new Error("AI_HANDLER_CHANGED");
		const previous = await withOwnerDatabase(lease.ownerId, (tx) =>
			tx
				.select()
				.from(aiOperationAttempt)
				.where(eq(aiOperationAttempt.operationId, lease.operationId))
				.orderBy(asc(aiOperationAttempt.ordinal)),
		);
		const recoveryRoute = await resolveApprovedRoute(lease.ownerId, request);
		let consumedMicros = previous.reduce(
			(sum, attempt) => sum + (attempt.costMicros ?? recoveryRoute.maxCallCostMicros),
			0,
		);
		if (
			recoveryRoute.requestCapMicros !== operation.reservedMicros ||
			consumedMicros > operation.reservedMicros ||
			previous.some((attempt) => attempt.costMicros !== null && attempt.costMicros > recoveryRoute.maxCallCostMicros)
		) {
			await failOperation(lease, "AI_REQUEST_COST_LIMIT");
			return;
		}
		const completed = previous.find((a) => a.outcome === "valid" && a.finishedAt && a.output);
		if (completed?.output) {
			await deliverOperation(lease, completed.output);
			return;
		}
		const last = previous.at(-1);
		if (last && !["invalid", "transient"].includes(last.outcome ?? "")) {
			await failOperation(lease, "AI_RECOVERED_TERMINAL");
			return;
		}
		let repairs = previous.filter((a) => a.stepId === "repair").length;
		let nextStep = previous.at(-1)?.outcome === "invalid" ? "repair" : "generate";
		if (previous.at(-1)?.stepId === "repair") {
			await failOperation(lease, "AI_REPAIR_LIMIT");
			return;
		}
		for (let ordinal = previous.length + 1; ordinal <= 3; ordinal++) {
			const route = await resolveApprovedRoute(lease.ownerId, request);
			if (Date.now() >= operation.deadlineAt.getTime()) throw new Error("AI_DEADLINE");
			if (ordinal > route.maxCalls) break;
			if (
				route.requestCapMicros !== operation.reservedMicros ||
				consumedMicros + route.maxCallCostMicros > operation.reservedMicros
			) {
				await failOperation(lease, "AI_REQUEST_COST_LIMIT");
				return;
			}
			preparingInput = true;
			const inputSignal = shutdown ? AbortSignal.any([signal, shutdown]) : signal;
			const payload = buildModelPayload(
				await prepareInput(inputSignal, () => handler.buildInput(lease.ownerId, request, inputSignal)),
			);
			preparingInput = false;
			if (shutdown?.aborted) return;
			if (Date.now() >= operation.deadlineAt.getTime()) {
				await failOperation(lease, "AI_DEADLINE");
				return;
			}
			// Preparing input can await storage while consent is revoked in another request.
			await resolveApprovedRoute(lease.ownerId, request);
			const stepId = nextStep;
			if (stepId === "repair") {
				if (repairs >= route.maxRepairs) break;
				repairs++;
			}
			const attempt = await withOperationLease(lease, async (tx, current) => {
				if (current.state === "cancel_requested") throw new Error("AI_CANCELLED");
				if (Date.now() >= current.deadlineAt.getTime()) throw new Error("AI_DEADLINE");
				await assertSourceRevisions(tx, lease.ownerId, request);
				const [row] = await tx
					.insert(aiOperationAttempt)
					.values({ userId: lease.ownerId, operationId: lease.operationId, ordinal, stepId, leaseToken: lease.token })
					.returning();
				if (!row) throw new Error("AI_ATTEMPT_UNAVAILABLE");
				return row;
			});
			const outcome = await executeApprovedStep({
				route,
				operationId: lease.operationId,
				attemptId: attempt.id,
				stepId,
				payload,
				outputSchema: handler.output,
				signal,
			});
			// Late accounting may finish after cancellation/lease loss, but may never publish a result.
			await withOwnerDatabase(lease.ownerId, async (tx) => {
				await lockDocumentOwner(tx, lease.ownerId);
				await tx
					.update(aiOperationAttempt)
					.set({ ...outcome, finishedAt: new Date() })
					.where(and(eq(aiOperationAttempt.id, attempt.id), eq(aiOperationAttempt.leaseToken, lease.token)));
				const [current] = await tx
					.select()
					.from(aiOperation)
					.where(eq(aiOperation.id, lease.operationId))
					.for("update");
				if (current?.budgetClosed && current.actualMicros === null) {
					await tx.execute(sql`SELECT master_cv_ai_reconcile_budget(${lease.operationId})`);
				}
			});
			consumedMicros += outcome.costMicros ?? route.maxCallCostMicros;
			if (
				(outcome.costMicros !== null && outcome.costMicros > route.maxCallCostMicros) ||
				consumedMicros > operation.reservedMicros
			) {
				await failOperation(lease, "AI_REQUEST_COST_LIMIT");
				return;
			}
			if (outcome.outcome === "valid" && outcome.output) {
				await deliverOperation(lease, outcome.output);
				return;
			}
			if (outcome.outcome === "invalid" && repairs < route.maxRepairs) {
				nextStep = "repair";
				continue;
			}
			if (outcome.outcome === "transient" && stepId !== "repair" && ordinal < route.maxCalls) {
				await new Promise<void>((resolve) =>
					setTimeout(resolve, Math.min(1000, 250 * 2 ** (ordinal - 1)) + Math.floor(Math.random() * 100)),
				);
				continue;
			}
			await failOperation(lease, `AI_${outcome.outcome.toUpperCase()}`);
			return;
		}
		await failOperation(lease, "AI_CALL_LIMIT");
	} catch {
		// Shutdown interrupts preparation before egress; the expired lease can safely be reclaimed.
		if (preparingInput && shutdown?.aborted && deadlineAt !== undefined && Date.now() < deadlineAt) return;
		// Public/diagnostic outcomes are bounded codes; never attach SDK exceptions or content.
		await failOperation(
			lease,
			deadlineAt !== undefined && Date.now() >= deadlineAt ? "AI_DEADLINE" : "AI_EXECUTION_FAILED",
		).catch(() => {
			/* A recovered/cancelled worker owns the final state. */
		});
	} finally {
		clearInterval(timer);
		await heartbeat;
	}
}

export async function runAiOperations(signal?: AbortSignal): Promise<void> {
	for (const ownerId of await discoverAiOwners()) {
		if (signal?.aborted) return;
		await reconcileExpiredAccounting(ownerId);
		const lease = await claimNextOperation(ownerId);
		if (lease) await executeLease(lease, signal);
	}
}
