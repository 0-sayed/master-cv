CREATE TABLE "ai_import_review_source" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"digest" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"section" text NOT NULL,
	"selection" text NOT NULL,
	"partial" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_review_source_version" CHECK ("schema_version" = 1)
);
--> statement-breakpoint
ALTER TABLE "ai_import_review_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_review_decision" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"resume_id" text,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"event" text NOT NULL,
	"subject_ids" jsonb NOT NULL,
	"previous_decision_id" text,
	"changes" jsonb DEFAULT '[]' NOT NULL,
	"evidence" jsonb,
	"before_revision" text,
	"after_revision" text,
	"history_version_id" text,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_review_decision_user_id_request_key_unique" UNIQUE("user_id","request_key"),
	CONSTRAINT "ai_review_event_valid" CHECK ("event" IN ('accept','reject','undo','accept_edited','answer','dismiss_question'))
);
--> statement-breakpoint
ALTER TABLE "ai_review_decision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ai_import_review_source_user_id_expires_at_index" ON "ai_import_review_source" ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "ai_review_decision_user_id_operation_id_index" ON "ai_review_decision" ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "ai_review_decision_user_id_resume_id_index" ON "ai_review_decision" ("user_id","resume_id");--> statement-breakpoint
ALTER TABLE "ai_import_review_source" ADD CONSTRAINT "ai_import_review_source_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_review_decision" ADD CONSTRAINT "ai_review_decision_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_review_decision" ADD CONSTRAINT "ai_review_decision_8NwbYNTCBsfB_fkey" FOREIGN KEY ("user_id","operation_id") REFERENCES "ai_operation"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_review_decision" ADD CONSTRAINT "ai_review_decision_user_id_resume_id_resume_user_id_id_fkey" FOREIGN KEY ("user_id","resume_id") REFERENCES "resume"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_import_review_source" AS PERMISSIVE FOR ALL TO public USING ("ai_import_review_source"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_import_review_source"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "ai_review_decision" AS PERMISSIVE FOR ALL TO public USING ("ai_review_decision"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("ai_review_decision"."user_id" = NULLIF(current_setting('app.user_id', true), ''));
--> statement-breakpoint
ALTER TABLE ai_import_review_source FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_review_decision FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Preserve restricted role credentials while adding only the required review privileges.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND NOT rolbypassrls
    AND has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'INSERT')
    AND NOT has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'UPDATE')
    AND NOT pg_has_role(oid,(SELECT relowner FROM pg_class WHERE oid=to_regclass(format('%I.career_fact_revision',current_schema()))),'MEMBER')
  LOOP
    EXECUTE format('GRANT SELECT,INSERT,DELETE ON ai_import_review_source TO %I',r.rolname);
    EXECUTE format('REVOKE UPDATE,TRUNCATE ON ai_import_review_source FROM %I',r.rolname);
    EXECUTE format('GRANT SELECT,INSERT ON ai_review_decision TO %I',r.rolname);
    EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON ai_review_decision FROM %I',r.rolname);
  END LOOP;
END $$;
