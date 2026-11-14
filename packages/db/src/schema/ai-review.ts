import type { ReviewDecisionView, ReviewEvidence, ReviewProposal } from "@reactive-resume/schema/resume/ai-review";
import type { VariantDecisionPayload } from "@reactive-resume/schema/resume/variants";
import { sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";
import { generateId } from "@reactive-resume/utils/string";
import { aiOperation } from "./ai-operation";
import { user } from "./auth";
import { discoveryPolicy, ownerPolicy } from "./ownership";
import { resume } from "./resume";

export const aiImportReviewSource = pg.pgTable.withRLS(
	"ai_import_review_source",
	{
		id: pg
			.text("id")
			.primaryKey()
			.$defaultFn(() => generateId()),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		flowId: pg.text("flow_id").notNull(),
		digest: pg.text("digest").notNull(),
		schemaVersion: pg.integer("schema_version").notNull().default(1),
		section: pg.text("section").notNull(),
		selection: pg.text("selection").notNull(),
		partial: pg.boolean("partial").notNull(),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		expiresAt: pg.timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(t) => [
		ownerPolicy(t.userId),
		discoveryPolicy(),
		pg.index().on(t.userId, t.expiresAt),
		pg.check("ai_review_source_version", sql`${t.schemaVersion} = 1`),
	],
);

export type ReviewDecisionEvent = "accept" | "reject" | "undo" | "accept_edited" | "answer" | "dismiss_question";
export const aiReviewDecision = pg.pgTable.withRLS(
	"ai_review_decision",
	{
		id: pg
			.text("id")
			.primaryKey()
			.$defaultFn(() => generateId()),
		userId: pg
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		operationId: pg.text("operation_id").notNull(),
		resumeId: pg.text("resume_id"),
		requestKey: pg.text("request_key").notNull(),
		fingerprint: pg.text("fingerprint").notNull(),
		event: pg.text("event").notNull().$type<ReviewDecisionEvent>(),
		subjectIds: pg.jsonb("subject_ids").notNull().$type<string[]>(),
		previousDecisionId: pg.text("previous_decision_id"),
		changes: pg.jsonb("changes").notNull().$type<ReviewProposal[]>().default([]),
		variantPayload: pg.jsonb("variant_payload").$type<VariantDecisionPayload>(),
		evidence: pg.jsonb("evidence").$type<ReviewEvidence>(),
		beforeRevision: pg.text("before_revision"),
		afterRevision: pg.text("after_revision"),
		historyVersionId: pg.text("history_version_id"),
		response: pg.jsonb("response").$type<ReviewDecisionView>(),
		createdAt: pg.timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.unique().on(t.userId, t.requestKey),
		pg.index().on(t.userId, t.operationId),
		pg.index().on(t.userId, t.resumeId),
		pg
			.foreignKey({ columns: [t.userId, t.operationId], foreignColumns: [aiOperation.userId, aiOperation.id] })
			.onDelete("cascade"),
		pg.foreignKey({ columns: [t.userId, t.resumeId], foreignColumns: [resume.userId, resume.id] }).onDelete("cascade"),
		pg.check(
			"ai_review_event_valid",
			sql`${t.event} IN ('accept','reject','undo','accept_edited','answer','dismiss_question')`,
		),
	],
);
