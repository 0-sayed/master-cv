CREATE TABLE "account_action_proof" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"action" text NOT NULL,
	"request_nonce" text NOT NULL,
	"token_hash" text UNIQUE,
	"challenge" jsonb,
	"method" text,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_proof_action" CHECK ("action" IN ('export_account','delete_account','change_email')),
	CONSTRAINT "account_proof_duration" CHECK ("expires_at" <= coalesce("verified_at","created_at") + interval '5 minutes'),
	CONSTRAINT "account_proof_verified" CHECK (("token_hash" IS NULL) = ("verified_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "account_action_proof" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_data_export" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"request_nonce" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"locale" text DEFAULT 'ar-SA' NOT NULL,
	"artifact_key" text,
	"digest" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"failure_code" text,
	CONSTRAINT "account_data_export_user_id_request_nonce_unique" UNIQUE("user_id","request_nonce"),
	CONSTRAINT "account_export_status" CHECK ("status" IN ('queued','preparing','ready','failed','expired','cancelled')),
	CONSTRAINT "account_export_ready" CHECK ("status" <> 'ready' OR ("artifact_key" IS NOT NULL AND "digest" IS NOT NULL AND "expires_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "account_data_export" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "account_deletion" (
	"id" text PRIMARY KEY,
	"subject_user_id" text NOT NULL UNIQUE,
	"status" text DEFAULT 'requested' NOT NULL,
	"policy_version" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "account_deletion_status" CHECK ("status" IN ('requested','cancelling_work','removing_active_data','awaiting_processor','blocked','complete'))
);
--> statement-breakpoint
ALTER TABLE "account_deletion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deletion_replay_record" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deletion_replay_record_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version" integer DEFAULT 1 NOT NULL,
	"request_id" text NOT NULL,
	"subject_user_ids" text[] NOT NULL,
	"storage_scopes" text[] NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_data_completed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"admission_closed" boolean DEFAULT true NOT NULL,
	"work_quiesced" boolean DEFAULT false NOT NULL,
	"renewals_stopped" text DEFAULT 'pending' NOT NULL,
	"objects_removed" boolean DEFAULT false NOT NULL,
	"database_removed" boolean DEFAULT false NOT NULL,
	"processors" text DEFAULT 'pending' NOT NULL,
	"exceptions" jsonb DEFAULT '[]' NOT NULL,
	"policy_version" text NOT NULL,
	CONSTRAINT "deletion_replay_version" CHECK ("version" = 1),
	CONSTRAINT "deletion_replay_stages" CHECK ("renewals_stopped" IN ('not_applicable','confirmed','pending') AND "processors" IN ('not_used','confirmed','pending'))
);
--> statement-breakpoint
ALTER TABLE "deletion_replay_record" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "privacy_work" (
	"id" text PRIMARY KEY,
	"user_id" text,
	"kind" text NOT NULL,
	"request_id" text NOT NULL,
	"key" text NOT NULL UNIQUE,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "privacy_work_kind" CHECK ("kind" IN ('export_account','delete_account','purge_document','send_notice','send_support')),
	CONSTRAINT "privacy_work_status" CHECK ("status" IN ('queued','running','retry','complete','cancelled','blocked')),
	CONSTRAINT "privacy_work_lease" CHECK (("lease_token" IS NULL) = ("lease_until" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "privacy_work" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stored_file" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"key" text NOT NULL UNIQUE,
	"purpose" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"digest" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_file_private" CHECK ("visibility" = 'private'),
	CONSTRAINT "stored_file_size" CHECK ("size" >= 0 AND "generation" > 0),
	CONSTRAINT "stored_file_owner_key" CHECK (starts_with("key", 'uploads/' || "user_id" || '/') AND "key" !~ '(^|/)\.\.(/|$)')
);
--> statement-breakpoint
ALTER TABLE "stored_file" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_access_log" (
	"id" text PRIMARY KEY,
	"operator_id" text NOT NULL,
	"request_id" text NOT NULL,
	"purpose" text NOT NULL,
	"disposition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_request" (
	"id" text PRIMARY KEY,
	"user_id" text,
	"request_nonce" text NOT NULL UNIQUE,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"locale" text DEFAULT 'ar-SA' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_subject" CHECK ("subject" IN ('export','plan','privacy','other')),
	CONSTRAINT "support_message_bounds" CHECK (length("message") BETWEEN 1 AND 10000 AND length("email") <= 254 AND "email" !~ '[\r\n]')
);
--> statement-breakpoint
ALTER TABLE "support_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "data_deletion_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "account_action_proof_user_id_session_id_index" ON "account_action_proof" ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "deletion_replay_record_request_id_sequence_index" ON "deletion_replay_record" ("request_id","sequence");--> statement-breakpoint
CREATE INDEX "privacy_work_status_due_at_index" ON "privacy_work" ("status","due_at");--> statement-breakpoint
CREATE INDEX "stored_file_user_id_index" ON "stored_file" ("user_id");--> statement-breakpoint
ALTER TABLE "account_action_proof" ADD CONSTRAINT "account_action_proof_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_action_proof" ADD CONSTRAINT "account_action_proof_session_id_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_data_export" ADD CONSTRAINT "account_data_export_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deletion_replay_record" ADD CONSTRAINT "deletion_replay_record_request_id_account_deletion_id_fkey" FOREIGN KEY ("request_id") REFERENCES "account_deletion"("id");--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "support_request" ADD CONSTRAINT "support_request_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "owner_access" ON "account_action_proof" AS PERMISSIVE FOR ALL TO public USING ("account_action_proof"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("account_action_proof"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "account_data_export" AS PERMISSIVE FOR ALL TO public USING ("account_data_export"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("account_data_export"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "owner_access" ON "account_deletion" AS PERMISSIVE FOR ALL TO public USING ("account_deletion"."subject_user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("account_deletion"."subject_user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "account_deletion" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "deletion_replay_record" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "privacy_work" AS PERMISSIVE FOR ALL TO public USING ("privacy_work"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("privacy_work"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "privacy_work" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "stored_file" AS PERMISSIVE FOR ALL TO public USING ("stored_file"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("stored_file"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "support_access_log" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "support_request" AS PERMISSIVE FOR ALL TO public USING ("support_request"."user_id" = NULLIF(current_setting('app.user_id', true), '')) WITH CHECK ("support_request"."user_id" = NULLIF(current_setting('app.user_id', true), ''));--> statement-breakpoint
CREATE POLICY "discovery_owner_read" ON "support_request" AS PERMISSIVE FOR SELECT TO current_user USING (true);--> statement-breakpoint
ALTER TABLE account_action_proof FORCE ROW LEVEL SECURITY;
ALTER TABLE stored_file FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_work FORCE ROW LEVEL SECURITY;
ALTER TABLE account_data_export FORCE ROW LEVEL SECURITY;
ALTER TABLE account_deletion FORCE ROW LEVEL SECURITY;
ALTER TABLE deletion_replay_record FORCE ROW LEVEL SECURITY;
ALTER TABLE support_request FORCE ROW LEVEL SECURITY;
ALTER TABLE support_access_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION public.master_cv_immutable_privacy_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_PRIVACY_AUDIT' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION public.master_cv_immutable_privacy_audit() FROM PUBLIC;
CREATE TRIGGER deletion_replay_immutable BEFORE UPDATE OR DELETE ON public.deletion_replay_record
FOR EACH ROW EXECUTE FUNCTION public.master_cv_immutable_privacy_audit();
CREATE TRIGGER support_access_immutable BEFORE UPDATE OR DELETE ON public.support_access_log
FOR EACH ROW EXECUTE FUNCTION public.master_cv_immutable_privacy_audit();
--> statement-breakpoint
CREATE FUNCTION public.master_cv_privacy_queue_owners() RETURNS TABLE(user_id text)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT DISTINCT w.user_id FROM public.privacy_work w
 WHERE w.user_id IS NOT NULL AND w.status IN ('queued','retry','running')
 AND w.due_at <= now() AND (w.lease_until IS NULL OR w.lease_until < now())
 ORDER BY w.user_id LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.master_cv_privacy_queue_owners() FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.master_cv_invalidate_account_proofs() RETURNS trigger
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
 PERFORM set_config('app.user_id',coalesce(previous_owner,''),true);
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.master_cv_invalidate_account_proofs() FROM PUBLIC;
CREATE TRIGGER invalidate_user_proofs AFTER UPDATE OF email,two_factor_enabled,data_deletion_requested_at ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.master_cv_invalidate_account_proofs();
CREATE TRIGGER invalidate_password_proofs AFTER UPDATE OF password ON public.account
FOR EACH ROW EXECUTE FUNCTION public.master_cv_invalidate_account_proofs();
CREATE TRIGGER invalidate_passkey_proofs AFTER INSERT OR UPDATE OF user_id,public_key,credential_id OR DELETE ON public.passkey
FOR EACH ROW EXECUTE FUNCTION public.master_cv_invalidate_account_proofs();
CREATE TRIGGER invalidate_mfa_proofs AFTER INSERT OR UPDATE OR DELETE ON public.two_factor
FOR EACH ROW EXECUTE FUNCTION public.master_cv_invalidate_account_proofs();
