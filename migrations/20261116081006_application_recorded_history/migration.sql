ALTER TABLE "application" ADD COLUMN "sent_resume_recorded_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "application" AS a SET "sent_resume_recorded_at" = rv."created_at" FROM "resume_version" AS rv WHERE rv."id" = a."sent_resume_version_id";
