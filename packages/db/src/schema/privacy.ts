import { sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";
import { generateId } from "@reactive-resume/utils/string";
import { session, user } from "./auth";
import { discoveryPolicy, ownerPolicy } from "./ownership";

const id = () =>
	pg
		.text("id")
		.primaryKey()
		.$defaultFn(() => generateId());
const time = (name: string) => pg.timestamp(name, { withTimezone: true });
const owner = () =>
	pg
		.text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" });

/** A capability is bound to one persisted transition, never to a mutable email alone. */
export const accountEmailChange = pg.pgTable.withRLS(
	"account_email_change",
	{
		id: id(),
		userId: owner(),
		sessionId: pg.text("session_id").notNull(),
		previousEmail: pg.text("previous_email").notNull(),
		newEmail: pg.text("new_email").notNull(),
		locale: pg.text("locale").notNull(),
		requestNonce: pg.text("request_nonce").notNull(),
		tokenHash: pg.text("token_hash").notNull(),
		approvedTokenHash: pg.text("approved_token_hash"),
		stage: pg.text("stage").notNull(),
		requestedAt: time("requested_at").notNull().defaultNow(),
		expiresAt: time("expires_at").notNull(),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.index().on(t.userId),
		pg.check("email_change_stage", sql`${t.stage} IN ('confirm_old','verify_new','complete','cancelled')`),
	],
);

export const accountActionProof = pg.pgTable.withRLS(
	"account_action_proof",
	{
		id: id(),
		userId: owner(),
		sessionId: pg
			.text("session_id")
			.notNull()
			.references(() => session.id, { onDelete: "cascade" }),
		action: pg.text("action").notNull().$type<"export_account" | "delete_account" | "change_email">(),
		requestNonce: pg.text("request_nonce").notNull(),
		tokenHash: pg.text("token_hash").unique(),
		challenge: pg.jsonb("challenge").$type<{ challenge: string; method: "passkey"; cookie: string }>(),
		method: pg.text("method").$type<"password" | "passkey">(),
		verifiedAt: time("verified_at"),
		expiresAt: time("expires_at").notNull(),
		consumedAt: time("consumed_at"),
		attempts: pg.integer("attempts").notNull().default(0),
		createdAt: time("created_at").notNull().defaultNow(),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.index().on(t.userId, t.sessionId),
		pg.check("account_proof_action", sql`${t.action} IN ('export_account','delete_account','change_email')`),
		pg.check(
			"account_proof_duration",
			sql`${t.expiresAt} <= coalesce(${t.verifiedAt},${t.createdAt}) + interval '5 minutes'`,
		),
		pg.check("account_proof_verified", sql`(${t.tokenHash} IS NULL) = (${t.verifiedAt} IS NULL)`),
	],
);

export const storedFile = pg.pgTable.withRLS(
	"stored_file",
	{
		id: id(),
		userId: owner(),
		key: pg.text("key").notNull().unique(),
		purpose: pg.text("purpose").notNull(),
		visibility: pg.text("visibility").notNull().default("private"),
		contentType: pg.text("content_type").notNull(),
		size: pg.bigint("size", { mode: "number" }).notNull(),
		digest: pg.text("digest").notNull(),
		generation: pg.integer("generation").notNull().default(1),
		revokedAt: time("revoked_at"),
		createdAt: time("created_at").notNull().defaultNow(),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.index().on(t.userId),
		pg.check("stored_file_private", sql`${t.visibility} = 'private'`),
		pg.check("stored_file_size", sql`${t.size} >= 0 AND ${t.generation} > 0`),
		pg.check(
			"stored_file_owner_key",
			sql`starts_with(${t.key}, 'uploads/' || ${t.userId} || '/') AND ${t.key} !~ '(^|/)\\.\\.(/|$)'`,
		),
	],
);

export const privacyWork = pg.pgTable.withRLS(
	"privacy_work",
	{
		id: id(),
		userId: pg.text("user_id"),
		kind: pg.text("kind").notNull(),
		requestId: pg.text("request_id").notNull(),
		key: pg.text("key").notNull().unique(),
		status: pg.text("status").notNull().default("queued"),
		payload: pg.jsonb("payload").$type<Record<string, unknown>>(),
		leaseToken: pg.text("lease_token"),
		leaseUntil: time("lease_until"),
		attempts: pg.integer("attempts").notNull().default(0),
		dueAt: time("due_at").notNull().defaultNow(),
		failureCode: pg.text("failure_code"),
		createdAt: time("created_at").notNull().defaultNow(),
		completedAt: time("completed_at"),
	},
	(t) => [
		ownerPolicy(t.userId),
		discoveryPolicy(),
		pg.index().on(t.status, t.dueAt),
		pg.pgPolicy("queue_owner_write", { for: "all", to: "current_user", using: sql`true`, withCheck: sql`true` }),
		pg.check(
			"privacy_work_kind",
			sql`${t.kind} IN ('export_account','delete_account','purge_document','send_notice','send_support')`,
		),
		pg.check("privacy_work_status", sql`${t.status} IN ('queued','running','retry','complete','cancelled','blocked')`),
		pg.check("privacy_work_lease", sql`(${t.leaseToken} IS NULL) = (${t.leaseUntil} IS NULL)`),
	],
);

export const accountDataExport = pg.pgTable.withRLS(
	"account_data_export",
	{
		id: id(),
		userId: owner(),
		requestNonce: pg.text("request_nonce").notNull(),
		status: pg.text("status").notNull().default("queued"),
		locale: pg.text("locale").notNull().default("ar-SA"),
		artifactKey: pg.text("artifact_key"),
		digest: pg.text("digest"),
		requestedAt: time("requested_at").notNull().defaultNow(),
		expiresAt: time("expires_at"),
		failureCode: pg.text("failure_code"),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.unique().on(t.userId, t.requestNonce),
		pg.check(
			"account_export_status",
			sql`${t.status} IN ('queued','preparing','ready','failed','expired','cancelled')`,
		),
		pg.check(
			"account_export_ready",
			sql`${t.status} <> 'ready' OR (${t.artifactKey} IS NOT NULL AND ${t.digest} IS NOT NULL AND ${t.expiresAt} IS NOT NULL)`,
		),
	],
);

/** Survives subject cascade. No contact details, CV data or delivery payloads. */
export const accountDeletion = pg.pgTable.withRLS(
	"account_deletion",
	{
		id: id(),
		subjectUserId: pg.text("subject_user_id").notNull().unique(),
		status: pg.text("status").notNull().default("requested"),
		policyVersion: pg.text("policy_version").notNull(),
		requestedAt: time("requested_at").notNull().defaultNow(),
		completedAt: time("completed_at"),
	},
	(t) => [
		ownerPolicy(t.subjectUserId),
		discoveryPolicy(),
		pg.check(
			"account_deletion_status",
			sql`${t.status} IN ('requested','cancelling_work','removing_active_data','awaiting_processor','blocked','complete')`,
		),
	],
);

/** Append-versioned restricted projection consumed by backup replay, never a delivery store. */
export const deletionReplayRecord = pg.pgTable.withRLS(
	"deletion_replay_record",
	{
		sequence: pg.bigint("sequence", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
		version: pg.integer("version").notNull().default(1),
		requestId: pg
			.text("request_id")
			.notNull()
			.references(() => accountDeletion.id),
		subjectUserIds: pg.text("subject_user_ids").array().notNull(),
		storageScopes: pg.text("storage_scopes").array().notNull(),
		requestedAt: time("requested_at").notNull().defaultNow(),
		activeDataCompletedAt: time("active_data_completed_at"),
		completedAt: time("completed_at"),
		admissionClosed: pg.boolean("admission_closed").notNull().default(true),
		workQuiesced: pg.boolean("work_quiesced").notNull().default(false),
		renewalsStopped: pg.text("renewals_stopped").notNull().default("pending"),
		objectsRemoved: pg.boolean("objects_removed").notNull().default(false),
		databaseRemoved: pg.boolean("database_removed").notNull().default(false),
		processors: pg.text("processors").notNull().default("pending"),
		exceptions: pg
			.jsonb("exceptions")
			.notNull()
			.$type<
				{
					category: "backup_cycle" | "legal_record" | "processor_pending";
					policyRef: string;
					status: "pending" | "retained" | "resolved";
				}[]
			>()
			.default([]),
		policyVersion: pg.text("policy_version").notNull(),
	},
	(t) => [
		discoveryPolicy(),
		pg.pgPolicy("audit_owner_append", { for: "insert", to: "current_user", withCheck: sql`true` }),
		pg.index().on(t.requestId, t.sequence),
		pg.check("deletion_replay_version", sql`${t.version} = 1`),
		pg.check(
			"deletion_replay_stages",
			sql`${t.renewalsStopped} IN ('not_applicable','confirmed','pending') AND ${t.processors} IN ('not_used','confirmed','pending')`,
		),
	],
);

export const supportRequest = pg.pgTable.withRLS(
	"support_request",
	{
		id: id(),
		userId: pg.text("user_id").references(() => user.id, { onDelete: "cascade" }),
		requestNonce: pg.text("request_nonce").notNull().unique(),
		email: pg.text("email").notNull(),
		subject: pg.text("subject").notNull(),
		message: pg.text("message").notNull(),
		locale: pg.text("locale").notNull().default("ar-SA"),
		status: pg.text("status").notNull().default("received"),
		createdAt: time("created_at").notNull().defaultNow(),
	},
	(t) => [
		ownerPolicy(t.userId),
		discoveryPolicy(),
		pg.check("support_subject", sql`${t.subject} IN ('export','plan','privacy','other')`),
		pg.pgPolicy("intake_owner_write", { for: "all", to: "current_user", using: sql`true`, withCheck: sql`true` }),
		pg.check(
			"support_message_bounds",
			sql`length(${t.message}) BETWEEN 1 AND 10000 AND length(${t.email}) <= 254 AND ${t.email} !~ '[\\r\\n]'`,
		),
	],
);

/** Audit contains identifiers/purpose only; runtime cannot read/write it directly. */
export const supportAccessLog = pg.pgTable.withRLS(
	"support_access_log",
	{
		id: id(),
		operatorId: pg.text("operator_id").notNull(),
		requestId: pg.text("request_id").notNull(),
		purpose: pg.text("purpose").notNull(),
		disposition: pg.text("disposition"),
		createdAt: time("created_at").notNull().defaultNow(),
	},
	() => [
		discoveryPolicy(),
		pg.pgPolicy("audit_owner_append", { for: "insert", to: "current_user", withCheck: sql`true` }),
	],
);
