ALTER TABLE "application" ADD COLUMN "sent_resume_recorded_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "application" SET "sent_resume_recorded_at" = "updated_at" WHERE "sent_resume_version_id" IS NOT NULL;
