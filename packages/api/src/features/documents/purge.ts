import type { TrashPolicy } from "../privacy/contracts";
import { createHash } from "node:crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { lockActiveAccount } from "@reactive-resume/db/account-state";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase, type OwnerTransaction } from "@reactive-resume/db/owner-scope";
import { privacyWork, resume, coverLetter } from "@reactive-resume/db/schema";
import { claimPrivacyWork, completePrivacyWork, retryPrivacyWork, liveWorkLease } from "../privacy/work";
import { deleteResumeRows } from "../resume/service";
import { getStorageService } from "../storage/service";
export async function requestDocumentPurge(input: { userId: string; type: "resume" | "letter"; id: string }) {
	const workId = await withOwnerDatabase(input.userId, async (tx) => {
		await lockActiveAccount(tx, input.userId);
		const table = input.type === "resume" ? resume : coverLetter;
		const [document] = await tx
			.select({ trashedAt: table.trashedAt })
			.from(table)
			.where(and(eq(table.userId, input.userId), eq(table.id, input.id)));
		if (!document?.trashedAt) throw new Error("DOCUMENT_NOT_TRASHED");
		const stamp = document.trashedAt.toISOString();
		const key = createHash("sha256").update(`${input.userId}:${input.type}:${input.id}:${stamp}`).digest("hex");
		await tx
			.insert(privacyWork)
			.values({
				userId: input.userId,
				kind: "purge_document",
				requestId: input.id,
				key: `manual-trash:${key}`,
				payload: {
					operation: "purge_document",
					type: input.type,
					id: input.id,
					trashedAt: stamp,
					retentionMs: 0,
					policyVersion: "explicit-owner-purge",
				},
			})
			.onConflictDoNothing();
		const [work] = await tx
			.select({ id: privacyWork.id })
			.from(privacyWork)
			.where(eq(privacyWork.key, `manual-trash:${key}`));
		if (!work) throw new Error("PURGE_WORK_UNAVAILABLE");
		return work.id;
	});
	await purgeTrashedDocument({ workId });
}
export async function scheduleTrashPurges(input: { policy: TrashPolicy; now: Date; limit: number }) {
	if (!input.policy.enabled) return 0;
	if (!input.policy.version || !Number.isFinite(input.policy.retentionMs) || input.policy.retentionMs <= 0)
		throw new Error("INVALID_TRASH_POLICY");
	const limit = Math.min(100, Math.max(1, input.limit));
	const cutoff = new Date(input.now.getTime() - input.policy.retentionMs);
	const owners = await db.execute<{ user_id: string }>(
		sql`SELECT * FROM master_cv_privacy_trash_owners(${cutoff.toISOString()}::timestamptz,${limit})`,
	);
	let scheduled = 0;
	for (const owner of owners.rows) {
		if (scheduled >= limit) break;
		scheduled += await withOwnerDatabase(owner.user_id, async (tx) => {
			await lockActiveAccount(tx, owner.user_id);
			let count = 0;
			for (const [type, table] of [
				["resume", resume],
				["letter", coverLetter],
			] as const) {
				const rows = await tx
					.select({ id: table.id, trashedAt: table.trashedAt })
					.from(table)
					.where(and(eq(table.userId, owner.user_id), lte(table.trashedAt, cutoff)))
					.limit(limit - scheduled - count);
				for (const row of rows) {
					if (!row.trashedAt) continue;
					const stamp = row.trashedAt.toISOString();
					const key = createHash("sha256")
						.update(`${owner.user_id}:${type}:${row.id}:${stamp}:${input.policy.version}`)
						.digest("hex");
					const created = await tx
						.insert(privacyWork)
						.values({
							userId: owner.user_id,
							kind: "purge_document",
							requestId: row.id,
							key: `trash:${key}`,
							payload: {
								operation: "purge_document",
								type,
								id: row.id,
								trashedAt: stamp,
								policyVersion: input.policy.version,
								retentionMs: input.policy.retentionMs,
							},
						})
						.onConflictDoNothing()
						.returning({ id: privacyWork.id });
					count += created.length;
				}
				if (count + scheduled >= limit) break;
			}
			return count;
		});
	}
	return scheduled;
}
export async function purgeTrashedDocument(input: { workId: string; signal?: AbortSignal }) {
	const claim = await claimPrivacyWork({ workId: input.workId, kind: "purge_document" });
	if (!claim) return;
	try {
		const payload = claim.payload;
		const compensation = payload?.operation === "remove_unregistered_file";
		if (compensation) {
			if (
				typeof payload.key !== "string" ||
				!payload.key.startsWith(`uploads/${claim.userId}/`) ||
				payload.key.includes("\\") ||
				payload.key.split("/").some((part) => !part || part === "." || part === "..")
			)
				throw new Error("PURGE_OWNER_DENIED");
			input.signal?.throwIfAborted();
			await getStorageService().delete(payload.key);
			if (!(await completePrivacyWork(claim))) throw new Error("PURGE_LEASE_LOST");
			return;
		}
		if (
			!payload ||
			!["resume", "letter"].includes(String(payload.type)) ||
			typeof payload.id !== "string" ||
			typeof payload.trashedAt !== "string" ||
			typeof payload.retentionMs !== "number" ||
			payload.retentionMs < 0 ||
			typeof payload.policyVersion !== "string"
		)
			throw new Error("PURGE_PAYLOAD_INVALID");
		const table = payload.type === "resume" ? resume : coverLetter;
		const matches = async (tx: OwnerTransaction) => {
			await lockActiveAccount(tx, claim.userId);
			const [work] = await tx
				.select({ id: privacyWork.id })
				.from(privacyWork)
				.where(liveWorkLease(claim))
				.for("update");
			if (!work) throw new Error("PURGE_LEASE_LOST");
			const [document] = await tx
				.select({ trashedAt: table.trashedAt })
				.from(table)
				.where(and(eq(table.userId, claim.userId), eq(table.id, payload.id as string)));
			if (
				!document?.trashedAt ||
				document.trashedAt.toISOString() !== payload.trashedAt ||
				document.trashedAt.getTime() + (payload.retentionMs as number) > Date.now()
			) {
				await tx
					.update(privacyWork)
					.set({ status: "cancelled", payload: null, completedAt: new Date(), leaseToken: null, leaseUntil: null })
					.where(liveWorkLease(claim));
				return false;
			}
			return true;
		};
		if (!(await withOwnerDatabase(claim.userId, matches))) return;
		// Generated caches can be safely recreated if a restore races with this I/O.
		// Saved attachment bytes and active document references are never removed here.
		if (payload.type === "resume")
			for (const category of ["screenshots", "pdfs"]) {
				input.signal?.throwIfAborted();
				await getStorageService().delete(`uploads/${claim.userId}/${category}/${payload.id}`);
			}
		await withOwnerDatabase(claim.userId, async (tx) => {
			if (!(await matches(tx))) return;
			if (payload.type === "resume") await deleteResumeRows(tx, { userId: claim.userId, id: payload.id as string });
			else
				await tx
					.delete(coverLetter)
					.where(and(eq(coverLetter.userId, claim.userId), eq(coverLetter.id, payload.id as string)));
			if (!(await completePrivacyWork(claim, tx))) throw new Error("PURGE_LEASE_LOST");
		});
	} catch (error) {
		await retryPrivacyWork(claim, "PURGE_RETRY_REQUIRED");
		throw error;
	}
}
