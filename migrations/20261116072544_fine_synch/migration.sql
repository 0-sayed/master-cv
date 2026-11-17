CREATE TABLE "cover_letter_proposal_decision" (
	"operation_id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"letter_id" text NOT NULL,
	"base_revision" integer NOT NULL,
	"decision" text NOT NULL,
	"request_key" text NOT NULL,
	"version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cover_letter_proposal_decision_user_id_request_key_unique" UNIQUE("user_id","request_key"),
	CONSTRAINT "cover_letter_decision_valid" CHECK ("decision" in ('accept', 'reject')),
	CONSTRAINT "cover_letter_decision_version" CHECK (("decision" = 'accept') = ("version_id" is not null)),
	CONSTRAINT "cover_letter_decision_revision" CHECK ("base_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "cover_letter_proposal_decision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cover_letter" ADD CONSTRAINT "cover_letter_owner_id_unique" UNIQUE("user_id","id");--> statement-breakpoint
CREATE INDEX "cover_letter_proposal_decision_user_id_letter_id_index" ON "cover_letter_proposal_decision" ("user_id","letter_id");--> statement-breakpoint
ALTER TABLE "cover_letter_proposal_decision" ADD CONSTRAINT "cover_letter_proposal_decision_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cover_letter_proposal_decision" ADD CONSTRAINT "cover_letter_proposal_decision_UdhBqLjPRVyt_fkey" FOREIGN KEY ("user_id","operation_id") REFERENCES "ai_operation"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cover_letter_proposal_decision" ADD CONSTRAINT "cover_letter_proposal_decision_rxLQhCdI6MEs_fkey" FOREIGN KEY ("user_id","letter_id") REFERENCES "cover_letter"("user_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "owner_access" ON "cover_letter_proposal_decision" AS PERMISSIVE FOR ALL TO public USING ("cover_letter_proposal_decision"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("cover_letter_proposal_decision"."user_id" = NULLIF(current_setting('app.user_id', true), ''));