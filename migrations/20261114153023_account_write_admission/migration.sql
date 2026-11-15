-- Defense in depth for stale auth callbacks and writers that do not use the shared lock.
-- Narrow SECURITY DEFINER accounting/erasure functions execute as the schema owner;
-- the restricted application login cannot assume that role.
CREATE FUNCTION public.master_cv_guard_account_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE subject text; pending timestamptz; item jsonb := to_jsonb(NEW); existing jsonb;
BEGIN
 IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=TG_RELID) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='user' THEN
   IF TG_OP='UPDATE' AND OLD.data_deletion_requested_at IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_DELETION_PENDING'; END IF;
   RETURN NEW;
 END IF;
 subject := item ->> TG_ARGV[0];
 IF TG_TABLE_NAME IN ('oauth_client','oauth_refresh_token','oauth_access_token','oauth_consent') THEN subject:=coalesce(subject,item->>'reference_id'); END IF;
 IF TG_ARGV[0]='resume_id' THEN SELECT user_id INTO subject FROM public.resume WHERE id=subject;
 ELSIF TG_ARGV[0]='client_id' THEN SELECT coalesce(user_id,reference_id) INTO subject FROM public.oauth_client WHERE client_id=subject;
 ELSIF TG_ARGV[0]='value' THEN
   subject := public.master_cv_verification_owner(subject);
   IF subject IS NULL AND starts_with(item->>'identifier','2fa-attempts-') THEN
     SELECT public.master_cv_verification_owner(value) INTO subject FROM public.verification WHERE identifier=substr(item->>'identifier',14);
   END IF;
 END IF;
 IF subject IS NULL OR subject='' THEN RETURN NEW; END IF;
 SELECT data_deletion_requested_at INTO pending FROM public."user" WHERE id=subject FOR NO KEY UPDATE;
 IF FOUND AND pending IS NULL THEN RETURN NEW; END IF;
 IF pending IS NOT NULL AND TG_TABLE_NAME='ai_operation_attempt' AND TG_OP='UPDATE' THEN
   existing:=to_jsonb(OLD);
   IF (item - ARRAY['outcome','finished_at','cost_micros','input_tokens','output_tokens','cached_tokens']) =
      (existing - ARRAY['outcome','finished_at','cost_micros','input_tokens','output_tokens','cached_tokens']) THEN RETURN NEW; END IF;
 END IF;
 IF pending IS NOT NULL AND TG_TABLE_NAME='ai_usage_ledger' AND TG_OP='INSERT' AND item->>'kind' IN ('settle','release') THEN RETURN NEW; END IF;
 IF pending IS NOT NULL AND TG_TABLE_NAME='agent_threads' AND TG_OP='UPDATE'
 AND item->>'active_run_id' IS NULL AND item->>'active_stream_id' IS NULL AND item->>'active_run_started_at' IS NULL
 AND (item-ARRAY['active_run_id','active_stream_id','active_run_started_at','updated_at'])=
 (to_jsonb(OLD)-ARRAY['active_run_id','active_stream_id','active_run_started_at','updated_at']) THEN RETURN NEW; END IF;
 -- Unknown verification references are Better Auth's global, expiring ceremonies.
 IF NOT FOUND AND TG_ARGV[0]='value' THEN RETURN NEW; END IF;
 IF pending IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_DELETION_PENDING'; END IF;
 RAISE EXCEPTION 'ACCOUNT_UNAVAILABLE';
END;
$$;
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY[
 'ai_providers','agent_threads','agent_messages','agent_attachments','agent_actions',
 'ai_operation','ai_operation_attempt','ai_usage_ledger','ai_processing_consent','application',
 'career_profile','job_target','job_target_revision','career_fact','career_fact_revision','career_story',
 'career_artifact','career_schedule','career_job','career_notification','career_opportunity','career_workspace','career_transcript',
 'session','account','two_factor','passkey','oauth_client','oauth_refresh_token','oauth_access_token','oauth_consent',
 'cover_letter','cover_letter_version','resume','resume_fact_link','resume_job_selection','resume_variant_source',
 'resume_version','resume_slug_redirect','web_access_credentials','ai_content_report','ai_import_review_source','ai_review_decision',
 'account_email_change','account_action_proof','stored_file','account_data_export'
 ] LOOP
  EXECUTE format('CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write(%L)',table_name,'user_id');
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['resume_statistics','resume_statistics_daily'] LOOP
  EXECUTE format('CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write(%L)',table_name,'resume_id');
 END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write('id');
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON public.apikey FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write('reference_id');
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON public.oauth_client_resource FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write('client_id');
CREATE TRIGGER account_admission BEFORE INSERT OR UPDATE ON public.verification FOR EACH ROW EXECUTE FUNCTION public.master_cv_guard_account_write('value');
