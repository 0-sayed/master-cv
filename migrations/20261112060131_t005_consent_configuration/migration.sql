-- Existing grants cannot establish approval for any specific configuration.
ALTER TABLE "ai_processing_consent" ADD COLUMN "config_revision" text NOT NULL DEFAULT '';
ALTER TABLE "ai_processing_consent" ALTER COLUMN "config_revision" DROP DEFAULT;
