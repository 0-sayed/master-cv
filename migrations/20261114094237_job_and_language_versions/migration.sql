CREATE TABLE "job_target" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_target_owner_id" UNIQUE("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "job_target" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_target_revision" (
	"user_id" text,
	"job_id" text,
	"revision" text,
	"role" text NOT NULL,
	"employer" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_target_revision_pkey" PRIMARY KEY("user_id","job_id","revision"),
	CONSTRAINT "job_target_text_bounded" CHECK (length("text") > 0 AND octet_length("text") <= 128000)
);
--> statement-breakpoint
ALTER TABLE "job_target_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resume_job_selection" (
	"user_id" text NOT NULL,
	"resume_id" text PRIMARY KEY,
	"job_id" text NOT NULL,
	"job_revision" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_job_selection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resume_variant_source" (
	"user_id" text NOT NULL,
	"resume_id" text PRIMARY KEY,
	"source_resume_id" text,
	"source_revision" text NOT NULL,
	"target_locale" text,
	"job_id" text,
	"job_revision" text,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"accepted_source_revision" text,
	"accepted_fact_revisions" jsonb DEFAULT '[]' NOT NULL,
	"terminology" jsonb DEFAULT '{"schemaVersion":1,"terms":[]}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resume_variant_request_unique" UNIQUE("user_id","request_key"),
	CONSTRAINT "resume_variant_job_pair" CHECK (("job_id" IS NULL) = ("job_revision" IS NULL)),
	CONSTRAINT "resume_variant_locale_valid" CHECK ("target_locale" IS NULL OR "target_locale" IN ('ar-SA','en-US')),
	CONSTRAINT "resume_variant_provenance_bounded" CHECK (jsonb_array_length("accepted_fact_revisions") <= 500 AND jsonb_array_length("terminology"->'terms') <= 500 AND octet_length("terminology"::text) <= 4194304)
);
--> statement-breakpoint
ALTER TABLE "resume_variant_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_review_decision" ADD COLUMN "variant_payload" jsonb;--> statement-breakpoint
CREATE INDEX "job_target_revision_user_id_job_id_created_at_index" ON "job_target_revision" ("user_id","job_id","created_at");--> statement-breakpoint
CREATE INDEX "resume_job_selection_user_id_job_id_job_revision_index" ON "resume_job_selection" ("user_id","job_id","job_revision");--> statement-breakpoint
CREATE INDEX "resume_variant_source_user_id_source_resume_id_index" ON "resume_variant_source" ("user_id","source_resume_id");--> statement-breakpoint
CREATE INDEX "resume_variant_source_user_id_job_id_job_revision_index" ON "resume_variant_source" ("user_id","job_id","job_revision");--> statement-breakpoint
ALTER TABLE "job_target" ADD CONSTRAINT "job_target_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_target_revision" ADD CONSTRAINT "job_target_revision_user_id_job_id_job_target_user_id_id_fkey" FOREIGN KEY ("user_id","job_id") REFERENCES "job_target"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_job_selection" ADD CONSTRAINT "resume_job_selection_user_id_resume_id_resume_user_id_id_fkey" FOREIGN KEY ("user_id","resume_id") REFERENCES "resume"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_job_selection" ADD CONSTRAINT "resume_job_selection_kNvM8p9WtRE6_fkey" FOREIGN KEY ("user_id","job_id","job_revision") REFERENCES "job_target_revision"("user_id","job_id","revision") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_variant_source" ADD CONSTRAINT "resume_variant_source_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_variant_source" ADD CONSTRAINT "resume_variant_source_user_id_resume_id_resume_user_id_id_fkey" FOREIGN KEY ("user_id","resume_id") REFERENCES "resume"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_variant_source" ADD CONSTRAINT "resume_variant_source_J9OeYbh21Vwv_fkey" FOREIGN KEY ("user_id","source_resume_id") REFERENCES "resume"("user_id","id");--> statement-breakpoint
ALTER TABLE "resume_variant_source" ADD CONSTRAINT "resume_variant_source_ZFT6BGlfQlir_fkey" FOREIGN KEY ("user_id","job_id","job_revision") REFERENCES "job_target_revision"("user_id","job_id","revision");--> statement-breakpoint
CREATE POLICY "owner_access" ON "job_target" AS PERMISSIVE FOR ALL TO public USING ("job_target"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("job_target"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_read" ON "job_target_revision" AS PERMISSIVE FOR SELECT TO public USING ("job_target_revision"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_append" ON "job_target_revision" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("job_target_revision"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_delete" ON "job_target_revision" AS PERMISSIVE FOR DELETE TO public USING ("job_target_revision"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_job_selection" AS PERMISSIVE FOR ALL TO public USING ("resume_job_selection"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("resume_job_selection"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_variant_source" AS PERMISSIVE FOR ALL TO public USING ("resume_variant_source"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("resume_variant_source"."user_id" = NULLIF(current_setting('app.user_id', true), ''));
--> statement-breakpoint
ALTER TABLE "job_target" FORCE ROW LEVEL SECURITY;
ALTER TABLE "job_target_revision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "resume_job_selection" FORCE ROW LEVEL SECURITY;
ALTER TABLE "resume_variant_source" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Extend existing restricted runtime grants without rotating credentials.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND NOT rolbypassrls
    AND has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'INSERT')
    AND NOT has_table_privilege(oid,format('%I.career_fact_revision',current_schema()),'UPDATE')
    AND NOT pg_has_role(oid,(SELECT relowner FROM pg_class WHERE oid=to_regclass(format('%I.career_fact_revision',current_schema()))),'MEMBER')
  LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON job_target,resume_job_selection,resume_variant_source TO %I',r.rolname);
    EXECUTE format('GRANT SELECT,INSERT,DELETE ON job_target_revision TO %I',r.rolname);
    EXECUTE format('REVOKE UPDATE,TRUNCATE ON job_target_revision FROM %I',r.rolname);
  END LOOP;
END $$;
