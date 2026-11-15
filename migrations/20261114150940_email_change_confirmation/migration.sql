CREATE TABLE "account_email_change" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"previous_email" text NOT NULL,
	"new_email" text NOT NULL,
	"locale" text NOT NULL,
	"request_nonce" text NOT NULL,
	"token_hash" text NOT NULL,
	"stage" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_change_stage" CHECK ("stage" IN ('confirm_old','verify_new','complete','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "account_email_change" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "account_email_change_user_id_index" ON "account_email_change" ("user_id");--> statement-breakpoint
ALTER TABLE "account_email_change" ADD CONSTRAINT "account_email_change_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "owner_access" ON "account_email_change" AS PERMISSIVE FOR ALL TO public USING ("account_email_change"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("account_email_change"."user_id" = NULLIF(current_setting('app.user_id', true), ''));
--> statement-breakpoint
ALTER TABLE account_email_change FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.master_cv_invalidate_account_proofs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE subject text; previous_owner text;
BEGIN
 IF TG_TABLE_NAME='user' THEN subject := NEW.id;
 ELSIF TG_OP='DELETE' THEN subject := OLD.user_id;
 ELSE subject := NEW.user_id;
 END IF;
 previous_owner := current_setting('app.user_id',true);
 PERFORM set_config('app.user_id',subject,true);
 DELETE FROM public.account_action_proof WHERE user_id=subject;
 UPDATE public.account_email_change SET stage='cancelled' WHERE user_id=subject AND stage IN ('confirm_old','verify_new');
 PERFORM set_config('app.user_id',coalesce(previous_owner,''),true);
 RETURN NULL;
END;
$$;
