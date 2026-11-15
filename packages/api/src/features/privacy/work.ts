import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase, type OwnerTransaction } from "@reactive-resume/db/owner-scope";
import { privacyWork } from "@reactive-resume/db/schema";
export type WorkClaim = typeof privacyWork.$inferSelect & { userId: string; leaseToken: string };
/** Claims are persisted before egress; all publication is conditional on the live lease. */
export async function claimPrivacyWork(input: { workId: string; kind: string }): Promise<WorkClaim | null> {
	const owner = await db.execute<{ user_id: string }>(
		sql`SELECT master_cv_privacy_work_owner(${input.workId}) AS user_id`,
	);
	const userId = owner.rows[0]?.user_id;
	if (!userId) return null;
	return await withOwnerDatabase(userId, async (tx) => {
		const [row] = await tx
			.update(privacyWork)
			.set({
				status: "running",
				leaseToken: randomUUID(),
				leaseUntil: sql`now()+interval '2 minutes'`,
				attempts: sql`${privacyWork.attempts}+1`,
			})
			.where(
				and(
					eq(privacyWork.id, input.workId),
					eq(privacyWork.kind, input.kind),
					eq(privacyWork.userId, userId),
					sql`((${privacyWork.status} IN ('queued','retry') AND ${privacyWork.dueAt}<=now()) OR (${privacyWork.status}='running' AND ${privacyWork.leaseUntil}<now()))`,
				),
			)
			.returning();
		return (row as WorkClaim | undefined) ?? null;
	});
}
export function liveWorkLease(claim: WorkClaim) {
	return and(
		eq(privacyWork.id, claim.id),
		eq(privacyWork.userId, claim.userId),
		eq(privacyWork.status, "running"),
		eq(privacyWork.leaseToken, claim.leaseToken),
		sql`${privacyWork.leaseUntil}>now()`,
	);
}
export async function completePrivacyWork(claim: WorkClaim, tx?: OwnerTransaction) {
	const complete = async (connection: OwnerTransaction) => {
		const rows = await connection
			.update(privacyWork)
			.set({
				status: "complete",
				completedAt: new Date(),
				payload: null,
				leaseToken: null,
				leaseUntil: null,
				failureCode: null,
			})
			.where(liveWorkLease(claim))
			.returning({ id: privacyWork.id });
		return rows.length === 1;
	};
	return tx ? await complete(tx) : await withOwnerDatabase(claim.userId, complete);
}
export async function retryPrivacyWork(claim: WorkClaim, failureCode: string) {
	if (!/^[A-Z_]{1,80}$/.test(failureCode)) throw new Error("UNSAFE_FAILURE_CODE");
	return await withOwnerDatabase(claim.userId, async (tx) => {
		const rows = await tx
			.update(privacyWork)
			.set({ status: "retry", leaseToken: null, leaseUntil: null, failureCode, dueAt: sql`now()+interval '1 minute'` })
			.where(liveWorkLease(claim))
			.returning({ id: privacyWork.id });
		return rows.length === 1;
	});
}

/** Bounded callable worker; PostgreSQL owns scheduling and restart recovery. */
export async function runPrivacyWork(
	input: {
		signal?: AbortSignal;
		limit?: number;
		trashPolicy?: import("./contracts").TrashPolicy;
		hooks?: import("./contracts").DeletionHooks;
		processors?: import("./contracts").ProcessorDeletionAdapter[];
	} = {},
) {
	const limit = Math.min(100, Math.max(1, input.limit ?? 10));
	const { scheduleTrashPurges, purgeTrashedDocument } = await import("../documents/purge");
	if (input.trashPolicy) await scheduleTrashPurges({ policy: input.trashPolicy, now: new Date(), limit });
	const owners = await db.execute<{ user_id: string }>(sql`SELECT * FROM master_cv_privacy_queue_owners()`);
	let handled = 0;
	for (const owner of owners.rows) {
		if (handled >= limit || input.signal?.aborted) return;
		const work = await withOwnerDatabase(owner.user_id, (tx) =>
			tx
				.select()
				.from(privacyWork)
				.where(
					and(
						eq(privacyWork.userId, owner.user_id),
						sql`${privacyWork.dueAt}<=now()`,
						sql`(${privacyWork.status} IN ('queued','retry') OR (${privacyWork.status}='running' AND ${privacyWork.leaseUntil}<now()))`,
					),
				)
				.orderBy(privacyWork.dueAt, privacyWork.id)
				.limit(limit - handled),
		);
		for (const row of work) {
			if (input.signal?.aborted) return;
			handled++;
			try {
				const delivery = await import("./delivery");
				if (row.kind === "export_account")
					await delivery.runExportWork({ workId: row.id, ...(input.signal ? { signal: input.signal } : {}) });
				else if (row.kind === "delete_account")
					await (
						await import("./deletion")
					).runDeletionWork({
						workId: row.id,
						hooks: input.hooks ?? { stopRenewals: () => Promise.resolve("not_applicable") },
						processors: input.processors ?? [],
						...(input.signal ? { signal: input.signal } : {}),
					});
				else if (row.kind === "send_notice") await delivery.runNoticeWork({ workId: row.id });
				else if (row.kind === "send_support") await (await import("./support")).runSupportWork({ workId: row.id });
				else if (row.kind === "purge_document") {
					if (row.payload?.operation === "expire_account_export")
						await delivery.runExportExpiryWork({ workId: row.id });
					else await purgeTrashedDocument({ workId: row.id, ...(input.signal ? { signal: input.signal } : {}) });
				}
			} catch {
				console.error({ event: "privacy_work_failed", kind: row.kind });
			}
		}
	}
}
