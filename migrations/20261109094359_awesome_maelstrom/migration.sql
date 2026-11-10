CREATE POLICY "shared_read" ON "resume" AS PERMISSIVE FOR SELECT TO public USING ("resume"."is_public" = true AND "resume"."trashed_at" IS NULL);--> statement-breakpoint
CREATE POLICY "shared_read" ON "resume_slug_redirect" AS PERMISSIVE FOR SELECT TO public USING ("resume_slug_redirect"."expires_at" > now() AND EXISTS (
				SELECT 1 FROM resume WHERE resume.id = "resume_slug_redirect"."resume_id" AND resume.user_id = "resume_slug_redirect"."user_id"
				AND resume.is_public = true AND resume.trashed_at IS NULL
			));