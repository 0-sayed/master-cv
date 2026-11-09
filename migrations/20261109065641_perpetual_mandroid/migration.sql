CREATE TABLE "career_fact_revision" (
	"user_id" text,
	"fact_id" text,
	"revision" integer,
	"structured" jsonb NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_fact_revision_pkey" PRIMARY KEY("user_id","fact_id","revision"),
	CONSTRAINT "career_fact_snapshot_revision_positive" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "resume_fact_link" (
	"user_id" text NOT NULL,
	"resume_id" text,
	"fact_id" text,
	"accepted_revision" integer NOT NULL,
	CONSTRAINT "resume_fact_link_pkey" PRIMARY KEY("resume_id","fact_id"),
	CONSTRAINT "resume_fact_link_revision_positive" CHECK ("accepted_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "career_fact" ADD COLUMN "structured" jsonb;--> statement-breakpoint
ALTER TABLE "career_fact" ADD COLUMN "proposed_structured" jsonb;--> statement-breakpoint
ALTER TABLE "career_fact" ADD COLUMN "confirmation" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "career_fact" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "career_fact" ADD COLUMN "draft_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "career_profile" ADD COLUMN "profile_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "career_profile" ADD COLUMN "section_order" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "career_profile" ADD COLUMN "welcome_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resume" ADD COLUMN "base_resume_id" text;--> statement-breakpoint
ALTER TABLE "resume" ADD COLUMN "variant_kind" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_owner_id" UNIQUE("user_id","id");--> statement-breakpoint
ALTER TABLE "resume" ADD CONSTRAINT "resume_owner_id" UNIQUE("user_id","id");--> statement-breakpoint
CREATE INDEX "resume_user_id_base_resume_id_index" ON "resume" ("user_id","base_resume_id");--> statement-breakpoint
CREATE INDEX "resume_fact_link_user_id_fact_id_accepted_revision_index" ON "resume_fact_link" ("user_id","fact_id","accepted_revision");--> statement-breakpoint
ALTER TABLE "career_fact_revision" ADD CONSTRAINT "career_fact_revision_7G9HounBZ2iq_fkey" FOREIGN KEY ("user_id","fact_id") REFERENCES "career_fact"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume" ADD CONSTRAINT "resume_base_owner_fk" FOREIGN KEY ("user_id","base_resume_id") REFERENCES "resume"("user_id","id");--> statement-breakpoint
ALTER TABLE "resume_fact_link" ADD CONSTRAINT "resume_fact_link_user_id_resume_id_resume_user_id_id_fkey" FOREIGN KEY ("user_id","resume_id") REFERENCES "resume"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "resume_fact_link" ADD CONSTRAINT "resume_fact_link_Ir6OFaK12jTp_fkey" FOREIGN KEY ("user_id","fact_id","accepted_revision") REFERENCES "career_fact_revision"("user_id","fact_id","revision");--> statement-breakpoint
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_revision_positive" CHECK ("revision" > 0);--> statement-breakpoint
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_draft_revision_nonnegative" CHECK ("draft_revision" >= 0);--> statement-breakpoint
ALTER TABLE "career_fact" ADD CONSTRAINT "career_fact_confirmation_valid" CHECK ("confirmation" IN ('pending', 'confirmed') AND ("confirmation" <> 'confirmed' OR "structured" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "resume" ADD CONSTRAINT "resume_variant_valid" CHECK (("variant_kind" = 'base' AND "base_resume_id" IS NULL) OR ("variant_kind" IN ('language','job') AND "base_resume_id" IS NOT NULL AND "base_resume_id" <> "id"));