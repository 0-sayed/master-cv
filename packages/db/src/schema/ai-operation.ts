import type { OperationState, RouteBinding, SourceRevision } from "@reactive-resume/schema/ai-operation";
import { sql } from "drizzle-orm";
import * as pg from "drizzle-orm/pg-core";
import { generateId } from "@reactive-resume/utils/string";
import { user } from "./auth";
import { discoveryPolicy, ownerPolicy } from "./ownership";

const id = () =>
	pg
		.text("id")
		.primaryKey()
		.$defaultFn(() => generateId());
const owner = () =>
	pg
		.text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" });
const timestamp = (name: string) => pg.timestamp(name, { withTimezone: true });

export const aiOperation = pg.pgTable.withRLS(
	"ai_operation",
	{
		id: id(),
		userId: owner(),
		requestKey: pg.text("request_key").notNull(),
		fingerprint: pg.text("fingerprint").notNull(),
		kind: pg.text("kind").notNull(),
		sources: pg.jsonb("sources").notNull().$type<SourceRevision[]>(),
		route: pg.jsonb("route").notNull().$type<RouteBinding>(),
		consentVersion: pg.text("consent_version").notNull(),
		promptVersion: pg.text("prompt_version").notNull(),
		schemaVersion: pg.text("schema_version").notNull(),
		parameters: pg.jsonb("parameters").notNull().$type<Record<string, unknown>>().default({}),
		state: pg.text("state").notNull().$type<OperationState>().default("queued"),
		dueAt: timestamp("due_at").notNull().defaultNow(),
		deadlineAt: timestamp("deadline_at")
			.notNull()
			.default(sql`now() + interval '120 seconds'`),
		leaseToken: pg.text("lease_token"),
		leaseUntil: timestamp("lease_until"),
		deliveredAt: timestamp("delivered_at"),
		result: pg.jsonb("result").$type<Record<string, unknown>>(),
		failureCode: pg.text("failure_code"),
		copyClaim: pg.jsonb("copy_claim").$type<{ variantKind: "language" | "job"; baseResumeId: string }>(),
		budgetId: pg.text("budget_id"),
		reservedMicros: pg.bigint("reserved_micros", { mode: "number" }).notNull().default(0),
		actualMicros: pg.bigint("actual_micros", { mode: "number" }),
		budgetClosed: pg.boolean("budget_closed").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		ownerPolicy(t.userId),
		discoveryPolicy(),
		pg.unique().on(t.userId, t.id),
		pg.unique().on(t.userId, t.requestKey),
		pg.index().on(t.state, t.dueAt),
		pg.index().on(t.userId, t.state),
		pg.check(
			"ai_operation_state_valid",
			sql`${t.state} IN ('queued','running','waiting_review','succeeded','failed','cancel_requested','cancelled')`,
		),
		pg.check(
			"ai_operation_delivery_valid",
			sql`(${t.state} IN ('waiting_review','succeeded')) = (${t.deliveredAt} IS NOT NULL AND ${t.result} IS NOT NULL)`,
		),
	],
);

export const aiOperationAttempt = pg.pgTable.withRLS(
	"ai_operation_attempt",
	{
		id: id(),
		userId: owner(),
		operationId: pg.text("operation_id").notNull(),
		ordinal: pg.integer("ordinal").notNull(),
		stepId: pg.text("step_id").notNull(),
		leaseToken: pg.text("lease_token").notNull().default(""),
		startedAt: timestamp("started_at").notNull().defaultNow(),
		finishedAt: timestamp("finished_at"),
		outcome: pg.text("outcome").notNull().default("unknown"),
		responseId: pg.text("response_id"),
		inputTokens: pg.integer("input_tokens"),
		outputTokens: pg.integer("output_tokens"),
		cachedTokens: pg.integer("cached_tokens"),
		costMicros: pg.bigint("cost_micros", { mode: "number" }),
		output: pg.jsonb("output").$type<Record<string, unknown>>(),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.unique().on(t.operationId, t.ordinal),
		pg
			.foreignKey({ columns: [t.userId, t.operationId], foreignColumns: [aiOperation.userId, aiOperation.id] })
			.onDelete("cascade"),
		pg.check("ai_attempt_ordinal", sql`${t.ordinal} BETWEEN 1 AND 3`),
		pg.check("ai_attempt_cost", sql`${t.costMicros} IS NULL OR ${t.costMicros} >= 0`),
	],
);

export const aiUsageLedger = pg.pgTable.withRLS(
	"ai_usage_ledger",
	{
		id: id(),
		userId: owner(),
		operationId: pg.text("operation_id").notNull(),
		kind: pg.text("kind").notNull().$type<"reserve" | "settle" | "release">(),
		units: pg.integer("units").notNull().default(1),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		ownerPolicy(t.userId),
		pg.index().on(t.userId),
		pg
			.foreignKey({ columns: [t.userId, t.operationId], foreignColumns: [aiOperation.userId, aiOperation.id] })
			.onDelete("cascade"),
		pg
			.uniqueIndex("ai_ledger_reserve_once")
			.on(t.operationId)
			.where(sql`${t.kind} = 'reserve'`),
		pg
			.uniqueIndex("ai_ledger_terminal_once")
			.on(t.operationId)
			.where(sql`${t.kind} IN ('settle','release')`),
		pg.check("ai_ledger_valid", sql`${t.units} = 1 AND ${t.kind} IN ('reserve','settle','release')`),
	],
);

export const aiProcessingConsent = pg.pgTable.withRLS(
	"ai_processing_consent",
	{
		id: id(),
		userId: owner(),
		routeId: pg.text("route_id").notNull(),
		routeRevision: pg.text("route_revision").notNull(),
		noticeVersion: pg.text("notice_version").notNull(),
		purpose: pg.text("purpose").notNull(),
		grantedAt: timestamp("granted_at").notNull().defaultNow(),
		revokedAt: timestamp("revoked_at"),
	},
	(t) => [ownerPolicy(t.userId), pg.unique().on(t.userId, t.routeId, t.routeRevision, t.noticeVersion, t.purpose)],
);

/** No runtime table privileges. Budget admission is through narrow owner-checking functions. */
export const aiPlatformBudget = pg.pgTable.withRLS(
	"ai_platform_budget",
	{
		id: pg.text("id").primaryKey(),
		routeId: pg.text("route_id").notNull(),
		routeRevision: pg.text("route_revision").notNull(),
		windowDate: pg.date("window_date").notNull(),
		capMicros: pg.bigint("cap_micros", { mode: "number" }).notNull(),
		requestCapMicros: pg.bigint("request_cap_micros", { mode: "number" }).notNull(),
		reservedMicros: pg.bigint("reserved_micros", { mode: "number" }).notNull().default(0),
		spentMicros: pg.bigint("spent_micros", { mode: "number" }).notNull().default(0),
		active: pg.integer("active").notNull().default(0),
		concurrency: pg.integer("concurrency").notNull(),
	},
	(t) => [
		pg.pgPolicy("budget_owner", { for: "all", to: "current_user", using: sql`true`, withCheck: sql`true` }),
		pg.unique().on(t.routeId, t.routeRevision, t.windowDate),
		pg.check(
			"ai_budget_finite",
			sql`${t.capMicros} > 0 AND ${t.requestCapMicros} > 0 AND ${t.requestCapMicros} <= ${t.capMicros} AND ${t.concurrency} BETWEEN 1 AND 2 AND ${t.active} >= 0 AND ${t.reservedMicros} >= 0 AND ${t.spentMicros} >= 0`,
		),
	],
);
