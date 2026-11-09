ALTER TABLE "career_artifact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_fact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_fact_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_notification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_opportunity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_schedule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_story" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_transcript" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "career_workspace" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume_fact_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume_slug_redirect" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume_statistics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume_statistics_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resume_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_artifact" AS PERMISSIVE FOR ALL TO public USING ("career_artifact"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_artifact"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_fact" AS PERMISSIVE FOR ALL TO public USING ("career_fact"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_fact"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_fact_revision" AS PERMISSIVE FOR ALL TO public USING ("career_fact_revision"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_fact_revision"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_job" AS PERMISSIVE FOR ALL TO public USING ("career_job"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_job"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_notification" AS PERMISSIVE FOR ALL TO public USING ("career_notification"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_notification"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_opportunity" AS PERMISSIVE FOR ALL TO public USING ("career_opportunity"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_opportunity"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_profile" AS PERMISSIVE FOR ALL TO public USING ("career_profile"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_profile"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_schedule" AS PERMISSIVE FOR ALL TO public USING ("career_schedule"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_schedule"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_story" AS PERMISSIVE FOR ALL TO public USING ("career_story"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_story"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_transcript" AS PERMISSIVE FOR ALL TO public USING ("career_transcript"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_transcript"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "career_workspace" AS PERMISSIVE FOR ALL TO public USING ("career_workspace"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("career_workspace"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume" AS PERMISSIVE FOR ALL TO public USING ("resume"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("resume"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_fact_link" AS PERMISSIVE FOR ALL TO public USING ("resume_fact_link"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("resume_fact_link"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_slug_redirect" AS PERMISSIVE FOR ALL TO public USING ("resume_slug_redirect"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("resume_slug_redirect"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_statistics" AS PERMISSIVE FOR ALL TO public USING (EXISTS (SELECT 1 FROM resume WHERE resume.id = "resume_statistics"."resume_id" AND resume.user_id = NULLIF(current_setting('app.user_id', true), ''))) WITH CHECK (EXISTS (SELECT 1 FROM resume WHERE resume.id = "resume_statistics"."resume_id" AND resume.user_id = NULLIF(current_setting('app.user_id', true), '')));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_statistics_daily" AS PERMISSIVE FOR ALL TO public USING (EXISTS (SELECT 1 FROM resume WHERE resume.id = "resume_statistics_daily"."resume_id" AND resume.user_id = NULLIF(current_setting('app.user_id', true), ''))) WITH CHECK (EXISTS (SELECT 1 FROM resume WHERE resume.id = "resume_statistics_daily"."resume_id" AND resume.user_id = NULLIF(current_setting('app.user_id', true), '')));--> statement-breakpoint
CREATE POLICY "owner_access" ON "resume_version" AS PERMISSIVE FOR ALL TO public USING ("resume_version"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("resume_version"."user_id" = NULLIF(current_setting('app.user_id', true), ''));