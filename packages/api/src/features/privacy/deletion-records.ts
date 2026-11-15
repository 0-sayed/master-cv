import { sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import { deletionReplayRecordSchema, type DeletionReplayRecordV1 } from "./contracts";
/** Callable only using a separately provisioned recovery connection. No public route. */
export async function readDeletionRecords(input: {
	afterSequence: number;
	limit: number;
}): Promise<DeletionReplayRecordV1[]> {
	if (
		!Number.isSafeInteger(input.afterSequence) ||
		input.afterSequence < 0 ||
		!Number.isInteger(input.limit) ||
		input.limit < 1 ||
		input.limit > 1000
	)
		throw new Error("INVALID_REPLAY_CURSOR");
	const result = await db.execute<Record<string, unknown>>(
		sql`SELECT * FROM master_cv_read_deletion_records(${input.afterSequence},${input.limit})`,
	);
	return result.rows.map((row) =>
		deletionReplayRecordSchema.parse({
			version: row.version,
			sequence: Number(row.sequence),
			requestId: row.request_id,
			subjectUserIds: row.subject_user_ids,
			storageScopes: row.storage_scopes,
			requestedAt: new Date(row.requested_at as string).toISOString(),
			activeDataCompletedAt: row.active_data_completed_at
				? new Date(row.active_data_completed_at as string).toISOString()
				: null,
			completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
			stages: {
				admissionClosed: row.admission_closed,
				workQuiesced: row.work_quiesced,
				renewalsStopped: row.renewals_stopped,
				objectsRemoved: row.objects_removed,
				databaseRemoved: row.database_removed,
				processors: row.processors,
			},
			exceptions: row.exceptions,
			policyVersion: row.policy_version,
		}),
	);
}
