import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import type { ResumeCreationKind, StartUsageView } from "@reactive-resume/schema/ai-usage";
import { ORPCError } from "@orpc/client";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiOperation, aiUsageLedger, resume } from "@reactive-resume/db/schema";
import { lockDocumentOwner } from "../documents/ownership";
import { getAiRuntime } from "./route-policy";

export function denyAllowance(reason: string): never {
	throw new ORPCError("PRECONDITION_FAILED", { message: "The requested allowance is unavailable.", data: { reason } });
}

async function readUsage(tx: OwnerTransaction, ownerId: string): Promise<StartUsageView> {
	const ledger = await tx
		.select({ kind: aiUsageLedger.kind })
		.from(aiUsageLedger)
		.where(eq(aiUsageLedger.userId, ownerId));
	const used = ledger.filter((e) => e.kind === "settle").length;
	const reserved =
		ledger.filter((e) => e.kind === "reserve").length - ledger.filter((e) => e.kind !== "reserve").length;
	const [bases] = await tx
		.select({ used: sql<number>`count(*)::int` })
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.variantKind, "base")));
	const allowance = process.env.NODE_ENV !== "production" ? getAiRuntime().localOwnerAllowance : undefined;
	const limit = allowance?.ownerId === ownerId ? allowance.limit : 5;
	return {
		plan: "start",
		operations: { limit, used, reserved, remaining: Math.max(0, limit - used - reserved) },
		baseCvs: { limit: 1, used: bases?.used ?? 0 },
	};
}

export const usageService = {
	getStartUsage: (userId: string): Promise<StartUsageView> => withOwnerDatabase(userId, (tx) => readUsage(tx, userId)),
};

/** The owner lock must precede operation/document locks throughout admission and settlement. */
export async function reserveOperation(tx: OwnerTransaction, ownerId: string, operationId: string): Promise<void> {
	await lockDocumentOwner(tx, ownerId);
	const existing = await tx
		.select()
		.from(aiUsageLedger)
		.where(and(eq(aiUsageLedger.userId, ownerId), eq(aiUsageLedger.operationId, operationId)));
	if (existing.length) return;
	if ((await readUsage(tx, ownerId)).operations.remaining <= 0) denyAllowance("AI_OPERATIONS_LIMIT");
	await tx.insert(aiUsageLedger).values({ userId: ownerId, operationId, kind: "reserve" });
}

async function finishReservation(
	tx: OwnerTransaction,
	ownerId: string,
	operationId: string,
	kind: "settle" | "release",
): Promise<void> {
	await lockDocumentOwner(tx, ownerId);
	const entries = await tx
		.select()
		.from(aiUsageLedger)
		.where(and(eq(aiUsageLedger.userId, ownerId), eq(aiUsageLedger.operationId, operationId)));
	if (!entries.some((e) => e.kind === "reserve") || entries.some((e) => e.kind !== "reserve")) return;
	await tx.insert(aiUsageLedger).values({ userId: ownerId, operationId, kind });
}
export const settleOperation = (tx: OwnerTransaction, ownerId: string, operationId: string) =>
	finishReservation(tx, ownerId, operationId, "settle");
export const releaseOperation = (tx: OwnerTransaction, ownerId: string, operationId: string) =>
	finishReservation(tx, ownerId, operationId, "release");

/** Resolve copies of copies to their owned root without introducing nested lineage. */
export async function resolveResumeCreation(
	tx: OwnerTransaction,
	ownerId: string,
	creation: ResumeCreationKind,
): Promise<ResumeCreationKind> {
	if (creation.variantKind === "base") return creation;
	const [source] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, creation.baseResumeId)));
	if (!source) throw new ORPCError("NOT_FOUND");
	const rootId = source.baseResumeId ?? source.id;
	const [root] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, rootId), eq(resume.variantKind, "base")));
	if (!root) throw new ORPCError("NOT_FOUND");
	return { variantKind: creation.variantKind, baseResumeId: root.id };
}

export async function admitResumeCreation(
	tx: OwnerTransaction,
	ownerId: string,
	creation: ResumeCreationKind,
	reservationOperationId?: string,
): Promise<void> {
	await lockDocumentOwner(tx, ownerId);
	const { baseCvs } = await readUsage(tx, ownerId);
	if (baseCvs.used > baseCvs.limit) denyAllowance("BASE_CV_LIMIT");
	if (creation.variantKind === "base") {
		if (baseCvs.used >= baseCvs.limit) denyAllowance("BASE_CV_LIMIT");
		return;
	}
	const normalized = await resolveResumeCreation(tx, ownerId, creation);
	if (normalized.variantKind === "base") throw new ORPCError("BAD_REQUEST");
	const copies = await tx
		.select({ id: resume.id })
		.from(resume)
		.where(
			and(
				eq(resume.userId, ownerId),
				eq(resume.baseResumeId, normalized.baseResumeId),
				eq(resume.variantKind, normalized.variantKind),
			),
		);
	const pending = await tx
		.select({ id: aiOperation.id })
		.from(aiOperation)
		.where(
			and(
				eq(aiOperation.userId, ownerId),
				inArray(aiOperation.state, ["queued", "running", "cancel_requested"]),
				sql`${aiOperation.copyClaim}->>'baseResumeId' = ${normalized.baseResumeId}`,
				sql`${aiOperation.copyClaim}->>'variantKind' = ${normalized.variantKind}`,
				reservationOperationId ? ne(aiOperation.id, reservationOperationId) : undefined,
			),
		);
	if (copies.length + pending.length >= 1)
		denyAllowance(normalized.variantKind === "language" ? "LANGUAGE_COPY_LIMIT" : "JOB_COPY_LIMIT");
}
