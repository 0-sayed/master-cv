import { z } from "zod";
const privacyActionSchema = z.enum(["export_account", "delete_account"]);
export const accountActionSchema = z.enum([...privacyActionSchema.options, "change_email"]);
export const freshProofSchema = z.object({
	token: z.string().min(32),
	action: accountActionSchema,
	expiresAt: z.iso.datetime(),
});
export const exportRequestSchema = z.object({
	id: z.string(),
	status: z.enum(["queued", "preparing", "ready", "failed", "expired", "cancelled"]),
	requestedAt: z.iso.datetime(),
	expiresAt: z.iso.datetime().nullable(),
	failureCode: z.string().nullable(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export const deletionReplayRecordSchema = z.object({
	version: z.literal(1),
	requestId: z.string(),
	subjectUserIds: z.array(z.string()),
	storageScopes: z.array(z.string()),
	requestedAt: z.iso.datetime(),
	activeDataCompletedAt: z.iso.datetime().nullable(),
	completedAt: z.iso.datetime().nullable(),
	sequence: z.number().int().positive(),
	stages: z.object({
		admissionClosed: z.boolean(),
		workQuiesced: z.boolean(),
		renewalsStopped: z.enum(["not_applicable", "confirmed", "pending"]),
		objectsRemoved: z.boolean(),
		databaseRemoved: z.boolean(),
		processors: z.enum(["not_used", "confirmed", "pending"]),
	}),
	exceptions: z.array(
		z.object({
			category: z.enum(["backup_cycle", "legal_record", "processor_pending"]),
			policyRef: z.string(),
			status: z.enum(["pending", "retained", "resolved"]),
		}),
	),
	policyVersion: z.string(),
});
export type DeletionReplayRecordV1 = z.infer<typeof deletionReplayRecordSchema>;
export type DeletionHooks = {
	stopRenewals(input: { requestId: string; userId: string }): Promise<"not_applicable" | "confirmed" | "pending">;
};
export type ProcessorDeletionAdapter = {
	processor: string;
	erase(input: {
		requestId: string;
		processor: string;
		subjectReference: string;
	}): Promise<{ state: "confirmed" | "pending"; receiptRef?: string }>;
};
export type TrashPolicy = { version: string; retentionMs: number; enabled: boolean };
